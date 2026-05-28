import type { WorkflowCancelReason, WorkflowStatus } from './workflow-status';

/**
 * Read-only snapshot returned by
 * `InMemoryWorkflowEngine.getExecutionState`. Maps are cloned +
 * frozen at the engine boundary so mutation attempts throw in
 * strict mode and silently no-op otherwise.
 *
 * Fields are a deliberate subset of the live `ExecutionState`:
 * `resolveCompletion` / `rejectCompletion` / `completionPromise`
 * are deliberately omitted because invoking them would corrupt
 * the engine's promise state, AND the `queryHandlers` Map is
 * exposed only as a `readonly string[]` of registered names —
 * the handler functions themselves are not part of the inspection
 * contract (calling them would side-effect the workflow body).
 *
 * The prior return type was `Readonly<ExecutionState>` (Phase-C TS
 * Warning): `Readonly<T>` is shallow + structural — it does not
 * strip `Map.set()` etc. — so a test author could mutate engine
 * state through the returned reference. This snapshot shape closes
 * that hazard at the type level + at runtime.
 */
export interface ExecutionStateSnapshot {
  readonly id: string;
  readonly definitionName: string;
  readonly startedAt: Date;
  readonly status: WorkflowStatus;
  readonly output: unknown;
  readonly signals: ReadonlyMap<string, readonly unknown[]>;
  readonly queryHandlerNames: readonly string[];
  readonly cancellationReason: WorkflowCancelReason | undefined;
  readonly cancelKind: 'cancelled' | 'terminated' | undefined;
}

/**
 * Live execution-state shape the in-memory adapter holds internally.
 * Declared here (rather than re-imported from the adapter) so the
 * snapshot helper has a typed input without circular imports.
 * Only the fields a snapshot copies are required; the adapter's
 * full ExecutionState carries additional internal-only fields
 * (resolveCompletion, rejectCompletion, signalWaiters,
 * completionPromise) that are intentionally NOT in this contract.
 */
export interface ExecutionStateForSnapshot {
  readonly id: string;
  readonly definitionName: string;
  readonly startedAt: Date;
  readonly status: WorkflowStatus;
  readonly output?: unknown;
  readonly signals: ReadonlyMap<string, readonly unknown[]>;
  readonly queryHandlers: ReadonlyMap<string, () => unknown>;
  readonly cancellationReason?: WorkflowCancelReason;
  readonly cancelKind?: 'cancelled' | 'terminated';
}

/**
 * Build a deep-frozen snapshot of an execution state. Internal
 * Maps are cloned (not just structurally-typed as ReadonlyMap)
 * before freezing; without the clone, a test author could still
 * downcast `ReadonlyMap` to `Map` and call `set()` on the live
 * collection.
 */
export function snapshotExecutionState(live: ExecutionStateForSnapshot): ExecutionStateSnapshot {
  const signalsClone = new Map<string, readonly unknown[]>();
  for (const [name, queue] of live.signals) {
    signalsClone.set(name, Object.freeze([...queue]));
  }
  const queryHandlerNames = Object.freeze([...live.queryHandlers.keys()]);
  return Object.freeze({
    id: live.id,
    definitionName: live.definitionName,
    startedAt: live.startedAt,
    status: live.status,
    output: live.output,
    signals: signalsClone,
    queryHandlerNames,
    cancellationReason: live.cancellationReason,
    cancelKind: live.cancelKind,
  });
}
