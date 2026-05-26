# ADR-0016: DynamoDB data-model policy for the website tier

- **Status:** Accepted
- **Date:** 2026-05-26
- **Last reviewed:** 2026-05-26
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** M1.6 Workstream B research (`docs/m1.6_foundation_finishing_plan.md` § B.2); cross-repo agent sweep of `quilty-aws/lambdas/rust/crates/quilty-persistence/`
- **Related decisions:** D31 (zero-PHI website tier), D47 (Phase 0 in `development` account; Phase 1 cutover to `marketing-prod`), D51 (opaque session-ID + DynamoDB store), D52 (per-client refresh-token TTL — 8h web), D63 (two-table ConsentState; current + audit), D113 (canonical 8-piece form pattern — Idempotency-Key + per-IP + per-email rate-limit), D137 (AccountDeleteReason + ClinicalRecordsState lifecycle — account-deletion cascade source), D169 (BAA inventory)
- **Related ADRs:** [ADR-0001](0001-monorepo-shape.md), [ADR-0002](0002-session-cookie-pattern.md), [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md), [ADR-0014](0014-port-adapter-naming.md)
- **Related research:** `docs/research/round_5_independent_review/` (D51 session-store decision); `docs/research/round_6_foundation_audit/_raw/` (D63 two-table consent design)
- **Software versions assumed:** SST 4.14, AWS SDK v3, DynamoDB on-demand billing (PAY_PER_REQUEST), DynamoDB Streams + EventBridge Pipes, KMS Customer Managed Keys (CMK)

## Context

The website tier owns several persistence concerns that need a DynamoDB home:

1. **Idempotency-Key cache** (D113). Currently in-memory at `apps/web/lib/idempotency.ts` (10-minute TTL). Production wiring needs durability across Lambda cold starts + multi-region (later) consistency.
2. **Rate-limit fixed-window counters** (D113 L3 + L4 — per-IP + per-email tiers of the canonical 8-piece form pattern). Currently in-memory at `packages/rate-limit/src/adapters/in-memory.ts` (per-Lambda-instance only). The DynamoDB adapter skeleton exists at `packages/rate-limit/src/adapters/dynamodb.ts`; that file's inline comment describes a list-attribute timestamps shape that predates this ADR and will be replaced by the per-`WINDOW#{epoch}` row shape locked in `docs/architecture/dynamodb-access-patterns.md` § 3.2 when the adapter activates.
3. **Session store** (D51). Opaque session-ID lookup on every authenticated request; instant revocation via `is_revoked` boolean.
4. **ConsentState** (D63). Two roles: (a) high-frequency vendor-gate reads ("is analytics consent granted?"), (b) append-only audit history for GDPR Art 7(1) demonstrable consent + HIPAA-administrative requirements.

The Rust auth backend at `quilty-aws/lambdas/rust/crates/quilty-persistence/` ships a mature single-table design (`quilty_main`, PK=`pk` + SK=`sk`, GSI1 INCLUDE-projection for delta-pull, GSI_TokenFamily sparse KEYS_ONLY for RFC 9700 §4.14 token-family revocation). The website tier could plausibly share that table — but **cross-account constraint (D47) makes this impossible**: at Phase 1 the website lives in `marketing-prod` (Workloads-NonHIPAA OU), while `quilty_main` stays in the auth account (HIPAA-eligible OU). Cross-account DynamoDB reads would add 50-100ms per Lambda cold-start latency + permanent IAM trust-policy surface + PITR/encryption coordination overhead.

The "do nothing" outcome is a proliferation of website-owned feature tables (one per entity), each with its own billing line, encryption boundary, PITR policy, Streams pipeline, and IAM scope. Rick Houlihan / Alex DeBrie canon: at zero-to-consumer scale (≤100K items, ≤10K MAU), the operational overhead of multi-table design exceeds the design clarity benefit. Stripe's pre-2018 architecture + Discord's session-store design both started with a single mega-table and split per bounded context only at the scale-of-pain threshold (millions of MAU + per-domain throughput divergence).

