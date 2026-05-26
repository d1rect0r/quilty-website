# DynamoDB access patterns — website tier

> **Status:** Living document; updated in lockstep with any IaC change touching the website's three DynamoDB tables.
> **Policy doc:** [ADR-0016](../adr/0016-dynamodb-data-model-policy.md) is the source of truth for billing / encryption / PITR / Streams / Revisit-Trigger decisions. This file is the per-entity operational map.

---

## 1. Table inventory

The website tier owns three DynamoDB tables in its own AWS account (`development` at Phase 0; `marketing-prod` at Phase 1 per D47):

| Table                                     | Purpose                                                    | Mutable? | Audit role            |
| ----------------------------------------- | ---------------------------------------------------------- | -------- | --------------------- |
| `quilty_website_${stage}_main`            | Mega-table — idempotency + rate-limit + session            | Yes      | Streams → operational |
| `quilty_website_${stage}_consent_current` | Vendor-gate read path — one row per (user, category)       | Yes      | Streams → propagation |
| `quilty_website_${stage}_consent_audit`   | GDPR Art 7(1) + HIPAA-administrative history — append-only | No       | Source-of-truth audit |

All three: PK + SK string keys, `NEW_AND_OLD_IMAGES` Streams, `PAY_PER_REQUEST` billing, AWS-owned key (Phase 0) → CMK (Phase 1), tagged per the `quilty:*` schema in `sst.config.ts`.

---

## 2. Mega-table tenancy (`quilty_website_${stage}_main`)

Four entities cohabit the mega-table; the PK prefix is the entity discriminator:

| Entity           | PK prefix             | SK shape               | TTL attribute | Default TTL       |
| ---------------- | --------------------- | ---------------------- | ------------- | ----------------- |
| Idempotency-Key  | `IDEMP#...`           | `RESPONSE`             | `expires_at`  | 10 minutes        |
| Rate-limit IP    | `RATELIMIT#forms#...` | `WINDOW#{epoch}`       | `expires_at`  | 15 minutes        |
| Rate-limit email | `RATELIMIT#auth#...`  | `WINDOW#{epoch}`       | `expires_at`  | 1 hour            |
| Session          | `USER#{quilty_sub}`   | `SESSION#{session_id}` | `expires_at`  | 8 hours (D52 web) |

The PK discriminator naming follows the Rust backend's `quilty_main` convention (PascalCase or SCREAMING_SNAKE prefix + `#` separator). Future entities added to this table MUST start with a unique PK prefix to preserve query isolation.

**No GSIs at M1.6.** The mega-table is read-by-PK-only at this scale; GSIs are added when a real "list-by-non-PK" access pattern emerges (e.g., "list all sessions for a user" — the only candidate today is the M5+ portal Active Sessions page; defer to that activation).

**No cross-entity transactions today.** DynamoDB `TransactWriteItems` is a future hook; current writes are per-entity atomic operations.

---

## 3. Per-entity access patterns

### 3.1 Idempotency-Key cache

**Purpose:** Stripe-pattern idempotent retries. A retried POST with the same Idempotency-Key returns the cached response envelope without re-running business logic.

**Key shape:**

```
PK: IDEMP#{scope}#{email_hash}#{uuidv7}
SK: RESPONSE
```

- `scope` segments by handler (`contact`, `signup`, `password-reset`) to prevent cross-handler key collisions.
- `email_hash` = SHA-256 of lowercase-trimmed email, truncated to 32 hex chars (per A.4 hash-the-email-before-keying discipline; raw email never appears in PK).
- `uuidv7` = client-generated UUIDv7 (IETF RFC 9562) carrying timestamp + entropy. Sortable, collision-resistant, replaces ULID (functionally equivalent; UUIDv7 wins on RFC track record).

**Attributes:**

