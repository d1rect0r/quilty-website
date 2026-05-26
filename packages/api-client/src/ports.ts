/**
 * `@quilty/api-client` ports.
 *
 * Three role-shaped, vendor-agnostic ports (META-1 / ADR-0014):
 *   - `ApiClient` — typed outbound HTTP boundary, composes retry +
 *     circuit-breaker + tracing + problem-details parsing inside.
 *   - `RetryPolicy` — pure decision interface (should this attempt
 *     retry? how long to wait?). Replaceable per call site.
 *   - `CircuitBreaker` — fail-fast wrapper around an async fn.
 *     Today the only adapter is a no-op (always closed); the
 *     opossum-backed adapter activates at the cascading-failure
 *     trigger documented in ADR-0017.
 *
 * No vendor names appear in this file. Vendor names live ONLY in
 * `src/adapters/<vendor>.ts` (ADR-0014 Rule 2 + Rule 5).
 */

import { retryableFromProblem } from './domain/problem-details';
import type { ApiProblemError, ApiHttpError } from './errors';

// ---------------------------------------------------------------------------
// ApiClient port
// ---------------------------------------------------------------------------

/**
 * The HTTP-method literals our typed routes need. PATCH is omitted at
 * today because the Rust backend's OpenAPI surface emits PUT for
 * partial-update semantics. Add PATCH here when the backend declares
 * its first PATCH endpoint.
 */
export type ApiMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE';

/**
 * Request envelope shape — vendor-agnostic. Adapters translate this
 * into vendor-specific call shapes (openapi-fetch / fetch / etc.).
 *
 * `idempotencyKey`: when present, the adapter injects the
 * `Idempotency-Key` header. POST retries are gated on this field per
 * the Stripe-canon "POST + Idempotency-Key = retryable" rule.
 *
 * `signal`: caller-supplied AbortSignal flows through unchanged.
 */
export interface ApiRequest {
  readonly method: ApiMethod;
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
  /**
   * Per-call retry override. When absent, the adapter's default
   * retry policy applies. Use to disable retry on a known-non-idempotent
   * POST or to widen the budget on a known-flaky downstream.
   */
  readonly retryPolicy?: RetryPolicy;
}

/**
 * Response envelope shape — successful (2xx) only. The full HTTP
 * status is preserved so callers can branch on 200 vs 201 vs 204
 * without re-parsing headers.
 */
export interface ApiResponse<TBody> {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: TBody;
  /** Correlation ID echoed back from the server (RFC 7807-style `instance` field). */
  readonly correlationId: string | undefined;
}

/**
 * The single public surface every consumer holds. `request<T>` is the
 * only method; consumers narrow `T` to the typed response shape from
 * `@quilty/shared-types` openapi-typescript output.
 *
 * Throws one of the `errors.ts` typed members on failure (`ApiNetwork`
 * / `ApiTimeout` / `ApiHttp` / `ApiProblem` / `ApiParse` / `ApiRequest`
 * / `ApiCircuitOpen` / `ApiRetryBudgetExhausted` / `ApiAborted`).
 * Vendor errors NEVER cross this boundary.
 */
export interface ApiClient {
  readonly request: <TBody = unknown>(input: ApiRequest) => Promise<ApiResponse<TBody>>;
}

// ---------------------------------------------------------------------------
// RetryPolicy port
// ---------------------------------------------------------------------------

/**
 * Pure decision-shaped interface. No I/O. The adapter calls
 * `shouldRetry(error, attempt)` before each retry decision and
 * `delayMs(attempt)` to determine how long to wait before the next
 * attempt. The adapter owns the sleep + attempt-counter loop.
 *
 * `attempt` is 0-indexed (first failure → attempt = 0).
 */
export interface RetryPolicy {
  /**
   * True if the error type + attempt count justify another attempt.
   * The default exponential-backoff-with-jitter policy returns false
   * for non-retryable errors (4xx except 408/429, aborts, parse
   * errors) regardless of attempt count.
   */
  readonly shouldRetry: (error: unknown, attempt: number) => boolean;
  /**
   * Milliseconds to wait before attempt N+1. Returns 0 for "no wait."
   * The default exponential-backoff implementation uses full jitter:
   * `random(0, min(maxDelayMs, baseDelayMs * 2^attempt))`.
   */
  readonly delayMs: (attempt: number) => number;
  /**
   * The maximum number of attempts (1 = no retries, 3 = default budget).
   * Adapters use this to short-circuit the retry loop without invoking
   * `shouldRetry`.
   */
  readonly maxAttempts: number;
}