## Decision

**We will provision three DynamoDB tables in the website's own AWS account** (`development` at Phase 0, `marketing-prod` at Phase 1):

1. **`quilty_website_${stage}_main`** — single mega-table carrying ephemeral + opaque-session entities. PK=`pk` (S), SK=`sk` (S). Houlihan canonical.
2. **`quilty_website_${stage}_consent_current`** — high-frequency vendor-gate read path. PK=`quilty_sub` (S), SK=`category` (S). Mutable; one row per (user, category) pair.
3. **`quilty_website_${stage}_consent_audit`** — append-only history per GDPR Art 7(1). PK=`quilty_sub` (S), SK=`category#<ULID>` (S). Never overwritten.

Consent gets two tables (not folded into the mega-table) because single-table forces a sparse SK ambiguity (`category` vs `category#<ULID>`) that breaks GSI range queries.

### Billing + encryption + recovery posture per phase

| Attribute              | Phase 0 (`development`)     | Phase 1 (`marketing-prod`)                                         |
| ---------------------- | --------------------------- | ------------------------------------------------------------------ |
| Billing mode           | `PAY_PER_REQUEST`           | `PAY_PER_REQUEST` (re-evaluate at ≥10K MAU)                        |
| Encryption at rest     | AWS-owned key (SSE-default) | KMS Customer Managed Key (CMK) from `quilty-aws/website-baseline/` |
| Point-in-Time Recovery | `consent_current` only      | `consent_current` + `main` (mutable targets)                       |
| Streams                | `NEW_AND_OLD_IMAGES` on all | Same                                                               |
| Deletion protection    | Off (dev)                   | On (prod)                                                          |
| Removal policy (SST)   | `retain` for dev            | `retain` for prod                                                  |
| DAX caching            | Off                         | Off (activate at ≥100K MAU)                                        |

PITR is intentionally enabled on `consent_current` (mutation target — protects against accidental bulk-delete) and `main` (mutable opaque-session + ephemeral entities) at Phase 1; `consent_audit` is excluded by design because the append-only invariant means there is no partial-write to recover from. Streams + S3 Object Lock COMPLIANCE-mode storage provide the durability + immutability guarantee for the audit table per D169.

### Session-ID encoding (anchored here)

Session identifiers (`session_id` in the `SESSION#{session_id}` SK pattern, used by the `main` table — see § Decision and `docs/architecture/dynamodb-access-patterns.md` § 3.4) are **Crockford-base32, 26 characters, sourced from `crypto.randomBytes(16)` at the BFF**. The encoding is anchored here so a future session-store rewrite has a load-bearing reference rather than implicit policy. The Crockford alphabet excludes `I`/`L`/`O`/`U` to remove case-confusion + accidental-profanity classes; this matches the Stripe / Linear / Plaid opaque-session pattern.

### Streams + EventBridge fan-out

All three tables emit `NEW_AND_OLD_IMAGES` to DynamoDB Streams. `consent_audit` Streams feed an EventBridge Pipe into the existing `quilty-${env}-auth-events` bus (provisioned by `quilty-aws/auth/outbox.tf` per D9) with detail-type `quilty.consent.changed.v1`. The website-side SST stack subscribes via an EventBridge rule but does NOT provision the bus itself (cross-account ownership remains in the auth account).

### Key-shape registry

Per-entity key shapes are documented in `docs/architecture/dynamodb-access-patterns.md`. The website's IaC (`sst.config.ts`) reads table names from a single `siteTableName(stage, suffix)` helper to enforce naming consistency. The helper name avoids collision with the SDK's `TableName` property usage at call sites and is namespaced to the website's IaC scope.

## Consequences

### Positive

