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
  WorkflowTimeoutError,
  type WorkflowEngine,
} from '../ports/workflow-engine';
import {
  makeExecutionToken,
  summarizeExecutionToken,
  type ExecutionToken,
} from '../domain/execution-token';
import { type WorkflowStatus } from '../domain/workflow-status';

export class WorkflowCancellationError extends Error {
  override readonly name = 'WorkflowCancellationError';
  constructor(reason?: string) {
    super(`Workflow cancelled${reason ? `: ${reason}` : ''}`);
  }
}

interface ExecutionState {
  readonly id: string;
  readonly definitionName: string;
  readonly startedAt: Date;
  status: WorkflowStatus;
  output?: unknown;
  signals: Map<string, unknown[]>;
  queryHandlers: Map<string, () => unknown>;
  cancellationReason?: string;
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
        return new Promise((resolve, reject) => {
          const exec = executions.get(executionId);
          if (!exec) {
            reject(new WorkflowNotFoundError(`in-memory://${executionId}`));
            return;
          }
          const queue = exec.signals.get(name);
          if (queue && queue.length > 0) {
            resolve(queue.shift() as T);
            return;
          }
          const checkSignal = () => {
            const current = executions.get(executionId);
            if (!current) {
              reject(new WorkflowNotFoundError(`in-memory://${executionId}`));
              return;
            }
            if (current.cancellationReason !== undefined) {
              reject(new WorkflowCancellationError(current.cancellationReason));
              return;
            }
            const q = current.signals.get(name);
            if (q && q.length > 0) {
              resolve(q.shift() as T);
              return;
            }
            // Microtask poll — the fake doesn't use real timers; the
            // signal arrives via signal() which calls deliverSignal()
            // and triggers a re-check.
            queueMicrotask(checkSignal);
          };
          queueMicrotask(checkSignal);
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
        return exec?.cancellationReason !== undefined;
      },
      throwIfCancelled() {
        const exec = executions.get(executionId);
        if (exec?.cancellationReason !== undefined) {
          throw new WorkflowCancellationError(exec.cancellationReason);
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
            // but a cancel was issued mid-flight, prefer the
            // cancelled terminal state.
            const cancelReason = state.cancellationReason;
            if (cancelReason !== undefined) {
              const cancelledAt = new Date();
              state.status = {
                type: 'cancelled',
                startedAt,
                cancelledAt,
                reason: cancelReason,
              };
              rejectCompletion(new WorkflowCancellationError(cancelReason));
              return;
            }
            const completedAt = new Date();
            state.status = { type: 'completed', startedAt, completedAt };
            state.output = output;
            resolveCompletion(output);
          })
          .catch((err) => {
            if (err instanceof WorkflowCancellationError) {
              const cancelledAt = new Date();
              const cancelReason = state.cancellationReason;
              state.status =
                cancelReason !== undefined
                  ? { type: 'cancelled', startedAt, cancelledAt, reason: cancelReason }
                  : { type: 'cancelled', startedAt, cancelledAt };
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

    async cancel(token, reason) {
      const exec = getExecution(token);
      exec.cancellationReason = reason ?? 'Cancelled by caller';
    },

    async signal(token, signalName, payload) {
      const exec = getExecution(token);
      const queue = exec.signals.get(signalName) ?? [];
      queue.push(payload);
      exec.signals.set(signalName, queue);
    },

    async query(token, queryName) {
      const exec = getExecution(token);
      const handler = exec.queryHandlers.get(queryName);
      if (!handler) {
        throw new WorkflowNotFoundError(`query not registered: ${queryName}`);
      }
      return handler() as never;
    },

    async waitForCompletion(token, opts) {
      const exec = getExecution(token);
      if (opts?.timeout !== undefined) {
        const timeoutMs = opts.timeout;
        return Promise.race([
          exec.completionPromise as Promise<never>,
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new WorkflowTimeoutError(timeoutMs)), timeoutMs);
          }),
        ]);
      }
      return exec.completionPromise as Promise<never>;
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
