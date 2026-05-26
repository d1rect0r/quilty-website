/**
 * Native-fetch ApiClient adapter (Decision B in ADR-0017).
 *
 * Wraps native `fetch()` with the the locked composition:
 *   1. Circuit-breaker `protect()` wraps every attempt.
 *   2. Retry loop applies the configured RetryPolicy (default:
 *      exponential backoff + full jitter, idempotent-only).
 *   3. Each attempt injects `traceparent` (W3C) + `Idempotency-Key`
 *      (Stripe-canon) headers when applicable.
 *   4. Each response is parsed: 2xx → typed body; problem+json →
 *      ApiProblemError; other 4xx/5xx → ApiHttpError.
 *   5. Network / abort / parse errors are translated into the
 *      typed-error union before re-throw (ADR-0014 Rule 5).
 *
 * Per ADR-0014 + ADR-0017: vendor SDK imports are confined to this
 * file (`@opentelemetry/api`) + the uuid generator + the circuit-
 * breaker adapter files. Consumers hold a `ApiClient` port reference;
 * the openapi-fetch typed-route helper is layered on TOP of this
 * adapter at call-site convenience and is NOT a load-bearing
 * dependency of the port itself.
 *
 * Vendor-error translation policy:
 *   - DOMException 'AbortError' → ApiAbortedError
 *   - DOMException 'TimeoutError' → ApiTimeoutError
 *   - TypeError 'Failed to fetch' → ApiNetworkError
 *   - Node-side errors with .code === 'ECONNREFUSED' / 'ECONNRESET'
 *     / 'ETIMEDOUT' / 'ENOTFOUND' / 'EAI_AGAIN' → ApiNetworkError
 *   - Anything else → ApiClientError (generic 'network' code)
 */

import {
  ApiAbortedError,
  ApiHttpError,
  ApiParseError,
  ApiProblemError,
  ApiRetryBudgetExhaustedError,
} from '../errors';
import { retryAfterMsFromProblem } from '../domain/problem-details';
import { makeDefaultRetryPolicy } from '../domain/retry';
import { parseRetryAfter } from '../domain/retry';
import {
  composeHeaders,
  composeSignals,
  composeUrl,
  extractCorrelationId,
  headersToRecord,
  serializeBody,
  sleep,
  translateFetchError,
  translateHttpError,
} from './fetch-helpers';
import type { ApiClient, ApiRequest, ApiResponse, CircuitBreaker, RetryPolicy } from '../ports';

