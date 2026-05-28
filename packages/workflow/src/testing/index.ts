/**
 * @quilty/workflow/testing — testing-only barrel.
 *
 * Exposes the in-memory fake + supporting types. Subpath isolation
 * keeps the fake out of production bundles per ADR-0014 Rule 5
 * (test fakes never reach client/server composition roots).
 */

export {
  makeInMemoryWorkflowEngine,
  type InMemoryWorkflowEngine,
  type WorkflowContext,
  type WorkflowImpl,
} from '../adapters/in-memory';

// Re-export the error classes + the closed-enum cancel-reason type
// from this subpath so test authors get everything they need from a
// single import (per Phase-C TS Warning #3).
export { WorkflowCancellationError, WorkflowTerminationError } from '../domain/cancellation-errors';
export type { WorkflowCancelReason } from '../domain/workflow-status';
