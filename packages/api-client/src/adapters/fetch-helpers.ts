/**
 * Internal pipeline helpers for the native-fetch ApiClient adapter.
 *
 * Split out from `fetch.ts` to keep the orchestration loop (retry,
 * circuit-breaker, response parsing) under the 500-line KISS heuristic.
 * The helpers cluster around three concerns:
 *
 *   1. Vendor-error → typed-error translation (ADR-0014 Rule 5).
 *      `translateFetchError` + `translateHttpError`.
 *   2. Request composition — URL + headers + body + AbortSignal.
 *      `composeUrl` + `composeHeaders` + `serializeBody` + `composeSignals`.
 *   3. Misc small utilities (`headersToRecord`, `sleep`,
 *      `isAbortError`, `isNodeNetworkError`, `extractCorrelationId`).
 *
 * NOT a public surface — consumers hold the `ApiClient` port; this
 * module is consumed only by `fetch.ts` inside the same adapter
 * boundary.
 */

import {
  ApiAbortedError,
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiProblemError,
  ApiRequestError,
  ApiTimeoutError,
} from '../errors';
import { isProblemJsonContentType, parseProblemDetails } from '../domain/problem-details';
import { IDEMPOTENCY_KEY_HEADER, isValidIdempotencyKey } from '../domain/idempotency-key';
import { TRACEPARENT_HEADER } from '../domain/traceparent';
import { parseRetryAfter } from '../domain/retry';
import { currentTraceparent } from './otel-traceparent';
import type { ApiRequest } from '../ports';

// ---------------------------------------------------------------------------
// Translation helpers — vendor-error → typed-error union (ADR-0014 Rule 5)
// ---------------------------------------------------------------------------

export function translateFetchError(err: unknown, timedOut: boolean): ApiClientError {
  if (timedOut) {
    return new ApiTimeoutError({ message: 'Request timed out at the client', cause: err });
  }
  if (isAbortError(err)) {
    return new ApiAbortedError({ message: 'Request aborted by caller', cause: err });
  }
  if (isNodeNetworkError(err)) {
    const nodeCode = (err as { code: string }).code;
    return new ApiNetworkError({
      message: `Network error: ${nodeCode}`,
      cause: err,
    });
  }
  if (err instanceof TypeError) {
    // Browser fetch fires `TypeError: Failed to fetch` on network failures.
    return new ApiNetworkError({ message: 'Failed to fetch', cause: err });
  }
  return new ApiClientError({
    code: 'network',
    message: 'Unknown fetch error',
    cause: err,
  });
}

export async function translateHttpError(
  response: Response,
  responseHeaders: Readonly<Record<string, string>>,
  correlationId: string | undefined,
): Promise<ApiClientError> {
  // Parse the Retry-After header at translate time so non-problem+json
  // 429/503 responses still carry the server's retry hint through to
  // the retry loop. Without this the exponential-backoff schedule
  // alone drives retry pacing on these responses; the server's "wait
  // N seconds" hint is silently dropped (Decision C in ADR-0017).
  const retryAfterMs = parseRetryAfter(responseHeaders['retry-after']);
  const contentType = responseHeaders['content-type'] ?? '';
  if (isProblemJsonContentType(contentType)) {
    let parsedBody: unknown;
    try {
      parsedBody = await response.json();
    } catch (err) {
      // problem+json content-type but invalid JSON body → fall back to ApiHttpError.
      return new ApiHttpError({
        status: response.status,
        message: `HTTP ${response.status} with malformed problem+json body`,
        cause: err,
        retryAfterMs,
        correlationId,
      });
    }
    const problem = parseProblemDetails(parsedBody, response.status);
    return new ApiProblemError({ problem, correlationId });
  }
  let bodyText: string | undefined;
  try {
    bodyText = await response.text();
  } catch {
    // best-effort; body is optional on the ApiHttpError.
    bodyText = undefined;
  }
  return new ApiHttpError({
    status: response.status,
    message: `HTTP ${response.status} ${response.statusText}`,
    body: bodyText,
    retryAfterMs,
    correlationId,
  });
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError')
    return true;
  return false;
}

export function isNodeNetworkError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if (!('code' in err) || typeof (err as { code: unknown }).code !== 'string') return false;
  const code = (err as { code: string }).code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN'
  );
}