// ---------------------------------------------------------------------------
// CircuitBreaker port
// ---------------------------------------------------------------------------

/**
 * Fail-fast wrapper around an async function. Three states (closed /
 * open / half-open) per the canonical Hystrix-shape pattern; the
 * port exposes only `protect()` to keep consumers state-agnostic.
 *
 * The no-op adapter (`makeNoOpCircuitBreaker()`, today's default) is
 * always closed: every call passes through. The opossum-backed
 * adapter (post-trigger activation per ADR-0017) implements the full state
 * machine + threshold tuning.
 *
 * `protect()` throws `ApiCircuitOpenError` when the breaker is open;
 * otherwise it returns whatever the inner fn returns OR re-throws
 * whatever the inner fn throws.
 */
export interface CircuitBreaker {
  readonly protect: <T>(fn: () => Promise<T>) => Promise<T>;
}

// ---------------------------------------------------------------------------
// Idempotency helpers — exposed for adapter implementations only
// ---------------------------------------------------------------------------

/**
 * Closed enum of HTTP methods considered idempotent for retry purposes.
 * POST is NOT in this set; POST retries gate on the `idempotencyKey`
 * field of `ApiRequest` (Stripe-canon rule).
 */
export const IDEMPOTENT_METHODS: ReadonlySet<ApiMethod> = new Set<ApiMethod>([
  'GET',
  'HEAD',
  'PUT',
  'DELETE',
]);

/**
 * Determine retryability for a single attempt — the canonical default.
 * Adapters MAY override via a custom `RetryPolicy`, but the default
 * captures the AWS Architecture Blog + Stripe rules in one place:
 *
 *   - Retry GET / HEAD / PUT / DELETE on transient errors.
 *   - Retry POST ONLY if the caller passed an Idempotency-Key (the
 *     server then short-circuits to the cached response on the second
 *     attempt instead of re-mutating).
 *   - Never retry abort, parse-error, or 4xx (except 408 / 429).
 *
 * The function is exposed (rather than buried in the default-retry
 * implementation) so adapter authors composing their own RetryPolicy
 * can call into the canonical rule without duplicating it.
 */
export function isRetryableForMethod(
  method: ApiMethod,
  error: unknown,
  idempotencyKey: string | undefined,
): boolean {
  if (IDEMPOTENT_METHODS.has(method)) {
    return isTransientError(error);
  }
  if (method === 'POST' && idempotencyKey !== undefined) {
    return isTransientError(error);
  }
  return false;
}

/**
 * Per AWS Architecture Blog: transient errors include network failures
 * + the well-known retryable HTTP statuses. Adapters narrow `unknown`
 * via duck-typing because the consumer-visible error types are
 * structural (see `errors.ts`).
 */
function isTransientError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  // ApiClientError taxonomy
  if ('code' in error && typeof error.code === 'string') {
    if (error.code === 'network' || error.code === 'timeout') return true;
    if (error.code === 'http-error' && 'status' in error && typeof error.status === 'number') {
      return isTransientStatus(error.status);
    }
    if (error.code === 'problem-details' && 'status' in error && typeof error.status === 'number') {
      // Server-supplied `retryable` extension overrides the canonical
      // status-based heuristic (ADR-0017 Decision G). A 503 with
      // `retryable: false` must NOT retry; a 422 with `retryable: true`
      // must. Falls back to the status table when the extension is
      // absent.
      if ('problem' in error) {
        const explicit = retryableFromProblem((error as ApiProblemError).problem);
        if (explicit !== undefined) return explicit;
      }
      return isTransientStatus(error.status);
    }
    return false;
  }
  // Node-side error codes (ECONNREFUSED etc.) leaking through a non-
  // wrapped pre-adapter path — defense in depth.
  if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
    const nodeCode = (error as { code: string }).code;
    return (
      nodeCode === 'ECONNREFUSED' ||
      nodeCode === 'ECONNRESET' ||
      nodeCode === 'ETIMEDOUT' ||
      nodeCode === 'ENOTFOUND' ||
      nodeCode === 'EAI_AGAIN'
    );
  }
  return false;
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/**
 * Re-export the error narrow types so adapter authors don't need to
 * import from two places.
 */
export type { ApiProblemError, ApiHttpError };
