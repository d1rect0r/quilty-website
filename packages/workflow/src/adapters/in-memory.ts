/**
 * In-memory WorkflowEngine fake.
 *
 * Modeled after `@temporalio/testing` `TestWorkflowEnvironment` (the
 * canonical Temporal testing surface): deterministic execution
 * tokens (counter-based, not UUID), time-skipping for time-based
 * assertions, signal queues + query handlers per execution.
 *
 * Consumers obtain via `@quilty/workflow/testing` subpath; this
 * keeps the fake out of production composition roots while making
 * it available to every package's test suite.
 *
 * The fake intentionally does NOT spin up real concurrency or
 * threads — workflows run as plain async functions in the same
 * event loop. The contract guarantees:
 *   1. start() returns immediately with an ExecutionToken; the
 *      workflow body runs in a microtask.
 *   2. signal() / query() interact with the running workflow via
 *      shared per-execution state.
 *   3. waitForCompletion() resolves when the workflow returns
 *      OR when advanceTime() pushes the workflow past a sleep gate.
 *   4. cancel() injects a CancellationError into the workflow's
 *      next yield point.
 */

import {
  WorkflowNotFoundError,
  WorkflowQueryNotFoundError,
  WorkflowTimeoutError,
  type WorkflowEngine,
} from '../ports/workflow-engine';
import {
  makeExecutionToken,
  summarizeExecutionToken,
  type ExecutionToken,
} from '../domain/execution-token';
import { type WorkflowStatus } from '../domain/workflow-status';
import { isValidCancelReason, type WorkflowCancelReason } from '../domain/workflow-status';
import { WorkflowCancellationError, WorkflowTerminationError } from '../domain/cancellation-errors';

// Cancellation/termination error classes live in
// `../domain/cancellation-errors` so this adapter file stays under
// the 500-line readability ceiling. Re-exported for backwards-
// compatibility with the prior import path.
export { WorkflowCancellationError, WorkflowTerminationError } from '../domain/cancellation-errors';

/**
 * Internal signal-waiter shape. The push-model registry replaces
 * the prior microtask polling loop in `waitForSignal` (Phase-A
 * bug-hunter D3-B1): a `signal()` call directly resolves any
 * parked waiter, so a signal that never arrives no longer burns
 * CPU on every microtask tick.
 */
interface SignalWaiter {
  readonly resolve: (value: unknown) => void;
  readonly reject: (err: unknown) => void;
}

interface ExecutionState {
  readonly id: string;
  readonly definitionName: string;
  readonly startedAt: Date;
  status: WorkflowStatus;
  output?: unknown;
  signals: Map<string, unknown[]>;
  signalWaiters: Map<string, SignalWaiter[]>;
  queryHandlers: Map<string, () => unknown>;
  cancellationReason?: WorkflowCancelReason;
  cancelKind?: 'cancelled' | 'terminated';
  resolveCompletion?: (value: unknown) => void;
  rejectCompletion?: (err: unknown) => void;
  completionPromise: Promise<unknown>;
}

/**
 * Implementer-side handle passed to the workflow body. Used to
 * register query handlers, await signals, sleep with time-skipping
 * support, and check for cancellation.
 */
export interface WorkflowContext {
  readonly registerQuery: <T>(name: string, handler: () => T) => void;
  readonly waitForSignal: <T>(name: string) => Promise<T>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly isCancelled: () => boolean;
  readonly throwIfCancelled: () => void;
}

/**
 * Workflow implementation signature for the in-memory fake. Bound to
 * a definition via `registerWorkflow`. The body receives the input
 * + a WorkflowContext for signal/query/sleep operations.
 */
export type WorkflowImpl<TInput, TOutput> = (
  input: TInput,
  ctx: WorkflowContext,
) => Promise<TOutput>;

export interface InMemoryWorkflowEngine extends WorkflowEngine {
  /**
   * Register a workflow implementation against a definition name.
   * Must be called BEFORE `start()` with the matching definition.
   */
  readonly registerWorkflow: <TInput, TOutput>(
    name: string,
    impl: WorkflowImpl<TInput, TOutput>,
  ) => void;

