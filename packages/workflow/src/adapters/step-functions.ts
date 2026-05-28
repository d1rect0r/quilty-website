/**
 * AWS Step Functions adapter — SKELETON.
 *
 * Throws `StepFunctionsAdapterNotActivatedError` at instantiation
 * per ADR-0021. Activation trigger: first workflow definition lands
 * (DSAR pipeline, account-delete background, or payment-dunning
 * retry chain — see TW-013 in docs/runbook/trigger-watchlist.md).
 *
 * Express vs Standard SFN execution model (decided at activation):
 *   - Express: short-lived (<5 min), high-throughput, no signal/query
 *     support → DSAR pipeline candidate.
 *   - Standard: durable execution (up to 1 year), full event history,
 *     supports the SFN hybrid pattern → payment-dunning candidate.
 *   - Hybrid: outer Standard with inner Express children — Temporal-
 *     like cost/throughput on the inner Express, Temporal-like
 *     durability on the outer Standard.
 *
 * HIPAA constraints (ADR-0021 §HIPAA):
 *   - NEVER put raw PHI in SFN state I/O. Pass S3 URIs only.
 *   - CloudWatch log level = ERROR (NOT ALL). The state log captures
 *     full input/output by default at ALL level; this is a PHI store
 *     if abused.
 *   - State Machine ARN tagged `Compliance: BAA` for SCP enforcement
 *     at Phase 1 (when website moves to marketing-prod account, the
 *     SCP forbids non-BAA-tagged SFN access from PHI-handling
 *     principals).
 */

import { WorkflowEngineError, type WorkflowEngine } from '../ports/workflow-engine';

export interface StepFunctionsAdapterOptions {
  /** AWS region (e.g., 'us-east-1'). */
  readonly region: string;
  /**
   * State Machine ARN registry — definition name → SFN ARN. The
   * adapter looks up the ARN when `start(definition, input)` is
   * called. Provided here so the same definition name can target
   * different ARNs per environment (dev/staging/prod).
   */
  readonly stateMachineArns: ReadonlyMap<string, string>;
  /**
   * Sidecar DynamoDB table for signal queues + query state (the
   * Temporal-shaped semantics emulation per ADR-0021).
   */
  readonly sidecarTableName: string;
}

export class StepFunctionsAdapterNotActivatedError extends WorkflowEngineError {
  constructor() {
    super(
      'Step Functions adapter not activated. Activate at first workflow ' +
        'definition landing per ADR-0021 (DSAR pipeline / account-delete / ' +
        'payment-dunning workflow). See packages/workflow/src/adapters/README.md.',
    );
    this.name = 'StepFunctionsAdapterNotActivatedError';
  }
}

export function makeStepFunctionsAdapter(_options: StepFunctionsAdapterOptions): WorkflowEngine {
  // Skeleton per ADR-0021 §Activation. The full adapter
  // wires AWS SDK v3 SFN client at activation; this stub locks the
  // type surface so consumers compile against the eventual shape.
  throw new StepFunctionsAdapterNotActivatedError();
}