- **Cross-account isolation preserved.** The website never reaches into the auth account's `quilty_main`. Phase 1 cutover is an account-ID change, not a re-architecture.
- **Three billing lines, not ten.** On-demand pricing floors cost at zero traffic; predictable scaling.
- **Audit-trail durability by design.** `consent_audit` is append-only + Streams-fed; GDPR Art 7(1) "demonstrable consent" survives accidental deletes via the immutable row-per-event pattern.
- **Operational parity with the Rust backend.** Same key-shape discipline (`PK=pk, SK=sk`), same Streams + Pipe + EventBridge pattern; future engineers move between repos without re-learning conventions.
- **Vendor-swap optionality preserved.** The `@quilty/rate-limit` + planned `@quilty/idempotency` + planned `@quilty/session-store` ports stay vendor-agnostic; `makeDynamoDb<Port>()` adapters wrap the SDK calls per ADR-0014 Rule 5.

### Negative

- **Three tables to monitor.** Per-table CloudWatch alarms, per-table cost-explorer rows, per-table PITR snapshots. Mitigated by SST IaC encoding tagging + alarm policy in one place.
- **Cross-account DynamoDB Streams require IAM trust** for the consumer side (auth account → website account EventBridge bus subscription). The wiring exists per D9 but every deploy must verify the trust policy didn't regress.
- **CMK ARN gate is load-bearing.** Phase 1 cutover blocks on `quilty-aws/website-baseline/` vending the CMK ARN via SSM Parameter. Until then, all three tables use AWS-owned keys — acceptable for non-PHI website data, NOT acceptable once Phase 1 traffic hits.

### Neutral

- The mega-table approach scales out via single-table-per-bounded-context at the trigger thresholds in the "Revisit triggers" section. Splitting later is mechanical (DDB Stream → new-table writes during a dual-write window) and well-precedented (Stripe 2018, Discord 2022).
- DAX is deferred to ≥100K MAU. Until then on-demand reads are noise (~$0.25/month at 1M reads/day). The cluster cost ($100+/mo baseline) is uneconomical pre-scale.

## Alternatives considered

### Alternative A: Per-feature tables (one each for idempotency, rate-limit-ip, rate-limit-email, session, consent-current, consent-audit) — 6 tables

- **What it is:** AWS Prescriptive Guidance recommendation for "bounded context per table" at scale. Each table independently scaled, encrypted, retained.
- **Why rejected:** At our scale (≤100K MAU, ≤10K items per entity), the per-table operational overhead (CloudWatch alarms, billing lines, IAM scopes, PITR policy) exceeds the design clarity benefit. Houlihan's canonical answer: split when throughput-per-entity diverges by an order of magnitude or when bounded-context team ownership demands isolation; neither applies at one-engineer + zero-launch traffic. Stripe + Discord both started with single-table and split per-context at scale-of-pain. The 3-table compromise (1 mega + 2 consent) takes the mega-table win without the audit-table sparse-SK ambiguity.

### Alternative B: Share `quilty_main` cross-account from the auth account (via DynamoDB resource-based policies)

- **What it is:** AWS DynamoDB resource-based policies (shipped March 2024) allow cross-account table access without per-request `AssumeRole` overhead. The website's BFF could read/write `quilty_main` directly via an attached RBP grant.
- **Why rejected:** The technical option exists in 2026, but the rejection rationale is architectural, not latency: (1) Phase 1 architecture explicitly separates `marketing-prod` (Workloads-NonHIPAA OU) from auth (HIPAA-eligible) — sharing `quilty_main` collapses the BAA-boundary that the OU split establishes (D47). (2) Blast-radius: a Lambda compromise in the website tier should not have any access path to PHI-handling tables, even read-only. (3) Couples website deploy cadence to backend's table-shape changes — every backend schema migration becomes a coordinated cross-repo deploy. The latency argument was the original (pre-2024) framing; with RBP + credential caching it's <10ms overhead, not 50-100ms.

### Alternative C: Single mega-table including consent (no separate consent tables)