  /**
   * Skip time by the given number of milliseconds. Resolves any
   * `ctx.sleep(...)` calls whose deadline has now passed. Used for
   * deterministic time-based testing without `setTimeout`-driven
   * delays.
   */
  readonly advanceTime: (ms: number) => Promise<void>;

  /**
   * Inspect raw execution state — testing-only escape hatch.
   * Production code paths never call this.
   */
  readonly getExecutionState: (token: ExecutionToken) => Readonly<ExecutionState> | undefined;
}

interface SleepWaiter {
  readonly executionId: string;
  readonly deadlineAt: number;
  readonly resolve: () => void;
}

/**
 * Shared cancellation/termination wiring. `cancel()` and
 * `terminate()` differ only in the `kind` discriminator they
 * propagate into the WorkflowCancellationError + the eventual
 * terminal status.
 */
function finalizeCancellation(
  exec: ExecutionState,
  reason: WorkflowCancelReason | undefined,
  kind: 'cancelled' | 'terminated',
): void {
  if (reason !== undefined && !isValidCancelReason(reason)) {
    // Runtime guard against `someString as WorkflowCancelReason`
    // casts that would otherwise plant PHI in the workflow state
    // record + CloudWatch (Phase-C HIPAA W-1).
    throw new Error(
      'WorkflowCancelReason must be one of the closed enum values; received non-canonical reason',
    );
  }
  if (reason !== undefined) {
    exec.cancellationReason = reason;
  }
  exec.cancelKind = kind;
  for (const [, waiters] of exec.signalWaiters) {
    for (const w of waiters) {
      w.reject(
        kind === 'terminated'
          ? new WorkflowTerminationError(reason)
          : new WorkflowCancellationError(reason, kind),
      );
    }
  }
  exec.signalWaiters.clear();
}