- `response_envelope` (S, JSON-encoded `ContactFormResult` or equivalent)
- `request_hash` (S, SHA-256 of the canonicalised request body + content-type + relevant header set — see `packages/api-client` problem-types `idempotency-key-conflict`). Stripe-canon mismatch detection: if a retry arrives with the same Idempotency-Key but a different `request_hash`, the adapter returns a 422 `idempotency-key-conflict` Problem Details envelope instead of replaying the cached response.
- `status` (S, one of `'in_progress' | 'completed' | 'failed'`). Stripe-canon concurrent-retry handling: a second in-flight request with the same key sees `status = 'in_progress'` and returns a 409 `idempotency-key-conflict` Problem Details envelope; the original handler's eventual `PutItem` flips to `'completed'` or `'failed'` and stores the envelope.
- `created_at` (S, ISO 8601)
- `expires_at` (N, epoch seconds — DynamoDB TTL attribute)

**TTL:** 10 minutes. Calibrated to cover (a) accidental double-submit on a form, (b) browser-reload-after-success retry, (c) network-timeout-then-retry. Per Stripe's 24h SLA the canonical floor is much higher; we use 10 minutes because consumer form submission windows are 30s-5min in practice, and 10min covers slow networks without inflating storage cost.

**Access patterns:**

| Op           | DynamoDB call                             | Latency SLA | Frequency             | Billing driver  |
| ------------ | ----------------------------------------- | ----------- | --------------------- | --------------- |
| Claim        | `GetItem` PK=`IDEMP#...` SK=`RESPONSE`    | 5ms p99     | 1× per form submit    | Read units      |
| Store result | `PutItem` with `attribute_not_exists(PK)` | 10ms p99    | 1× per form submit    | Write units     |
| Retry detect | Same `GetItem` returns cached envelope    | 5ms p99     | Rare (≤1% of submits) | Read units      |
| Expiration   | DynamoDB TTL background sweep             | n/a (async) | Continuous            | Free (built-in) |

**Divergence from `quilty_main`:** the auth backend's `quilty_main` carries durable entities with multi-year retention; idempotency rows expire in minutes. The TTL discipline is the operational distinction.

### 3.2 Rate-limit (per-IP)

**Purpose:** Fixed-window-with-eviction per-IP rate limit on form submissions (5 req / 10min / IP). This is the L3 defense layer behind WAF + Cognito threat protection in the canonical 8-piece form pattern (D113). A true sliding-window upgrade (current-bucket + previous-bucket weighted-sum read) is a one-RCU-per-check addition; deferred until burst-boundary lockouts are observed in production (≥10K MAU trigger).

**Key shape:**

```
PK: RATELIMIT#forms#{ip_hash}
SK: WINDOW#{window_start_epoch}
```

- `ip_hash` = SHA-256 of the client IP (from `x-forwarded-for` first hop, falling back to `x-real-ip`), 32 hex chars. Raw IP never appears in PK (HIPAA §164.514(b)(2)(xv) precaution — IP addresses are on the 18-identifier Safe Harbor list).
- `window_start_epoch` = current window's start time as epoch seconds (10-minute windows aligned to UTC).

**Attributes:**

