/**
 * Test-fake re-export barrel — per ADR-0014 Rule 4 + Rule 5.
 *
 * Cross-package consumers import in-memory fakes from this subpath
 * (`@quilty/api-client/testing`) rather than from the adapter file
 * directly. The dependency-cruiser rule prevents deep imports past
 * this barrel.
 *
 * The in-memory fake is sufficient for 95% of unit tests; integration
 * tests that need a real HTTP transport instantiate `makeFetchApiClient`
 * directly against `nock` or `msw` interceptors.
 */

export { makeInMemoryApiClient } from '../adapters/in-memory';
export type {
  InMemoryApiClientOptions,
  InMemoryHandler,
  InMemoryHandlerResult,
} from '../adapters/in-memory';

export { makeNoOpCircuitBreaker } from '../adapters/circuit-breaker-noop';
