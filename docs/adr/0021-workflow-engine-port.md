# ADR-0021: Workflow engine port (@quilty/workflow + Step Functions + Temporal swap target)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Last reviewed:** 2026-05-27
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** M1.6 Workstream D.3 research (per `docs/m1.6_foundation_finishing_plan.md` § D.3); 1 user alignment decision (6-method enterprise canon vs 3-method narrow port) answered 2026-05-27
- **Related decisions:** D31 (zero-PHI in website runtime), D48 (backend stays Rust), D67 (PHI sanitizer chokepoint), D78 (port-adapter consumer contract), D148 (no PHI in `Error.message`)
- **Related ADRs:** [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md), [ADR-0014](0014-port-adapter-naming.md), [ADR-0017](0017-http-client-and-resilience.md)
- **Software versions assumed:** AWS SDK v3 (sfn client), `@temporalio/client` 1.10+, Node 24, TypeScript 5.7 strict, DynamoDB v3 SDK

## Context

Durable workflows are the canonical pre-launch retrofit hazard: a payment-dunning chain, a GDPR Article 17 erasure pipeline, and a multi-day account-delete grace flow all eventually demand the same primitives (cancellable execution, signal injection, status queries, deterministic time-skipping for testing). Hand-rolling these per-feature is the documented anti-pattern at Stripe pre-Temporal, Notion pre-Inngest, and Discord pre-Temporal.

The "do nothing" outcome at launch: each pipeline ships its own bespoke state machine in DynamoDB + ad-hoc CloudWatch Events triggers, with no signal/query primitive, no testability, no cancellation surface. The first interactive cancellation feature (user clicks "Cancel my account-deletion") becomes a 4-week refactor at best, a tracking-pixel-level data leak at worst (if a partially-completed workflow exposes PHI in a state-log record meant for ops).

Quilty has zero production workflows at M1.6, but the call surface across DSAR / account-delete / payment-dunning / referral-payout / lifecycle-marketing fan-out is well-understood. Lock the port now; activate adapters at M7 when the first workflow lands.

## Decision

We will ship `@quilty/workflow` at M1.6 with a 6-method `WorkflowEngine` port + an in-memory fake at the `/testing` subpath + two production-adapter skeletons (`makeStepFunctionsAdapter`, `makeTemporalAdapter`) that throw at instantiation until activation.

### Decision A — 6-method port surface (NOT 3, NOT 12)

The lowest common denominator across AWS Step Functions, Temporal Cloud, Inngest, and Trigger.dev:

```ts
interface WorkflowEngine {
  start<I, O>(def: WorkflowDefinition<I, O>, input: I): Promise<ExecutionToken>;
  status(token: ExecutionToken): Promise<WorkflowStatus>;
  cancel(token: ExecutionToken, reason?: string): Promise<void>;
  signal<P>(token: ExecutionToken, name: string, payload: P): Promise<void>;
  query<R>(token: ExecutionToken, name: string): Promise<R>;
  waitForCompletion<O>(token: ExecutionToken, opts?: { timeout?: number }): Promise<O>;
}
```

Considered + rejected:

- **3-method port** (`start` + `status` + `waitForCompletion`): tracks the SFN-native API perfectly but locks out signal/query → the migration to Temporal becomes a structural refactor (every workflow definition AND every call site changes). Rejected per the user alignment decision: ship the 6-method canon now so the Temporal swap is engine-only.
- **12-method port** (adding `pause`, `resume`, `getHistory`, `listExecutions`, etc.): the Temporal SDK's full surface. Most methods aren't supported by SFN even with sidecar emulation; including them in the port forces every adapter to no-op on most calls. Rejected — the LCD intersection is exactly 6 methods.

### Decision B — Primary adapter: AWS Step Functions (M7 activation)

Step Functions chosen as the primary AWS-native engine:

