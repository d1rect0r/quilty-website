import type { WorkflowCancelReason } from './workflow-status';

/**
 * Base cancellation/termination error. Subclassed (NOT discriminated
 * by `kind` alone) so `err instanceof WorkflowTerminationError`
 * narrows correctly at both the TS level and via `error.name`. The
 * `kind` discriminator is preserved for callers that prefer
 * pattern-matching over instanceof.
 *
 * `Error.message` carries ONLY the kind discriminator — never the
 * `reason` — per Phase-C HIPAA C-2 finding. `reason` is closed-enum
 * today, but Sentry uses `Error.message` as the issue title; keeping
 * it free of interpolation removes the structural risk that a
 * future enum addition or `as` cast plants PHI in the issue title.
 * Consumers read the discriminator via `err.reason` (typed) +
 * `err.kind` (literal union).
 */
export class WorkflowCancellationError extends Error {
  readonly reason: WorkflowCancelReason | undefined;
  readonly kind: 'cancelled' | 'terminated';
  constructor(reason?: WorkflowCancelReason, kind: 'cancelled' | 'terminated' = 'cancelled') {
    super(`Workflow ${kind}`);
    this.name = 'WorkflowCancellationError';
    this.reason = reason;
    this.kind = kind;
  }
}

/**
 * Forcible-termination variant. Distinct subclass so consumers can
 * `catch` it specifically vs the cooperative cancellation kind.
 */
export class WorkflowTerminationError extends WorkflowCancellationError {
  constructor(reason?: WorkflowCancelReason) {
    super(reason, 'terminated');
    this.name = 'WorkflowTerminationError';
  }
}
