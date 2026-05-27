/**
 * WorkflowEngine port — 6-method LCD across enterprise workflow
 * engines (AWS Step Functions, Temporal Cloud, Inngest, Trigger.dev).
 *
 * Locked per ADR-0021. Activation triggers (see
 * docs/runbook/trigger-watchlist.md TW-013):
 *   - First DSAR (GDPR Article 17 erasure) workflow.
 *   - First account-delete background pipeline.
 *   - First payment-dunning retry chain.
 *   - Cascading-complexity migration to Temporal Cloud → at the time
 *     a multi-step workflow needs durable signals + queries (e.g.,
 *     interactive cancellation, status polling, time-travel debugging).
 *
 * Why six methods (not three or twelve):
 *   - start / status / waitForCompletion — Step Functions native API.
 *   - cancel — every engine supports it; first-class in the port.
 *   - signal / query — Temporal's distinctive primitives; we lock
 *     them in the port now to avoid a structural refactor later
 *     when the cascading-complexity trigger fires (signal queues +
 *     query handlers are the dominant Temporal differentiators).
 *
 * Step Functions doesn't natively support signal + query, but the
 * adapter can emulate via a sidecar DynamoDB record (pattern
 * documented in adapters/README.md). The port doesn't compromise on
 * the LCD across engines because the emulation is internal to the
 * adapter.
 */

import type { ExecutionToken } from '../domain/execution-token';
import type { WorkflowStatus } from '../domain/workflow-status';

export interface WorkflowDefinition<TInput, TOutput> {
  readonly name: string;
  readonly version: string;
  // `__phantom` keeps TInput/TOutput in the structural type without a
  // runtime field (TS doesn't structurally narrow type-only generics
  // when they appear only in method signatures — the phantom anchors
  // them in the WorkflowDefinition shape so consumers get full type
  // inference at start(definition, input).
  readonly __phantom?: { input: TInput; output: TOutput };
}

export interface WorkflowEngine {
  /**
   * Begin a workflow execution. Returns an opaque ExecutionToken
   * the caller stores; subsequent calls (`status`, `cancel`, etc.)
   * use this token to identify the execution. Tokens are durable
   * across process restarts; in the Step Functions adapter the
   * token holds the SFN execution ARN, in Temporal it holds the
   * workflow ID + run ID.
   */
  readonly start: <TInput, TOutput>(
    definition: WorkflowDefinition<TInput, TOutput>,
    input: TInput,
  ) => Promise<ExecutionToken>;

  /**
   * Inspect current execution state. Returns a discriminated-union
   * so consumers can switch on `status.type` and exhaustively handle
   * each terminal + non-terminal state without losing type narrowing.
   */
  readonly status: (token: ExecutionToken) => Promise<WorkflowStatus>;

  /**
   * Request graceful cancellation. The engine emits the cancellation
   * signal; the workflow's own cancellation handler decides what
   * cleanup to run. Optional `reason` surfaces in the workflow's
   * audit trail (CloudWatch logs for SFN, Web UI history for
   * Temporal).
   */
  readonly cancel: (token: ExecutionToken, reason?: string) => Promise<void>;

  /**
   * Send a typed signal to a running workflow. Semantics match
   * Temporal's `WorkflowHandle.signal()` — the signal is queued and
   * processed by the workflow's signal handler when it next yields.
   *
   * In the SFN adapter, signal delivery is emulated via a sidecar
   * DynamoDB record that the workflow polls; the adapter abstracts
   * this so callers see Temporal-shaped semantics regardless of the
   * underlying engine.
   */
  readonly signal: <TPayload>(
    token: ExecutionToken,
    signalName: string,
    payload: TPayload,
  ) => Promise<void>;

  /**
   * Read a typed value from a running workflow without affecting
   * its execution state. Mirrors Temporal's `WorkflowHandle.query()`.
   * In the SFN adapter, queries read the sidecar state record.
   *
   * Query handlers MUST be side-effect-free; they can read workflow
   * state but cannot mutate it.
   */
  readonly query: <TResult>(token: ExecutionToken, queryName: string) => Promise<TResult>;

  /**
   * Block until the workflow reaches a terminal state, then return
   * the output. Convenience over `status()` polling; the engine
   * adapter chooses the most-efficient mechanism (SFN long-polling,
   * Temporal's `WorkflowHandle.result()`).
   *
   * `timeout` (ms): if the workflow hasn't completed in this window,
   * the promise rejects with a `WorkflowTimeoutError`. Default is
   * to wait indefinitely (subject to the engine's internal timeout).
   */
  readonly waitForCompletion: <TOutput>(
    token: ExecutionToken,
    opts?: { readonly timeout?: number },
  ) => Promise<TOutput>;
}

export class WorkflowEngineError extends Error {
  // Static, PHI-free message template per D148.
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = new.target.name;
  }
}

export class WorkflowTimeoutError extends WorkflowEngineError {
  constructor(timeoutMs: number) {
    super(`Workflow did not complete within ${timeoutMs}ms`);
  }
}

export class WorkflowNotFoundError extends WorkflowEngineError {
  constructor(tokenSummary: string) {
    super(`Workflow execution not found: ${tokenSummary}`);
  }
}
