/**
 * @quilty/workflow/testing — testing-only barrel.
 *
 * Exposes the in-memory fake + supporting types. Subpath isolation
 * keeps the fake out of production bundles per ADR-0014 Rule 5
 * (test fakes never reach client/server composition roots).
 */

export {
  makeInMemoryWorkflowEngine,
  WorkflowCancellationError,
  type InMemoryWorkflowEngine,
  type WorkflowContext,
  type WorkflowImpl,
} from '../adapters/in-memory';
