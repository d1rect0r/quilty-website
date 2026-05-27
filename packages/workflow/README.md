# @quilty/workflow

> Durable workflow engine port + adapters. Hexagonal modular-monolith per ADR-0021.

## What this package owns

A 6-method `WorkflowEngine` port (LCD across AWS Step Functions, Temporal Cloud, Inngest, Trigger.dev), an in-memory fake at the `/testing` subpath, and two production-adapter skeletons that throw at instantiation until their activation triggers fire.

## Port surface (locked at M1.6 per ADR-0021)

| Method              | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `start`             | Begin a workflow; returns opaque ExecutionToken           |
| `status`            | Inspect current execution state (discriminated union)     |
| `cancel`            | Graceful cancellation; reason captured for audit trail    |
| `signal`            | Send typed payload to running workflow (Temporal canon)   |
| `query`             | Read typed state from running workflow (side-effect free) |
| `waitForCompletion` | Block until terminal state; returns workflow output       |

## Adapters

### `makeStepFunctionsAdapter` (primary, skeleton)

Throws `StepFunctionsAdapterNotActivatedError` at instantiation. Activation trigger: first workflow definition lands at M7 (DSAR pipeline, account-delete background, payment-dunning retry chain).

Express vs Standard vs Hybrid execution model decided at activation time per ADR-0021 §Step Functions. The adapter emulates Temporal-shaped `signal()` + `query()` via a sidecar DynamoDB record, abstracting the SFN-native limitation away from callers.

### `makeTemporalAdapter` (cascading-complexity swap target, skeleton)

Throws `TemporalAdapterNotActivatedError` at instantiation. Activation trigger: when SFN sidecar emulation of signals + queries no longer scales (typically the 3rd-4th workflow definition).

Temporal Cloud is HIPAA-eligible with BAA + SOC 2 Type II. Same constraint as SFN: raw PHI never enters workflow I/O — pass S3 URIs only (ADR-0021 §HIPAA).

### `makeInMemoryWorkflowEngine` (testing-only)

Production-grade in-memory fake at `@quilty/workflow/testing`. Modeled after `@temporalio/testing`:

- Deterministic counter-based execution tokens (NOT UUID) for test reproducibility.
- Time-skipping via `advanceTime(ms)` for sleep-based assertions.
- Per-execution signal queues + query handler registry.
- Cancellation injection via `ctx.throwIfCancelled()`.

## Activation roadmap

See `docs/runbook/trigger-watchlist.md` TW-013 (WorkflowEngine first definition) for the canonical activation gate; ADR-0021 documents the architecture and engine-swap decision matrix.

## HIPAA wiring (per ADR-0021)

- Workflow I/O payloads contain **S3 URIs only**, never raw PHI.
- CloudWatch log level = ERROR (NOT ALL) so the state log isn't a PHI sink.
- State Machine ARNs tagged `Compliance: BAA` for SCP enforcement at Phase-1 account split (when the website moves to `marketing-prod`, the SCP forbids non-BAA-tagged SFN access from PHI-handling principals).
