/**
 * Public barrel for `@quilty/api-client`.
 *
 * Consumers import port types + factory wrappers + adapters from this
 * file. Deep imports into `src/*` are forbidden by
 * `.dependency-cruiser.cjs` rule `cross-package-imports-must-use-barrel`.
 *
 * The composition root MUST consume the factory functions
 * (`makeFetchApiClient`, `makeNoOpCircuitBreaker`) — never reach into
 * an internal adapter file to wire a different transport. Vendor swap
 * is a one-file change inside `src/adapters/*` per ADR-0014.
 *
 * Test consumers import from the `/testing` subpath barrel
 * (`@quilty/api-client/testing`) for the in-memory fake + the no-op
 * circuit breaker test wiring.
 */

// ---------------------------------------------------------------------------
// Ports (type-only re-exports)
// ---------------------------------------------------------------------------

export type {
  ApiClient,
  ApiMethod,
  ApiRequest,
  ApiResponse,
  CircuitBreaker,
  RetryPolicy,
} from './ports';

export { IDEMPOTENT_METHODS, isRetryableForMethod } from './ports';

// ---------------------------------------------------------------------------
// Typed-error union (Decision A in ADR-0017 + ADR-0014 Rule 5)
// ---------------------------------------------------------------------------

export {
  ApiAbortedError,
  ApiCircuitOpenError,
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiParseError,
  ApiProblemError,
  ApiRetryBudgetExhaustedError,
  ApiTimeoutError,
  isApiClientError,
  isApiHttpError,
  isApiProblemError,
} from './errors';

export type { ApiClientErrorCode } from './errors';

// ---------------------------------------------------------------------------
// Problem Details (RFC 9457) — Decision G in ADR-0017
// ---------------------------------------------------------------------------

export type { ProblemDetails } from './domain/problem-details';
export {
  isProblemJsonContentType,
  parseProblemDetails,
  retryAfterMsFromProblem,
  retryableFromProblem,
} from './domain/problem-details';

export type { ProblemTypeSlug, ProblemTypeUri } from './domain/problem-types';
export {
  CANONICALLY_RETRYABLE,
  PROBLEM_TYPES,
  RECOMMENDED_STATUS,
  slugForUri,
} from './domain/problem-types';

// ---------------------------------------------------------------------------
// Idempotency-Key — Decision E in ADR-0017
// ---------------------------------------------------------------------------

export {
  IDEMPOTENCY_KEY_HEADER,
  generateIdempotencyKey,
  isValidIdempotencyKey,
} from './domain/idempotency-key';

// ---------------------------------------------------------------------------
// Tracing (W3C traceparent) — Decision F in ADR-0017
// ---------------------------------------------------------------------------

export {
  TRACEPARENT_HEADER,
  currentTraceparent,
  formatTraceparent,
  parseTraceparent,
} from './domain/traceparent';

// ---------------------------------------------------------------------------
// Retry policy — Decision C in ADR-0017
// ---------------------------------------------------------------------------

export { makeDefaultRetryPolicy, makeNoRetryPolicy, parseRetryAfter } from './domain/retry';

export type { DefaultRetryPolicyOptions } from './domain/retry';

// ---------------------------------------------------------------------------
// Adapter factories — vendor-bound; ONLY appear under `src/adapters/*`
// per ADR-0014 Rule 5
// ---------------------------------------------------------------------------

export { makeFetchApiClient, type FetchApiClientOptions } from './adapters/fetch';
export { makeNoOpCircuitBreaker } from './adapters/circuit-breaker-noop';
// Skeleton — see file for activation gate. Throws at instantiation
// today; uncomment + install opossum at cascading-failure trigger per ADR-0017.
export {
  makeOpossumCircuitBreaker,
  type OpossumCircuitBreakerOptions,
} from './adapters/circuit-breaker-opossum';