- **HIPAA-eligible** with BAA in scope (vs. Inngest/Trigger.dev which are not HIPAA-aligned for the workloads this port targets at Quilty's price tier).
- **Express + Standard hybrid** pattern handles both short-lived (<5min, high-throughput) and durable (up to 1-year retention) workflows.
- **Native integration** with EventBridge, S3, Lambda — Quilty's existing Rust backend integrates without an SDK shim.
- **Cost: $0 at zero traffic**; pay-per-state-transition.

Activation trigger: first workflow definition lands at M7. Likely candidates per `docs/website_workflow_roadmap.md`: DSAR pipeline (Express), account-delete background (Standard), payment-dunning chain (Standard).

### Decision C — Temporal Cloud as the cascading-complexity swap target

When SFN sidecar emulation of `signal()` + `query()` no longer scales — typically by the 3rd-4th workflow definition that needs interactive primitives — migrate to Temporal Cloud. Temporal is HIPAA-eligible (BAA + SOC 2 Type II + HSM-backed KMS) and the canonical engine for the "many durable workflows + signals + queries + time-travel debugging" workload.

The port's 6-method shape was deliberately chosen to match Temporal's public TS SDK; the swap from SFN → Temporal at activation requires zero call-site changes.

### Decision D — In-memory fake modeled after `@temporalio/testing`

The in-memory fake clones the canonical Temporal `TestWorkflowEnvironment` surface:

- Counter-based execution tokens (NOT UUID) for deterministic test fixtures.
- `advanceTime(ms)` for sleep-based assertions without real timers.
- Per-execution signal queues + query handler registry.
- Cancellation injection at the next `throwIfCancelled()` checkpoint.

Exposed only via the `/testing` subpath per ADR-0014 Rule 5 (test fakes never reach production composition roots).

### Decision E — HIPAA wiring (raw PHI never enters workflow I/O)

Both adapters enforce a hard constraint: **raw PHI is never serialized into workflow input/output payloads.** Patterns:

- **S3-URI pattern**: workflows receive `{ inputUri: 's3://quilty-dsar-staging/req-123.json.gz' }`; the workflow body fetches via signed URL. This keeps PHI out of:
  - Step Functions execution input/output (logged at ALL level to CloudWatch by default — a PHI sink if abused; set log level to ERROR).
  - Temporal Cloud event history (durable forever; default 30-day retention is too long for PHI workflows — explicit shorter retention required).
- **State Machine ARNs tagged `Compliance: BAA`** for SCP enforcement at the Phase-1 account split (when the website moves to `marketing-prod`, the SCP forbids non-BAA-tagged SFN access from PHI-handling principals).
- **`Error.message` is a static template** per D148; workflow failures surface generic messages with audit-log correlation IDs, never PHI fragments.

### Decision F — Workflow definitions live in the consumer

The port + adapters live in `@quilty/workflow`. Actual workflow _definitions_ (state machine JSON for SFN, TypeScript activity/worker code for Temporal) live in the consumer that owns the use case — `apps/web/lib/workflows/dsar.ts` for DSAR, `lib/workflows/account-delete.ts` for account deletion, etc. The package doesn't have opinions about which workflows exist; it only provides the engine abstraction.

## Consequences

### Positive

- **Zero call-site change on adapter swap.** The 6-method port matches the LCD across 4 candidate engines.
- **In-memory fake is production-grade** — every workflow consumer gets a deterministic, time-skip-capable test environment without spinning up Temporal/SFN locally.
- **HIPAA constraints documented at architecture time**, before the first PHI-handling workflow exists; reviewers + auditors get the design rationale up-front.
- **No vendor lock-in at M1.6**: zero workflows exist, so the "wrong engine choice" cost is zero. By M7 we'll have learned enough to commit.

### Negative / Trade-offs

- **Signal/query emulation in the SFN adapter** is non-trivial. The sidecar DynamoDB pattern adds operational surface (table, IAM, alerts) the SFN-native API doesn't need. Documented in `packages/workflow/src/adapters/README.md` (added at SFN activation).
- **6-method port locks more surface than the minimum** for SFN-only use. If we never need signal/query, the port is over-broad. Accepted trade-off — the user-locked decision was to bias toward Temporal compatibility.
- **Skeleton adapters delay activation testing.** First real SFN deploy at M7 will encounter integration issues that earlier activation would have surfaced. Mitigated by the in-memory fake covering the structural contract.

### Neutral

- The Express+Standard hybrid pattern for SFN is well-documented and proven at scale (Stripe + Datadog use it for similar use cases); no novel architecture risk.

## Activation triggers (cross-references)

- **M7 — Step Functions activation**: first workflow definition lands. TW-013 in `docs/runbook/trigger-watchlist.md`.
- **Mature — Temporal Cloud swap**: cascading workflow complexity (typically 3rd-4th definition needing signal/query). Same TW-013 entry, second-stage activation.
- **Phase-1 account split — SCP enforcement**: when `marketing-prod` account is vended, SCP forbids non-BAA-tagged SFN access.

## Anti-patterns to avoid

- **Vendor names in `ports/workflow-engine.ts`** — `SFNExecutionToken`, `TemporalWorkflowHandle`, etc. The port shape uses generic types; engine-specific identifiers live ONLY in adapter files.
- **Raw PHI in workflow input/output** — S3 URIs only; failing to enforce this is the Cerebral $7M lesson rerunning on a different attack surface.
- **CloudWatch log level = ALL on SFN state machines** — default behaviour stores full execution input/output forever; flip to ERROR before the first workflow handles PHI.
- **Test fakes leaking into production composition roots** — the `/testing` subpath is the enforcement; the production barrel never re-exports the in-memory fake.
- **Half-implemented adapters** — `makeStepFunctionsAdapter` throws cleanly at instantiation rather than partially-stubbing methods that would silently return undefined.

## References

- [AWS Step Functions developer guide](https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html)
- [Step Functions Express vs Standard pricing + characteristics](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-standard-vs-express.html)
- [Temporal Cloud HIPAA + SOC 2 posture](https://docs.temporal.io/cloud/security)
- [`@temporalio/testing` TestWorkflowEnvironment docs](https://typescript.temporal.io/api/classes/testing.TestWorkflowEnvironment)
- [AWS HIPAA-eligible services list](https://aws.amazon.com/compliance/hipaa-eligible-services-reference/)
