# Log retention runbook

> **Decision references:** D127 (CloudWatch retention floor), D129 (OpenTelemetry-aligned log format), D176 (what may land in 6yr-retained logs), D67 (PHI sanitizer chokepoint at `wrapLogger`/`wrapErrorReporter`)
> **Architectural references:** ADR-0010 (composition root), ADR-0005 (security-headers + CSP origin)
> **Owned files:** `sst.config.ts` (`transform.server` args), `packages/observability/src/wrappers/` (logger/error-reporter chokepoint), `packages/security/src/domain/sanitizer.ts` (PHI denylist)
> **Audience:** platform + security; changes require security-team sign-off

## Why 6 years

45 CFR 164.530(j)(2) (HIPAA Privacy Rule, administrative requirement):

> A covered entity must retain the documentation required by paragraph (j)(1) of this section for six years from the date of its creation or the date when it last was in effect, whichever is later.

The website tier holds zero PHI by design (D31), but the audit-log retention floor still applies to:

- authentication events (`sign_in`, `sign_out`, `password_reset_initiated`, `mfa_*`)
- consent state changes (Cerebral-lesson defense surface — D35)
- step-up auth elevations (`elevated_until` extensions per D54)
- session-revocation fan-out events received via EventBridge (`quilty-{env}-auth-events` per D9 revised)

These events are HIPAA-administrative even when the payload contains no PHI, because their presence/absence in retention is itself evidence under audit. Setting Lambda CloudWatch log retention to `"6 years"` (= 2192 days, the SST + AWS-supported retention enum) means the catch-all log group satisfies the audit-log floor without a separate audit-channel pipeline (deferred).

## Today's wiring

`sst.config.ts` `transform.server(args)`:

```typescript
args.logging = {
  ...(typeof args.logging === 'object' ? args.logging : {}),
  retention: '6 years',
  format: 'json',
};
```

SST 4.x's `args.logging.retention` is a closed enum of duration strings (`"1 day"` through `"forever"`); `"6 years"` resolves to 2192 days. `format: 'json'` produces structured JSON log lines that OpenTelemetry collectors (`@vercel/otel` + future OTLP exporter) consume without re-parsing.

Cost estimate at zero traffic (M1-M2): ≤$5/mo per stage. Logs Insights queries at zero-volume are effectively free.

## D176 contract — what may land in 6-year logs

### Permitted

- `boundary` — e.g. `app-error`, `global-error`, `proxy`, `route-handler`
- `error_name` — JavaScript `Error.name` (`TypeError`, `ValidationError`, etc.)
- `digest` — Next.js error digest (12-char hash, no PII)
- hashed actor IDs — SHA256 hex prefix produced by the `@quilty/security` sanitizer's `hashId()`. Pseudonymization gap: today's `hashId()` is unsalted SHA-256, which is reversible against the Cognito user-pool mapping table. A per-stage HMAC-SHA-256 salt injected by the composition root is the planned hardening; until it ships, treat hashed actor IDs as pseudonymous only against external readers (not against anyone with Cognito User Pool read access).
- timestamps (server-side clock)
- HTTP status codes
- static route paths (templated form `/account/[id]`, NOT the materialized `/account/abc-123`)
- feature-flag evaluation context (`flag_name`, `variant`, `actor_hash`)

### Forbidden