export function makeInMemoryWorkflowEngine(): InMemoryWorkflowEngine {
  let nextId = 1;
  let virtualClock = 0;
  const implementations = new Map<string, WorkflowImpl<unknown, unknown>>();
  const executions = new Map<string, ExecutionState>();
  const sleepWaiters: SleepWaiter[] = [];

  function getExecution(token: ExecutionToken): ExecutionState {
    if (token.kind !== 'in-memory') {
      throw new WorkflowNotFoundError(summarizeExecutionToken(token));
    }
    const exec = executions.get(token.id);
    if (!exec) {
      throw new WorkflowNotFoundError(summarizeExecutionToken(token));
    }
    return exec;
  }

  function makeCtx(executionId: string): WorkflowContext {
    return {
      registerQuery(name, handler) {
        const exec = executions.get(executionId);
        if (!exec) return;
        exec.queryHandlers.set(name, handler);
      },
      async waitForSignal<T>(name: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
          const exec = executions.get(executionId);
          if (!exec) {
            reject(new WorkflowNotFoundError(`in-memory://${executionId}`));
            return;
          }
          if (exec.cancelKind !== undefined) {
            reject(new WorkflowCancellationError(exec.cancellationReason, exec.cancelKind));
            return;
          }
          const queue = exec.signals.get(name);
          if (queue && queue.length > 0) {
            // Narrow `unknown | undefined` to a defined value before
            // resolving — the length check guarantees defined at
            // runtime, but the explicit narrow keeps the type-checker
            // honest (Phase-A TS-2 finding).
            const value = queue.shift();
            if (value === undefined) {
              // Signal name interpolation would surface in
              // CloudWatch / Sentry via the error message; use a
              // length surrogate per D67 + Phase-C HIPAA C-1. The
              // call site has the typed `name` already.
              reject(new WorkflowNotFoundError(`signal queue corrupt (len=${name.length})`));
              return;
            }
            resolve(value as T);
            return;
          }
          // Park a resolver in the push-model registry; `signal()`
          // wakes it directly, `cancel()` rejects all parked waiters.
          const waiters = exec.signalWaiters.get(name) ?? [];
          waiters.push({
            resolve: (value) => resolve(value as T),
            reject,
          });
          exec.signalWaiters.set(name, waiters);
        });
      },
      async sleep(ms) {
        if (ms <= 0) return;
        return new Promise<void>((resolve) => {
          sleepWaiters.push({
            executionId,
            deadlineAt: virtualClock + ms,
            resolve,
          });
        });
      },
      isCancelled() {
        const exec = executions.get(executionId);
        return exec?.cancelKind !== undefined;
      },
      throwIfCancelled() {
        const exec = executions.get(executionId);
        if (exec?.cancelKind !== undefined) {
          throw new WorkflowCancellationError(exec.cancellationReason, exec.cancelKind);
        }
      },
    };
  }

  return {
    registerWorkflow(name, impl) {
      implementations.set(name, impl as WorkflowImpl<unknown, unknown>);
    },

    async start(definition, input) {
      const impl = implementations.get(definition.name);
      if (!impl) {
        throw new WorkflowNotFoundError(`workflow definition not registered: ${definition.name}`);
      }
      const id = String(nextId++);
      const startedAt = new Date();
      let resolveCompletion!: (v: unknown) => void;
      let rejectCompletion!: (e: unknown) => void;
      const completionPromise = new Promise<unknown>((resolve, reject) => {
        resolveCompletion = resolve;
        rejectCompletion = reject;
      });

      const state: ExecutionState = {
        id,
        definitionName: definition.name,
        startedAt,
        status: { type: 'pending', startedAt },
        signals: new Map(),
        signalWaiters: new Map(),
        queryHandlers: new Map(),
        completionPromise,
        resolveCompletion,
        rejectCompletion,
      };
      executions.set(id, state);

      const ctx = makeCtx(id);
      // Begin the workflow body in a microtask so start() returns
      // its token before the body's first await.
      queueMicrotask(() => {
        state.status = { type: 'running', startedAt };
        impl(input, ctx)
          .then((output) => {
            // Re-check cancellation: if the body returned normally
            // but a cancel/terminate was issued mid-flight, prefer
            // the terminal state matching the kind that fired.
            const cancelReason = state.cancellationReason;
            const cancelKind = state.cancelKind;
            if (cancelKind !== undefined) {
              const terminalAt = new Date();
              if (cancelKind === 'terminated') {
                state.status =
                  cancelReason !== undefined
                    ? {
                        type: 'terminated',
                        startedAt,
                        terminatedAt: terminalAt,
                        reason: cancelReason,
                      }
                    : { type: 'terminated', startedAt, terminatedAt: terminalAt };
              } else {
                state.status =
                  cancelReason !== undefined
                    ? {
                        type: 'cancelled',
                        startedAt,
                        cancelledAt: terminalAt,
                        reason: cancelReason,
                      }
                    : { type: 'cancelled', startedAt, cancelledAt: terminalAt };
              }
              rejectCompletion(
                cancelKind === 'terminated'
                  ? new WorkflowTerminationError(cancelReason)
                  : new WorkflowCancellationError(cancelReason, cancelKind),
              );
              return;
            }
            const completedAt = new Date();
            state.status = { type: 'completed', startedAt, completedAt };
            state.output = output;
            resolveCompletion(output);
          })
          .catch((err) => {
            if (err instanceof WorkflowCancellationError) {
              const terminalAt = new Date();
              const cancelReason = state.cancellationReason;
              if (err.kind === 'terminated') {
                state.status =
                  cancelReason !== undefined
                    ? {
                        type: 'terminated',
                        startedAt,
                        terminatedAt: terminalAt,
                        reason: cancelReason,
                      }
                    : { type: 'terminated', startedAt, terminatedAt: terminalAt };
              } else {
                state.status =
                  cancelReason !== undefined
                    ? {
                        type: 'cancelled',
                        startedAt,
                        cancelledAt: terminalAt,
                        reason: cancelReason,
                      }
                    : { type: 'cancelled', startedAt, cancelledAt: terminalAt };
              }
              rejectCompletion(err);
              return;
            }
            const failedAt = new Date();
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            state.status = { type: 'failed', startedAt, failedAt, errorMessage };
            rejectCompletion(err);
          });
      });

      return makeExecutionToken({ kind: 'in-memory', id });
    },

    async status(token) {
      const exec = getExecution(token);
      return exec.status;
    },

    async cancel(token: ExecutionToken, reason?: WorkflowCancelReason): Promise<void> {
      finalizeCancellation(getExecution(token), reason, 'cancelled');
    },

    async terminate(token: ExecutionToken, reason?: WorkflowCancelReason): Promise<void> {
      finalizeCancellation(getExecution(token), reason, 'terminated');
    },

    async signal(token, signalName, payload) {
      const exec = getExecution(token);
      // Push-model: if a waiter is parked, resolve it directly.
      // Falls back to queueing the payload for the next
      // `waitForSignal` call (matches Temporal SignalChannel
      // canonical semantics).
      const waiters = exec.signalWaiters.get(signalName);
      if (waiters && waiters.length > 0) {
        const waiter = waiters.shift();
        if (waiter) {
          waiter.resolve(payload);
          return;
        }
      }
      const queue = exec.signals.get(signalName) ?? [];
      queue.push(payload);
      exec.signals.set(signalName, queue);
    },

    async query<TResult>(token: ExecutionToken, queryName: string): Promise<TResult> {
      const exec = getExecution(token);
      const handler = exec.queryHandlers.get(queryName);
      if (!handler) {
        throw new WorkflowQueryNotFoundError(queryName);
      }
      // Query handler is dynamically keyed by string; the registry
      // can't preserve the per-name TResult, so the cast crosses
      // the unknown→TResult boundary here intentionally. Callers
      // typed `query<number>(...)` keep correct downstream
      // narrowing; an `as never` would be the bottom-type loophole.
      return handler() as TResult;
    },

    async waitForCompletion<TOutput>(
      token: ExecutionToken,
      opts?: { readonly timeout?: number },
    ): Promise<TOutput> {
      const exec = getExecution(token);
      if (opts?.timeout !== undefined) {
        const timeoutMs = opts.timeout;
        let timerHandle: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timerHandle = setTimeout(() => {
            // Emit the `timed-out` terminal status BEFORE rejecting
            // so a follow-up `status()` call observes the canonical
            // terminal state — Phase-A bug-hunter D3-B6.
            const current = executions.get(exec.id);
            if (current && current.status.type === 'running') {
              const timedOutAt = new Date();
              current.status = {
                type: 'timed-out',
                startedAt: current.startedAt,
                timedOutAt,
              };
            }
            reject(new WorkflowTimeoutError(timeoutMs));
          }, timeoutMs);
        });
        try {
          return (await Promise.race([exec.completionPromise, timeoutPromise])) as TOutput;
        } finally {
          // Clear the handle whichever race-side won so we don't
          // hold the event loop open (Phase-A bug-hunter D3-B2).
          if (timerHandle !== undefined) clearTimeout(timerHandle);
        }
      }
      return (await exec.completionPromise) as TOutput;
    },

    async advanceTime(ms) {
      virtualClock += ms;
      // Resolve all waiters whose deadline now passed.
      const toResolve: SleepWaiter[] = [];
      const remaining: SleepWaiter[] = [];
      for (const w of sleepWaiters) {
        if (w.deadlineAt <= virtualClock) toResolve.push(w);
        else remaining.push(w);
      }
      sleepWaiters.length = 0;
      sleepWaiters.push(...remaining);
      for (const w of toResolve) w.resolve();
      // Yield to the microtask queue so any signal/query polls land.
      await new Promise<void>((r) => queueMicrotask(r));
    },

    getExecutionState(token) {
      if (token.kind !== 'in-memory') return undefined;
      return executions.get(token.id);
    },
  };
}