- `window_count` (N, atomic counter — attribute name avoids the DynamoDB reserved word `count` so `UpdateExpression` references don't require an `ExpressionAttributeName` alias at every call site)
- `expires_at` (N, epoch seconds — TTL)

**TTL:** window + 5 minutes (15 minutes total for the 10-minute window). The buffer prevents premature row deletion while a still-open window is being read.

**Access patterns:**

| Op              | DynamoDB call                                                  | Latency SLA | Frequency           | Billing driver |
| --------------- | -------------------------------------------------------------- | ----------- | ------------------- | -------------- |
| Consume + check | `UpdateItem ADD window_count :one` + `RETURN_VALUES = ALL_NEW` | 10ms p99    | 1× per form submit  | Write units    |
| Window roll     | New PK on every window crossing (no explicit rollover op)      | n/a         | 1× per 10min per IP | Write units    |
| Expiration      | DynamoDB TTL sweep                                             | n/a         | Continuous          | Free           |

The `UpdateItem ADD window_count :one` is atomic — no race condition between read and increment. The conditional check happens via `RETURN_VALUES = ALL_NEW` and the application-side comparison against the policy limit. A `ConditionExpression: window_count < :limit` on the same `UpdateItem` is an optional optimization (fails fast at DB rather than app-side compare); the contract test covers both paths.

**Divergence from `quilty_main`:** atomic counter pattern. The Rust backend's `quilty_main` does not use atomic counters; rate-limit is a website-tier-exclusive pattern.

### 3.3 Rate-limit (per-email)

**Purpose:** Fixed-window-with-eviction shadow rate limit per email-hash, defeats IP-rotating bot farms targeting a single account. This is the L4 defense layer in the D113 canonical 8-piece form pattern, paired with the L3 IP-tier limiter (§ 3.2) — either trigger 429s the request.

**Key shape:**

```
PK: RATELIMIT#auth#{email_hash}
SK: WINDOW#{window_start_epoch}
```

- `email_hash` = SHA-256 of lowercase-trimmed email, 32 hex chars (same hash as idempotency PK email_hash, derivable from same source string).
- `window_start_epoch` = current window's start (60-minute windows for auth-adjacent paths; longer than IP windows because targeted attacks span hours).

**Attributes:** identical shape to per-IP entity (`window_count`, `expires_at`).

**TTL:** window + 5 minutes = 65 minutes.

**Access patterns:** identical shape to per-IP entity. Per submission, the contact-form handler consumes BOTH the IP rate-limit AND the email rate-limit; either failure 429s the request.

**Divergence:** distinct PK partition (`RATELIMIT#auth#` vs `RATELIMIT#forms#`) so email-based limits don't interfere with IP-based limits on shared-WiFi legitimate-user scenarios. Same table, different partition.

### 3.4 Session store

**Purpose:** D51 opaque-session-ID lookup. Every authenticated request reads this row to validate the session + check `is_revoked`. Instant revocation (sign-out-everywhere) flips `is_revoked` without invalidating the cookie.

**Key shape:**

```
PK: USER#{quilty_sub}
SK: SESSION#{session_id}
```

- `quilty_sub` = Cognito sub UUID (per A.6 D11 reconciliation — the Cognito sub IS the canonical user identifier; the `quilty_sub` alias remains the API-level naming).
- `session_id` = Crockford-base32, 26 chars, opaque, generated via `crypto.randomBytes` at the BFF (per D51).

**Attributes:**

- `access_token_encrypted` (B, AES-256-GCM via KMS CMK at Phase 1; AWS-owned key Phase 0)
- `refresh_token_encrypted` (B, same encryption posture)
- `created_at` (S, ISO 8601)
- `last_activity_at` (N, epoch seconds — updated on every auth check via conditional `UpdateItem`)
- `device_fingerprint` (S, optional)
- `user_agent` (S, optional)
- `is_revoked` (BOOL)
- `expires_at` (N, epoch seconds — TTL = 8 hours per D52 web posture)

**TTL:** 8 hours for the web client class (D52). Mobile sessions live in Cognito session attributes; they do NOT enter this table.

**Access patterns:**

| Op                     | DynamoDB call                                                                                          | Latency SLA | Frequency                | Billing driver |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ----------- | ------------------------ | -------------- |
| Login                  | `PutItem` new SESSION# row                                                                             | 50ms p99    | 1× per login             | Write units    |
| Auth gate (every req)  | `GetItem` PK+SK                                                                                        | 5ms p99     | ~100×/active-session/day | Read units     |
| Activity bump          | `UpdateItem SET last_activity_at = :now`                                                               | 10ms p99    | 1× per request (lazy)    | Write units    |
| Sign-out (one device)  | `DeleteItem` PK+SK (TTL fallback)                                                                      | 10ms p99    | 1× per signout           | Write units    |
| Sign-out everywhere    | `Query` PK + `UpdateItem SET is_revoked = true` over results                                           | 100ms p99   | 1× per "revoke all"      | Read + write   |
| Account-deletion sweep | `Query` PK=`USER#{quilty_sub}` SK begins_with `SESSION#` + `BatchWriteItem DeleteRequest` over results | 200ms p99   | 1× per account delete    | Read + write   |
| Expiration             | DynamoDB TTL sweep                                                                                     | n/a         | Continuous               | Free           |

**Hot-partition note:** every session for one user lands on the same PK partition. At normal consumer scale (1-5 concurrent sessions per user) this is fine. The bounded threat is a burst-login storm against one user (credential-stuffing or family-shared-account hammering) — bounded structurally by the per-email rate-limit at § 3.3 (L4 defense, 5 req/hour/email) and the per-IP rate-limit at § 3.2 (L3 defense, 5 req/10min/IP). CloudWatch ContributorInsights catches single-partition hot-key in production as the reactive backstop (ADR-0016 Revisit Triggers).

**Account-deletion cascade:** triggered by the `AccountState` lifecycle transition emitted from the account-deletion handler (per D137); the session-store sweep above is the website-side action. The same trigger fires the consent-current cascade (§ 3.5) and produces the audit row in consent-audit (§ 3.6). Sequence: emit `quilty.account.deleted.v1` event → website consumer reads PK, batches `DeleteItem` ≤25 at a time per DynamoDB API limit.

**Divergence from `quilty_main`:** the Rust backend's `quilty_main` carries a similar session row (PK=`USER#{sub}` SK=`SESSION#{session_id}`); the website table mirrors that key shape so future-engineer cognitive load stays bounded. Encryption posture matches.

### 3.5 ConsentState — current (`quilty_website_${stage}_consent_current`)

**Purpose:** D63 vendor-gate read path. Every page load on a consented surface reads this table to decide which analytics / replay / marketing destinations may load. Hot path; latency-sensitive.

**Key shape:**

```
PK: quilty_sub
SK: category
```

- `quilty_sub` = Cognito sub UUID (signed-in users) OR `HMAC-SHA-256(consent_cookie_id, per-stage salt)` for anonymous users (per D63). Salt rotated annually from Secrets Manager.
- `category` ∈ { `analytics`, `replay`, `marketing`, `experiments`, `essential` } (closed set per D63).

**Attributes:**

- `granted_at` (S, ISO 8601, nullable)
- `revoked_at` (S, ISO 8601, nullable; mutually exclusive with the granted state)
- `source` (S, one of `banner` / `gpc` / `dsr` / `account-page`)
- `evidence_hash` (S, SHA-256 of consent string + UI version + locale at grant time)
- `purpose_strings` (L, IAB-aligned purpose-string snapshot)

**TTL:** none. Records persist until the subject withdraws + the legal retention window elapses (managed via account-deletion cascade per D137, not TTL).

**Access patterns:**

| Op                                      | DynamoDB call                                                    | Latency SLA                  | Frequency                 | Billing driver        |
| --------------------------------------- | ---------------------------------------------------------------- | ---------------------------- | ------------------------- | --------------------- |
| Vendor-gate read (5 categories at once) | `BatchGetItem` PK + 5 SKs OR `Query` PK only                     | 5ms p99                      | Every page load (1×/page) | Read units (dominant) |
| Grant / revoke                          | `PutItem` (overwrite the (PK, SK) row)                           | 10ms p99                     | 1× per banner action      | Write units           |
| Account-deletion sweep                  | `Query` PK + `BatchWriteItem DeleteRequest` over 5 category rows | 50ms p99                     | 1× per account delete     | Read + write          |
| Cross-device propagate                  | Streams → EventBridge `quilty.consent.changed.v1`                | ~100ms eventually consistent | Per change                | Free (built-in)       |

**PITR enabled** — this is the mutable source-of-truth; PITR protects against accidental bulk delete.

**Why a separate table** (not folded into the mega-table): the read pattern is `Query` by PK with `BEGINS_WITH` SK filter, OR a `BatchGetItem` of 5 categories. Folding into the mega-table would require either an additional PK prefix discriminator (`CONSENT#{sub}` with SK `current#{category}` — adds an indirection level on the hot path) or a sparse GSI projection. Two tables = cleaner read semantics.

### 3.6 ConsentState — audit (`quilty_website_${stage}_consent_audit`)

**Purpose:** D63 + GDPR Art 7(1) + HIPAA §164.530(j)(2). Demonstrable-consent audit trail; row-per-event, immutable, never overwritten. Joins to `consent_current` via PK.

**Key shape:**

```
PK: quilty_sub
SK: category#<ULID>
```

- `<ULID>` = Crockford-base32, 26 chars, timestamp-bearing + monotonically sortable. Generated at write time.

**Attributes:**

- `granted_at` (S, ISO 8601, nullable)
- `revoked_at` (S, ISO 8601, nullable)
- `source` (S, same enum as current table)
- `evidence_hash` (S, plain SHA-256 of consent string + UI version + locale — content-addressed; survives crypto-shred since it documents WHAT was consented to, not WHO)
- `purpose_strings` (L, snapshot at write time)
- `ip_hash` (S, **HMAC-SHA-256** of the request IP at grant/revoke, keyed with the per-user audit key — D63 audit-of-provenance + GDPR Art 17 crypto-shred substrate, see prose below)
- `user_agent_hash` (S, **HMAC-SHA-256** of UA at grant/revoke, keyed with the per-user audit key — same substrate as `ip_hash`)

**TTL:** none. Retention is 7 years per HIPAA §164.530(j)(2) + GDPR Art 5(1)(e) storage-limitation. Past-retention deletion is the responsibility of the audit-pipeline (Firehose → S3 Object Lock COMPLIANCE mode) per D169, NOT a DynamoDB TTL.

**Access patterns:**

| Op                    | DynamoDB call                                                          | Latency SLA  | Frequency             | Billing driver  |
| --------------------- | ---------------------------------------------------------------------- | ------------ | --------------------- | --------------- |
| Audit write           | `PutItem` (append-only; `attribute_not_exists(SK)` guard)              | 10ms p99     | 1× per consent action | Write units     |
| Subject-rights export | `Query` PK + SK begins_with `category#`                                | 100ms p99    | 1× per DSAR           | Read units      |
| Streams emission      | DynamoDB Stream → EventBridge Pipe → `quilty.consent.changed.audit.v1` | ~100ms async | Per change            | Free (built-in) |

**No PITR.** The append-only invariant means the table cannot lose data via partial writes; PITR's value-add (point-in-time restoration) is moot. Streams + S3 Object Lock provide the durability + immutability guarantee.

**Why a separate table** (not folded into `consent_current` or the mega-table): append-only semantics + 7-year retention + write-once. Folding either way breaks the "current = mutable, audit = immutable" invariant that makes the GDPR Art 7(1) audit-trail defensible.

**GDPR Art 17 erasure path:** The append-only invariant + 7-year retention conflicts with the user's right-to-erasure under GDPR Art 17. The resolution is **crypto-shredding**, scoped to the subject-linkable fields only:

- `ip_hash` and `user_agent_hash` are **HMAC-SHA-256(value, per-user audit key)** — NOT plain SHA-256 as the IP-rate-limit `ip_hash` is. The per-user audit key is provisioned at first audit-write, stored in a key-management adapter (Phase 1: AWS KMS-CMK-backed; Phase 0: salt from Secrets Manager). On erasure, the per-user audit key is destroyed; the `ip_hash` / `user_agent_hash` rows remain in the immutable store but become un-recomputable + un-correlatable to a subject.
- `evidence_hash` stays content-addressed (plain SHA-256 of consent string + UI version + locale). This field documents WHAT was consented to, not WHO consented; it survives erasure intact for audit-of-consent-shape purposes.
- `quilty_sub` in the PK is unchanged — but post-erasure it is a dangling identifier (no record exists at the auth account that maps `quilty_sub` back to a person). The audit row persists but the join key dead-ends.

This matches the OneTrust + Transcend pattern adopted by HIPAA-aligned consumer-health peers. The Rust-backend account-deletion handler owns per-user audit key destruction; the website-side cascade emits the trigger event but does not destroy keys directly.

---

## 4. Cross-cutting invariants

These apply to all three tables; deviation requires an explicit ADR amendment.

1. **Zero PHI by design (D31).** No clinical-shaped field appears in any table's attributes. The `@quilty/security` PHI sanitizer is the chokepoint on inputs; ESLint + dep-cruiser are the structural guards (ADR-0014 Rule 5).
2. **Streams `NEW_AND_OLD_IMAGES` on all tables.** Every mutation is observable for audit + cross-device propagation purposes.
3. **No direct vendor-SDK imports outside `packages/<role>/src/adapters/dynamodb.ts`.** ESLint `no-restricted-imports` enforces. Composition root is the only seam where adapter selection happens (ADR-0010).
4. **Vendor-error translation at the adapter boundary** (ADR-0014 Rule 5). `DynamoDBServiceException` shapes (`ProvisionedThroughputExceededException`, `ConditionalCheckFailedException`, etc.) are mapped to the port's typed-error union before crossing the adapter boundary.
5. **CMK rotation discipline.** When CMK lands at Phase 1, key rotation is annual; deeper cadence requires a coordinated change with `quilty-aws/website-baseline/`.
6. **Removal policy `retain` on all non-preview stages.** `sst remove --stage dev` does NOT delete the dev tables (cost is negligible at zero traffic and the data we lose is dev-only fixture state).
7. **Tag schema.** All three tables carry the eight-tag set from `siteTagsFor(stage)` in `sst.config.ts`. The `quilty:cost-center = marketing` tag enables billing rollup; `quilty:stack = quilty-web-${stage}` enables permission-boundary scoping.
8. **DynamoDB TTL is best-effort with up to ~48h delay.** AWS does not guarantee item deletion exactly at `expires_at`; the background sweep is asynchronous and lag is bounded only by the typical-case "usually within 48h" SLA. **Read-time guard: every adapter that reads a TTL-bearing entity MUST compare the row's `expires_at` against the current epoch and treat `expires_at < now` as item-absent.** Without this guard a recently-expired idempotency key or rate-limit window can re-surface its (stale) data. The Stripe-canon adapters in `packages/api-client/src/adapters/*` enforce this at the adapter boundary; the contract test asserts the behavior under simulated time advancement.
9. **Reserved-word discipline.** DynamoDB reserves a closed set of attribute names that require `ExpressionAttributeNames` aliases. Adapters MUST avoid the reserved set when picking attribute names in this schema. The `window_count` attribute (vs the bare reserved-word `count`) is the canonical example. Reference: <https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ReservedWords.html>.
10. **Per-table alarms.** CloudWatch alarms: throttling (ThrottledRequests > 0 over 5min), hot-key (ContributorInsights enabled on `main` + `consent_current`), error rate (SystemErrors / UserErrors over 5min), item-size approaching 400 KB (custom metric via Streams consumer). Alarm definitions live in `sst.config.ts` and route through SEV taxonomy per D130.

---

## 5. IaC reference

All three tables are provisioned via SST 4.x in `sst.config.ts`. The provisioning blocks land at the first deploy (gated on `quilty-aws/website-baseline/` per the M1 cross-repo blocker). Until that lands, the table definitions live in `sst.config.ts` behind the `defineSiteResources()` gate alongside the Next.js component.

Pseudo-shape:

```ts
const mainTable = new sst.aws.Dynamo(`QuiltyWebsiteMain`, {
  fields: { pk: 'string', sk: 'string' },
  primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
  ttl: 'expires_at',
  stream: 'new-and-old-images',
  // encryption, PITR, removal policy, transforms per ADR-0016 Phase 0/1 matrix
});
```

The naming helper (one source of truth):

```ts
const siteTableName = (stage: string, suffix: 'main' | 'consent_current' | 'consent_audit') =>
  `quilty_website_${stage}_${suffix}`;
```

---

## 6. Update cadence

This file is updated:

- On every IaC change touching a website-owned DynamoDB table.
- On every new entity addition to the mega-table (PK prefix MUST be registered here).
- On every Revisit-Trigger evaluation per ADR-0016 (the trigger conditions + outcome MUST be documented inline as an addendum to the relevant section).
- At sprint close as part of the verification report cross-reference.

Out-of-date sections of this doc are a CI gate via the ADR-cross-reference test (`scripts/check-no-workflow-context.mjs`-adjacent; deferred to the M2 verify pipeline if not already covered).