export function extractCorrelationId(err: unknown): string | undefined {
  if (err instanceof ApiClientError) return err.correlationId;
  return undefined;
}

// ---------------------------------------------------------------------------
// Request composition helpers
// ---------------------------------------------------------------------------

export function composeUrl(baseUrl: string, path: string, query: ApiRequest['query']): string {
  // openapi-fetch convention: baseUrl + path, with leading `/` on path.
  const normalisedPath = path.startsWith('/') ? path : `/${path}`;
  const base = `${baseUrl}${normalisedPath}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs.length > 0 ? `${base}?${qs}` : base;
}

export function composeHeaders(
  input: ApiRequest,
  defaultHeaders: Readonly<Record<string, string>>,
): Headers {
  const merged: Record<string, string> = { ...defaultHeaders };
  for (const [key, value] of Object.entries(input.headers ?? {})) {
    merged[key] = value;
  }
  // Idempotency-Key injection — Stripe canon header name.
  if (input.idempotencyKey !== undefined) {
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      throw new ApiRequestError({
        message: 'Invalid Idempotency-Key (length or character class)',
      });
    }
    merged[IDEMPOTENCY_KEY_HEADER] = input.idempotencyKey;
  }
  // W3C traceparent injection — only when an active span is in scope.
  const traceparent = currentTraceparent();
  if (traceparent !== undefined && !(TRACEPARENT_HEADER in merged)) {
    merged[TRACEPARENT_HEADER] = traceparent;
  }
  // Content-Type default for JSON bodies (callers can override).
  if (input.body !== undefined && merged['content-type'] === undefined) {
    merged['content-type'] = 'application/json';
  }
  return new Headers(merged);
}

export function serializeBody(
  input: ApiRequest,
): string | FormData | URLSearchParams | Blob | ArrayBuffer | undefined {
  if (input.body === undefined) return undefined;
  if (typeof input.body === 'string') return input.body;
  if (input.body instanceof FormData) return input.body;
  if (input.body instanceof URLSearchParams) return input.body;
  if (input.body instanceof Blob) return input.body;
  if (input.body instanceof ArrayBuffer) return input.body;
  // Default: JSON-encode objects + arrays.
  return JSON.stringify(input.body);
}

export function composeSignals(
  callerSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): AbortSignal {
  if (!callerSignal) return timeoutSignal;
  // AbortSignal.any was promoted to MDN Baseline 2024; safe in
  // Node 24 + Next.js 16 edge + modern browsers.
  if (typeof AbortSignal !== 'undefined' && 'any' in AbortSignal) {
    return (AbortSignal as unknown as { any(signals: AbortSignal[]): AbortSignal }).any([
      callerSignal,
      timeoutSignal,
    ]);
  }
  // Fallback for older runtimes: forward the caller's abort to a
  // fresh controller that also honours the timeout. Both listeners
  // share a single `forward` closure so when one signal fires, the
  // other listener self-removes via the `removeEventListener` call —
  // prevents the leaked-listener pattern on successful completions
  // where neither signal aborts (the cleanup fires from the combined
  // signal's own abort listener so it's reachable by GC).
  const combined = new AbortController();
  const forward = () => {
    combined.abort();
    callerSignal.removeEventListener('abort', forward);
    timeoutSignal.removeEventListener('abort', forward);
  };
  callerSignal.addEventListener('abort', forward, { once: true });
  timeoutSignal.addEventListener('abort', forward, { once: true });
  return combined.signal;
}

export function headersToRecord(headers: Headers): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/**
 * Abort-aware sleep — caller's AbortSignal cancels the backoff timer
 * immediately. Without this the retry loop sits up to `maxDelayMs`
 * (5000ms default) before observing an abort; on a server-side BFF
 * that's billed Lambda time the user already abandoned.
 *
 * Returns a Promise that resolves after `ms` OR rejects with
 * ApiAbortedError if the signal fires first. Already-aborted signals
 * reject synchronously (next microtask) without scheduling the timer.
 */
export function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiAbortedError({ message: 'Aborted during retry backoff' }));
      return;
    }
    const timeoutHandle = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutHandle);
      reject(new ApiAbortedError({ message: 'Aborted during retry backoff' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
