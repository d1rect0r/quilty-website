/**
 * WorkflowStatus — discriminated union of execution states across all
 * supported engines. Closed union so exhaustive switch in callers
 * surfaces compile-time errors when a future engine state isn't
 * mapped.
 *
 * Engine-state crosswalk (per ADR-0021):
 *   - 'pending'   ← SFN RUNNING (no transitions yet) | Temporal SCHEDULED
 *   - 'running'   ← SFN RUNNING (active state)       | Temporal RUNNING
 *   - 'completed' ← SFN SUCCEEDED                     | Temporal COMPLETED
 *   - 'failed'    ← SFN FAILED                        | Temporal FAILED
 *   - 'cancelled' ← SFN ABORTED                       | Temporal CANCELLED | TERMINATED
 *   - 'timed-out' ← SFN TIMED_OUT                     | Temporal TIMED_OUT
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
      readonly reason?: string;
    }
  | { readonly type: 'timed-out'; readonly startedAt: Date; readonly timedOutAt: Date };

export function isTerminal(status: WorkflowStatus): boolean {
  return (
    status.type === 'completed' ||
    status.type === 'failed' ||
    status.type === 'cancelled' ||
    status.type === 'timed-out'
  );
}