export interface FetchApiClientOptions {
  /** Base URL for ALL requests. MUST NOT end with `/`. */
  readonly baseUrl: string;
  /**
   * Circuit-breaker wrapping the inner fetch attempt. Today the
   * `makeNoOpCircuitBreaker()` adapter is always-closed; the opossum
   * adapter activates at the cascading-failure trigger per ADR-0017.
   */
  readonly circuitBreaker: CircuitBreaker;
  /**
   * Default headers applied to every request. Per-call headers in
   * `ApiRequest.headers` are merged on top (per-call wins on conflict).
   */
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  /**
   * Per-call timeout in milliseconds. Default 15_000 (15s — matches
   * the SST-configured Lambda timeout per `sst.config.ts`).
   */
  readonly timeoutMs?: number;
  /**
   * Optional `onRetry` hook fired before each retry attempt (attempt
   * ≥ 1; never on the first attempt). Used by the apps/web layer to
   * surface the user-visible "Reconnecting…" sonner toast at attempt
   * ≥ 2 per the locked UX (ADR-0017 Decision I).
   */
  readonly onRetry?: (attempt: number, error: unknown) => void;
  /**
   * Override the underlying fetch implementation. Defaults to global
   * `fetch`. Tests inject a stub; production never overrides.
   */
  readonly fetchImpl?: typeof globalThis.fetch;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function makeFetchApiClient(options: FetchApiClientOptions): ApiClient {
  if (options.baseUrl.endsWith('/')) {
    throw new Error(
      'makeFetchApiClient: baseUrl must not end with `/` (openapi-fetch convention).',
    );
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const defaultHeaders = options.defaultHeaders ?? {};
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const onRetry = options.onRetry;

  return {
    async request<TBody = unknown>(input: ApiRequest): Promise<ApiResponse<TBody>> {
      const retryPolicy =
        input.retryPolicy ??
        makeDefaultRetryPolicy({
          method: input.method,
          idempotencyKey: input.idempotencyKey,
        });

      return options.circuitBreaker.protect(async () => {
        return runWithRetry<TBody>(input, retryPolicy, onRetry, async () =>
          executeRequest<TBody>(input, {
            baseUrl: options.baseUrl,
            defaultHeaders,
            timeoutMs,
            fetchImpl,
          }),
        );
      });
    },
  };
}

interface ExecuteOptions {
  readonly baseUrl: string;
  readonly defaultHeaders: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly fetchImpl: typeof globalThis.fetch;
}

/**
 * Single attempt — composes URL + headers + body, fires the fetch,
 * parses the response, throws the typed error union on failure.
 *
 * Per-attempt timeout uses an `AbortController.signal` composed with
 * the caller-supplied `input.signal`. Either firing cancels the
 * fetch and the catch translates to `ApiAbortedError` (caller) or
 * `ApiTimeoutError` (per-attempt timeout).
 */
async function executeRequest<TBody>(
  input: ApiRequest,
  options: ExecuteOptions,
): Promise<ApiResponse<TBody>> {
  const url = composeUrl(options.baseUrl, input.path, input.query);
  const headers = composeHeaders(input, options.defaultHeaders);
  const body = serializeBody(input);

  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort('timeout'), options.timeoutMs);
  const signal = composeSignals(input.signal, timeoutController.signal);
  // Tag the timeout signal so the catch can distinguish "caller
  // aborted" (ApiAbortedError) from "we timed out" (ApiTimeoutError).
  let timedOut = false;
  timeoutController.signal.addEventListener('abort', () => {
    timedOut = true;
  });

  // Build the RequestInit conditionally so that an undefined body
  // doesn't trip exactOptionalPropertyTypes: true on the fetch
  // `RequestInit.body: BodyInit` field (which omits undefined).
  const requestInit: RequestInit = {
    method: input.method,
    headers,
    signal,
    ...(body !== undefined ? { body } : {}),
  };
  let response: Response;
  try {
    response = await options.fetchImpl(url, requestInit);
  } catch (err) {
    clearTimeout(timeoutHandle);
    throw translateFetchError(err, timedOut);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const responseHeaders = headersToRecord(response.headers);
  const correlationId = responseHeaders['x-correlation-id'] ?? responseHeaders['x-request-id'];

  if (!response.ok) {
    throw await translateHttpError(response, responseHeaders, correlationId);
  }

  // 204 No Content + HEAD: empty body. Return undefined as TBody.
  if (response.status === 204 || input.method === 'HEAD') {
    return {
      status: response.status,
      headers: responseHeaders,
      body: undefined as TBody,
      correlationId,
    };
  }

  const contentType = responseHeaders['content-type'] ?? '';
  let parsedBody: TBody;
  try {
    if (contentType.includes('application/json')) {
      parsedBody = (await response.json()) as TBody;
    } else if (contentType.startsWith('text/')) {
      parsedBody = (await response.text()) as TBody;
    } else {
      // Unknown content-type — return as text; consumers narrow.
      parsedBody = (await response.text()) as TBody;
    }
  } catch (err) {
    throw new ApiParseError({
      message: `Response body could not be parsed as ${contentType || 'unknown'}`,
      cause: err,
      correlationId,
    });
  }

  return {
    status: response.status,
    headers: responseHeaders,
    body: parsedBody,
    correlationId,
  };
}

/**
 * Retry loop — invokes `attemptFn()` up to `policy.maxAttempts` times,
 * applying `policy.delayMs(attempt)` before each retry. Server-supplied
 * `Retry-After` (from headers or Problem Details `retry_after_ms`
 * extension) overrides the exponential-backoff schedule.
 */
async function runWithRetry<TBody>(
  input: ApiRequest,
  policy: RetryPolicy,
  onRetry: ((attempt: number, error: unknown) => void) | undefined,
  attemptFn: () => Promise<ApiResponse<TBody>>,
): Promise<ApiResponse<TBody>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < policy.maxAttempts; attempt += 1) {
    if (attempt > 0) {
      const serverHint = readServerRetryHint(lastError);
      const delay = serverHint ?? policy.delayMs(attempt);
      // Abort-aware sleep: caller's AbortSignal cancels the backoff
      // immediately rather than letting the timer run to completion.
      // Without this the Lambda continues sleeping up to `maxDelayMs`
      // after the user navigates away — billed time + delayed abort
      // surface. Pass `input.signal` through so the sleep promise
      // rejects with ApiAbortedError on cancellation.
      if (delay > 0) await sleep(delay, input.signal);
      // Fire the onRetry callback on attempt ≥ 1. The apps/web layer
      // uses this to surface the sonner toast at attempt ≥ 2 per
      // ADR-0017 Decision I.
      onRetry?.(attempt, lastError);
    }
    try {
      return await attemptFn();
    } catch (err) {
      lastError = err;
      // Caller-driven abort never retries.
      if (err instanceof ApiAbortedError) throw err;
      if (!policy.shouldRetry(err, attempt)) throw err;
    }
  }
  // Budget exhausted.
  throw new ApiRetryBudgetExhaustedError({
    attempts: policy.maxAttempts,
    message: `Retry budget exhausted after ${policy.maxAttempts} attempts`,
    cause: lastError,
    correlationId: extractCorrelationId(lastError),
  });
}

function readServerRetryHint(error: unknown): number | undefined {
  if (error instanceof ApiProblemError) {
    const fromExtension = retryAfterMsFromProblem(error.problem);
    if (fromExtension !== undefined) return fromExtension;
  }
  if (error instanceof ApiHttpError) {
    // The Retry-After response header is parsed at translate-time and
    // attached to ApiHttpError.retryAfterMs. The retry loop reads it
    // here to honour the server's hint over the exponential schedule.
    if (error.retryAfterMs !== undefined) return error.retryAfterMs;
  }
  return undefined;
}

/**
 * Re-export `parseRetryAfter` for adapter tests + future enhancements.
 * Public consumers should hold the port; this is an adapter-internal helper.
 */
export { parseRetryAfter };