- clear-text email addresses
- raw IP addresses (redacted entirely via the sanitizer's `x_forwarded_for` / `cf_connecting_ip` denylist entries; the first-3-octet aggregation pattern referenced in some industry runbooks is a future fraud-analysis path that requires a separate audit-channel scope not present today)
- request / response bodies (free text → PHI risk per the Cerebral lesson)
- session tokens (Cognito or BFF-issued) + `session_id` linkage tokens
- query-string `token=*` values + any query-string fragment
- dynamic route-segment materializations (e.g. logging `/api/session/abc123` instead of the templated `/api/session/[sessionId]`)
- anything matching the `@quilty/security` PHI denylist (the canonical list lives in `packages/security/src/domain/sanitizer.ts`)
- clinical state words even when paraphrased — mood, symptom, diagnosis, severity

### Enforcement

1. **`@quilty/security/sanitizer` chokepoint** — wired at `wrapLogger` + `wrapErrorReporter` (D67 architectural seal per ADR-0010). The wrapper runs the sanitizer over the context object before the underlying vendor SDK sees it. A direct vendor-SDK import outside `lib/observability/` is forbidden by ESLint `no-restricted-imports` and `dependency-cruiser` `no-direct-vendor-sdk-outside-adapter-chokepoint`. `wrapAnalytics` shares the same sanitizer for its consent-gated event payloads but its sink is Amplitude (BAA scope, not CloudWatch) — Amplitude's retention policy is governed by the Amplitude BAA, not by this runbook.

2. **`assertNoPHI` dev-time guard** — throws in development on suspicious keys (`email`, `mood`, `symptom`, `severity`, `diagnosis`, `note`, `journal`, `reflection`). The dev guard prevents a developer from shipping a logger call that the production sanitizer would silently scrub — the dev-time throw is the early-warning surface.

3. **Audit-channel isolation (deferred)** — the audit channel is a separate logger entry at the auth-events EventBridge consumer, not the default app logger. Until that consumer ships, audit events flow through the default app logger + the sanitizer chokepoint catches the PHI-bearing fields.

4. **Future ESLint rule** — a custom rule denying `throw new Error(template-literal with variable interpolation)` is scheduled to block free-text-in-error-message at the source. Until it lands, the wrapErrorReporter sanitizer is the chokepoint.

## Tag schema

Every SST-emitted resource carries the eight-tag canonical set. The two compile-time-typed enum tags below are the AWS Tag Policy alignment surface:

| Tag                  | Type                 | Permitted values                                        | Mandatory | Propagation surface                                 |
| -------------------- | -------------------- | ------------------------------------------------------- | --------- | --------------------------------------------------- |
| `quilty:owner`       | string               | freeform (today: `platform`)                            | yes       | Lambda, CDN, S3 assets, log group (via CDK default) |
| `quilty:service`     | string               | `quilty-website` (stack-stable)                         | yes       | Lambda, CDN, S3 assets, log group                   |
| `quilty:env`         | **QuiltyEnv**        | `dev` \| `preview` \| `prod`                            | yes       | Lambda, CDN, S3 assets, log group                   |
| `quilty:stack`       | string               | `quilty-web-<stage>`                                    | yes       | Lambda, CDN, S3 assets, log group                   |
| `quilty:repo`        | string               | `quilty-website`                                        | yes       | Lambda, CDN, S3 assets, log group                   |
| `quilty:cost-center` | **QuiltyCostCenter** | `marketing` \| `platform` \| `security`                 | yes       | Lambda, CDN, S3 assets, log group                   |
| `workload`           | string               | `quilty-website` (deprecated, kept for backward-compat) | yes       | Lambda, CDN, S3 assets                              |
| `stage`              | string               | raw stage name (deprecated, kept for backward-compat)   | yes       | Lambda, CDN, S3 assets                              |

The `QuiltyEnv` + `QuiltyCostCenter` union types in `sst.config.ts` enforce the permitted-value list at compile time — a typo (`'production'` vs `'prod'`, `'mkt'` vs `'marketing'`) fails `pnpm typecheck` rather than slipping through to Pulumi diff.

**LogGroup tag propagation (today):** `Nextjs.transform.server` exposes the inner Function's full `FunctionArgs`, which itself includes `transform.logGroup` — so the LogGroup IS reachable via the nested `args.transform = { ...args.transform, logGroup(lgArgs, opts) { ... } }` pattern. `sst.config.ts` uses this path to apply the canonical eight-tag set + `retainOnDelete: true` on the dev stage. The earlier reading that this required replacing the Nextjs component with explicit `sst.aws.Function` was incorrect; that workaround is not needed.

## M2+ trigger — tiered export to S3 + Glacier Deep Archive

CloudWatch storage at `$0.03/GB-mo` becomes the dominant log-cost driver above ~5 GB-mo (per stage). At that threshold, the cost-optimal posture is a tiered export:

- CloudWatch (hot, queryable via Logs Insights) — **30-90 day window**
- S3 Standard (warm, queryable via Athena) — **90 days to 1 year**
- Glacier Deep Archive (cold, retrieved on demand) — **1 year to 6 years**

The reference implementation pattern is the AWS Integration blog "Automated CloudWatch Logs retention with EventBridge Scheduler + Lambda" — a periodic export Lambda subscribes the relevant log groups to an S3 archive bucket, the bucket has lifecycle rules into Glacier DA, and Logs Insights queries against the recent window stay fast.

**Trigger to activate:** any stage's CloudWatch storage exceeds 5 GB-mo for 2 consecutive months. Until then, the deliberate 1-month-overhead CloudWatch slice is cheaper than the export-pipeline complexity.

## 6-year clock anchoring

When a Lambda is decommissioned (e.g. a service deprecation removes the SSR function from the stack), the **CloudWatch LogGroup retention setting does NOT change** — the 6-year retention persists for the longer of:

- 6 years from log-group creation, OR
- 6 years from the last log entry being written to the group

The CFR text reads "the date when it last was in effect" — in the context of a CloudWatch log group, we map "last in effect" to the last-write timestamp. This is intentionally conservative: a strict reading might extend the clock only until the policy/process the log group documents ceased to be in effect, which is harder to evidence than the last-write timestamp on the resource itself.

AWS Config conformance pack rule `cloudwatch-log-group-retention-period-check` (planned in `quilty-aws/website-baseline/`) verifies retention >= 2192 days on every log group in the website OU. The app-level `removal: 'retain'` policy in `sst.config.ts` does NOT cover `aws:cloudwatch/logGroup:LogGroup` — SST's `addTransformationToRetainResourcesOnDelete` allowlist scopes to data-bearing resources (S3, DynamoDB, RDS, etc.). The mechanism keeping the log group alive across `sst remove --stage <audit-stage>` is the explicit `retainOnDelete: true` set inside `transform.server.transform.logGroup`. The guard activates for the `dev` stage and every `prod*` stage (the audit-bearing stages). Preview stages are intentionally ephemeral — preview log groups are deleted on stack teardown because preview deployments process no real user auth/consent events. Removing the `retainOnDelete: true` guard on `dev` or `prod*` is the only path that risks losing audit-clock-bound history — DO NOT change without confirming the audit clock has elapsed for every stored event.

### Phase 1 cross-account migration

When `quilty-aws/website-baseline/` vends the Phase 1 `marketing-prod` account (D47 cutover trigger: public launch or first revenue), the website tier deploys into the new account but **the Phase 0 `development` account's existing log groups stay where they are**. CloudWatch has no cross-account log-group migration primitive; copying logs across accounts requires an explicit Logs Insights export + S3 cross-account put — which loses the queryability + the audit-clock continuity.

Phase 1 migration posture:

1. Phase 0 dev-account log groups retain their `retainOnDelete: true` + 6-year retention. Their audit clock continues to run in the dev account.
2. Phase 1 `marketing-prod` deploys with the same `sst.config.ts` retention + tag posture — the new prod stage's log group starts a fresh 6-year clock.
3. Security personnel retain `quilty-dev` SSO access for the duration of any pending audit clock on Phase 0 log groups.
4. Do NOT delete the Phase 0 dev account until every Phase 0 log group has elapsed its 6-year clock.

## Cost ledger

| Tier                 | Storage cost | Query cost                        | Use                                              |
| -------------------- | ------------ | --------------------------------- | ------------------------------------------------ |
| CloudWatch Logs      | $0.03/GB-mo  | $0.005/GB scanned (Logs Insights) | recent operational queries, on-call paging       |
| S3 Standard          | $0.023/GB-mo | $5/TB scanned (Athena)            | 90d-1y warm archive, audit-frequent queries      |
| Glacier Deep Archive | $0.001/GB-mo | $0.02/GB retrieval + 12h SLA      | 1y-6y cold archive, audit + legal-hold retrieval |

The CloudWatch overhead is deliberate — 1 month of overhead at $0.03/GB-mo is cheaper than the per-query cost of Athena scanning over a multi-GB archive when the on-call surface is asking the same questions every day.

## Operational procedures

### Verify retention on every deploy

```bash
aws logs describe-log-groups \
  --profile quilty-dev \
  --query 'logGroups[?retentionInDays==`2192`]' \
  --output table
```

Every log group from this stack should appear with `retentionInDays: 2192`. Anything else is a misconfiguration and should fail the post-deploy smoke check.

### Logs Insights queries for audit

Authentication events over the last 7 days, grouped by hashed actor:

```
fields @timestamp, boundary, error_name, digest, actor_hash
| filter boundary like /^auth-/
| sort @timestamp desc
| stats count() by actor_hash
| limit 100
```

Step-up auth elevations:

```
fields @timestamp, boundary, actor_hash, elevated_until
| filter boundary = 'auth-step-up' and ispresent(elevated_until)
| sort @timestamp desc
| limit 100
```

### Decommission a log group post-audit-clock

DO NOT delete log groups manually. The flow is:

1. Confirm the last-write timestamp on the group + the resource creation timestamp
2. Calculate the longer of (creation + 6yr) and (last-write + 6yr); confirm both are in the past
3. Open a security-team ticket with the calculation + the AWS Config conformance pack evidence
4. After security sign-off, the deletion is a one-line Terraform import + destroy in `quilty-aws/`

## Activation triggers

| When                                                            | Action                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| CloudWatch storage exceeds 5 GB-mo for 2 consecutive months     | Implement the tiered export to S3 + Glacier DA per the AWS Integration blog reference pattern                                               |
| `quilty-aws/website-baseline/` vends the KMS CMK ARN for assets | Apply CMK encryption to the assets S3 bucket via `transform.assets.transform.bucket.serverSideEncryptionConfiguration`                      |
| Audit-channel EventBridge consumer ships                        | Route auth + consent + step-up events through the audit channel directly; relax the default-logger sanitizer scope to operational logs only |
| ESLint rule for PHI-in-error-message ships                      | Tighten the default `throw new Error(...)` template-literal pattern                                                                         |

## What this document is NOT

It is not a substitute for the AWS Artifact-canonical BAA coverage list (canonical source: AWS BAA portal in the master payer account). The PHI invariant on the website tier is enforced by code (`@quilty/security` sanitizer chokepoint), not by paperwork — the BAA is the legal-recourse layer, not the engineering guarantee.

It does not document the audit-channel EventBridge consumer (a separate runbook lands at the consumer ship).