- **What it is:** Roll `consent_current` + `consent_audit` into `quilty_website_${stage}_main` with key prefixes like `pk=CONSENT_CURRENT#<sub>` + `pk=CONSENT_AUDIT#<sub>`.
- **Why rejected:** The two consent surfaces have fundamentally different access patterns. `consent_current` is read-on-every-page-load (vendor-gate check, ≤5ms p99); `consent_audit` is write-append-only with row-per-event history. Folding both into one table forces a sparse SK pattern (`category` vs `category#<ULID>`) that breaks GSI range queries on consent-by-category. Two tables = clean semantics + each table's read/write pattern can be tuned independently (PITR on current only; Streams on both but different EventBridge detail-types).

### Alternative D: Redis (Upstash, AWS ElastiCache) for ephemeral entities (idempotency + rate-limit)

- **What it is:** Use Redis for sub-millisecond reads on the high-frequency ephemeral data; keep DynamoDB for the durable entities (session, consent).
- **Why rejected:** (1) Adds a vendor BAA (Upstash) or VPC infrastructure (ElastiCache) for no operational gain — DynamoDB on-demand atomic counters are ≤5ms p99, well within our SLA. (2) If DynamoDB is down, the website is down anyway (it powers auth + forms). Adding Redis adds a second failure mode with no compensating availability gain. (3) Snowflake-shaped vendor lock-in on the rate-limit + idempotency path is a real architectural tax later.

### Alternative E: Hybrid — website-owned tables for ephemeral entities + cross-account RBP access to `quilty_main` for read-only user lookups

- **What it is:** Use website-owned tables for the ephemeral surface (idempotency, rate-limit, session) but reach into the auth account via DynamoDB resource-based policies (2024+) for read-only user profile lookups.
- **Why rejected:** Same BAA-boundary + blast-radius reasoning as Alternative B. The marginal value (avoid one `UserProfile` row replication) does not justify the cross-account read path. The website tier reads `quilty_sub` from the verified JWT — it does NOT need to read the user-profile table directly.

## Compliance / Verification

- `sst.config.ts` defines all three tables via `sst.aws.Dynamo` constructs; deploy fails if any required attribute (encryption, PITR per phase, Streams, deletion protection) is missing.
- ESLint + dep-cruiser rules prohibit direct `@aws-sdk/client-dynamodb` imports outside `packages/<role>/src/adapters/dynamodb.ts` adapter files (ADR-0014 Rule 5).
- Contract test at each adapter boundary asserts: vendor-error → port-error translation; Sentry context enrichment from problem-types (forthcoming ADR-0017, landing with M1.6 B.1+B.3 commit per `docs/m1.6_foundation_finishing_plan.md`); per-entity TTL behavior under simulated time advancement; read-time `expires_at` guard against DynamoDB TTL's best-effort 48h delay (see § 4 cross-cutting invariants in the access-patterns doc).
- `docs/architecture/dynamodb-access-patterns.md` is the per-entity reference; updates to the schema MUST update that doc in the same change-set.
- CloudWatch alarms per table: throttling, hot-key, error rate. Alarm policy lives in `sst.config.ts`.

## Revisit triggers

- **≥10K MAU** — re-evaluate PAY_PER_REQUEST vs PROVISIONED + autoscaling on the mega-table (the dominant cost line at scale).
- **≥100K MAU** — activate DAX in front of `consent_current` (read-on-every-page-load makes it the dominant read driver).
- **Throughput divergence across entities** within the mega-table (e.g., session writes ≫ idempotency writes by an order of magnitude) — split into per-bounded-context tables via dual-write migration.
- **Single-partition hot-key** detected via CloudWatch ContributorInsights — re-design partition key for the affected entity.
- **Cross-region replication need** (EU data-residency revenue requirement) — promote to DynamoDB Global Tables for `consent_current` + `main`.
- **CMK rotation cadence change** (annual → quarterly per regulatory-update) — coordinate with `quilty-aws/website-baseline/` rotation runbook.
