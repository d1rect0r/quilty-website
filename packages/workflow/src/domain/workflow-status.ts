/**
 * Closed enum of reasons a workflow may be cancelled OR terminated.
 * Free-text was rejected (Phase-A HIPAA H1) because the reason
 * flows into Step Functions' execution history (CloudWatch at ALL
 * log level by default) and Temporal's event history — both are
 * PHI sinks if a caller passes `"Cancelled: user john@example.com"`.
 * Restricting to a closed union forces callers to map their
 * domain-specific cause onto one of these canonical buckets;
 * sensitive context lives in the originating audit log, not in
 * the workflow's own state record.
 */
export type WorkflowCancelReason =
  | 'user_requested'
  | 'operator_requested'
  | 'system_timeout'
  | 'compliance_revoked'
  | 'superseded_by_retry'
  | 'parent_cancelled';

/**
 * WorkflowStatus — discriminated union of execution states across all
 * supported engines. Closed union so exhaustive switch in callers
 * surfaces compile-time errors when a future engine state isn't
 * mapped.
 *
 * Engine-state crosswalk (per ADR-0021):
 *   - 'pending'    ← SFN RUNNING (no transitions yet) | Temporal SCHEDULED
 *   - 'running'    ← SFN RUNNING (active state)       | Temporal RUNNING
 *   - 'completed'  ← SFN SUCCEEDED                     | Temporal COMPLETED
 *   - 'failed'     ← SFN FAILED                        | Temporal FAILED
 *   - 'cancelled'  ← SFN ABORTED (StopExecution cause='cancel') | Temporal CANCELLED
 *   - 'terminated' ← SFN ABORTED (cause='terminate')   | Temporal TERMINATED
 *   - 'timed-out'  ← SFN TIMED_OUT                     | Temporal TIMED_OUT
 *
 * Cancel vs terminate distinction (Temporal canon): `cancel` issues
 * a CancelledFailure into the workflow body so its cleanup handler
 * runs; `terminate` is a forcible kill with no cleanup window.
 * Auditors require these distinct in HIPAA workflows (e.g., DSAR
 * cancellation by user vs ops-initiated termination on PHI-leak
 * incident response).
 */
export type WorkflowStatus =
  | { readonly type: 'pending'; readonly startedAt: Date }
  | { readonly type: 'running'; readonly startedAt: Date }
  | { readonly type: 'completed'; readonly startedAt: Date; readonly completedAt: Date }
  | {
      readonly type: 'failed';
      readonly startedAt: Date;
      readonly failedAt: Date;
      readonly errorMessage: string; // never PHI; static template per D148
    }
  | {
      readonly type: 'cancelled';
      readonly startedAt: Date;
      readonly cancelledAt: Date;
      readonly reason?: WorkflowCancelReason;
    }
  | {
      readonly type: 'terminated';
      readonly startedAt: Date;
      readonly terminatedAt: Date;
      readonly reason?: WorkflowCancelReason;
    }
  | { readonly type: 'timed-out'; readonly startedAt: Date; readonly timedOutAt: Date };

export function isTerminal(status: WorkflowStatus): boolean {
  return (
    status.type === 'completed' ||
    status.type === 'failed' ||
    status.type === 'cancelled' ||
    status.type === 'terminated' ||
    status.type === 'timed-out'
  );
}
