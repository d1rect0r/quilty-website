/**
 * @quilty/workflow — public barrel.
 *
 * Production adapters (skeletons until activation triggers fire):
 *   - makeStepFunctionsAdapter — primary AWS-native adapter.
 *   - makeTemporalAdapter — cascading-complexity swap target.
 *
 * In-memory fake exposed via the `/testing` subpath to keep it out
 * of production composition roots per ADR-0014 Rule 5.
 *
 * Activation roadmap (ADR-0021 §Activation; TW-013 in
 * docs/runbook/trigger-watchlist.md):
 *   - DSAR pipeline lands → activate SFN adapter (Express variant).
 *   - account-delete background → activate SFN adapter.
 *   - payment-dunning chain → activate SFN adapter (Standard variant).
 *   - Cascading workflow complexity → migrate to Temporal Cloud.
 */

export type { ExecutionToken, ExecutionTokenPayload } from './domain/execution-token';
export { summarizeExecutionToken } from './domain/execution-token';

export type { WorkflowStatus } from './domain/workflow-status';
export { isTerminal } from './domain/workflow-status';

export type { WorkflowDefinition, WorkflowEngine } from './ports/workflow-engine';
export {
  WorkflowEngineError,
  WorkflowNotFoundError,
  WorkflowTimeoutError,
} from './ports/workflow-engine';

export type { StepFunctionsAdapterOptions } from './adapters/step-functions';
export {
  makeStepFunctionsAdapter,
  StepFunctionsAdapterNotActivatedError,
} from './adapters/step-functions';

export type { TemporalAdapterOptions } from './adapters/temporal';
export { makeTemporalAdapter, TemporalAdapterNotActivatedError } from './adapters/temporal';
