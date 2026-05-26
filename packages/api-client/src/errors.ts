/**
 * `@quilty/api-client` typed error union.
 *
 * Per ADR-0014 Rule 5: every adapter MUST translate vendor-thrown errors
 * (DOMExceptions from `fetch`, `TypeError` for network failures, Node
 * `ECONNREFUSED`-shaped errors) into one of the typed members below
 * before crossing the adapter boundary. A vendor error class MUST NEVER
 * escape the adapter into consumer code.
 *
 * The union is closed; adding a new member requires an ADR amendment +
 * a contract-test extension at every adapter.
 */

import type { ProblemDetails } from './domain/problem-details';

/**
 * The base error type. All other errors extend this so consumer
 * `instanceof ApiClientError` catches the entire taxonomy.
 *
 * The `code` field is the typed discriminator — consumers switch on
 * `error.code` (string literal union) rather than `instanceof` for
 * exhaustiveness checks.
 */
export class ApiClientError extends Error {
  readonly code: ApiClientErrorCode;
  override readonly cause: unknown;
  readonly correlationId: string | undefined;

  constructor(args: {
    code: ApiClientErrorCode;
    message: string;
    cause?: unknown | undefined;
    correlationId?: string | undefined;
  }) {
    super(args.message);
    this.name = 'ApiClientError';
    this.code = args.code;
    this.cause = args.cause;
    this.correlationId = args.correlationId;
  }
}

export type ApiClientErrorCode =
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'http-error'
  | 'problem-details'
  | 'parse-error'
  | 'circuit-open'
  | 'retry-budget-exhausted';

/**
 * Transient network error — DNS failure, TCP reset, connection refused.
 * Always retryable per the retry-policy rules (Decision C in ADR-0017).
 */
export class ApiNetworkError extends ApiClientError {
  constructor(args: {
    message: string;
    cause?: unknown | undefined;
    correlationId?: string | undefined;
  }) {
    super({ code: 'network', ...args });
    this.name = 'ApiNetworkError';
  }
}

/**
 * Request timed out at the client. Distinct from `aborted` (caller-
 * driven) — this fires when our own timeout wrapper expired before the
 * adapter resolved.
 */
export class ApiTimeoutError extends ApiClientError {
  constructor(args: {
    message: string;
    cause?: unknown | undefined;
    correlationId?: string | undefined;
  }) {
    super({ code: 'timeout', ...args });
    this.name = 'ApiTimeoutError';
  }
}

/**
 * AbortController-driven cancellation. Caller-initiated; never retried.
 */
export class ApiAbortedError extends ApiClientError {
  constructor(args: {
    message: string;
    cause?: unknown | undefined;
    correlationId?: string | undefined;
  }) {
    super({ code: 'aborted', ...args });
    this.name = 'ApiAbortedError';
  }
}

/**
 * HTTP error response WITHOUT a parseable Problem Details body. Carries
 * the status code so consumers can branch (`error.status >= 500` →
 * retryable; 4xx → not retryable except 408 / 429).
 *
 * If the server emitted `application/problem+json`, the adapter throws
 * `ApiProblemError` instead, which carries the full structured payload.
 */
export class ApiHttpError extends ApiClientError {
  readonly status: number;
  readonly body: string | undefined;

  constructor(args: {
    status: number;
    message: string;
    body?: string | undefined;
    cause?: unknown | undefined;
    correlationId?: string | undefined;
  }) {
    super({
      code: 'http-error',
      message: args.message,
      cause: args.cause,
      correlationId: args.correlationId,
    });
    this.name = 'ApiHttpError';
    this.status = args.status;
    this.body = args.body;
  }
}

/**
 * Server emitted RFC 9457 `application/problem+json`. Carries the full
 * parsed Problem Details envelope; consumers map `problem.type` URI to
 * UI affordances + i18n strings via the type-registry pre-cache.
 *
 * Retryability: derived from the `retryable` extension field on the
 * Problem Details if present; default is "retry only on 503 / 504 status".
 */
export class ApiProblemError extends ApiClientError {
  readonly status: number;
  readonly problem: ProblemDetails;

  constructor(args: {
    problem: ProblemDetails;
    cause?: unknown | undefined;
    correlationId?: string | undefined;
  }) {
    super({
      code: 'problem-details',
      message: args.problem.detail || args.problem.title,
      cause: args.cause,
      correlationId: args.correlationId,
    });
    this.name = 'ApiProblemError';
    this.status = args.problem.status;
    this.problem = args.problem;
  }
}

/**
 * Response body could not be parsed as JSON (or as Problem Details).
 * Surfaces an upstream contract violation; never retried automatically.
 */
export class ApiParseError extends ApiClientError {
  constructor(args: {
    message: string;
    cause?: unknown | undefined;
    correlationId?: string | undefined;
  }) {
    super({ code: 'parse-error', ...args });
    this.name = 'ApiParseError';
  }
}

/**
 * Circuit-breaker is in the OPEN state and short-circuited the call.
 * Today the only adapter is `makeNoOpCircuitBreaker()` (always closed),
 * so this error never fires in production today; the type is locked
 * here so the future opossum-adapter swap is a one-file change.
 */
export class ApiCircuitOpenError extends ApiClientError {
  constructor(args: {
    message: string;
    cause?: unknown | undefined;
    correlationId?: string | undefined;
  }) {
    super({ code: 'circuit-open', ...args });
    this.name = 'ApiCircuitOpenError';
  }
}

/**
 * The retry policy gave up after exhausting the configured attempt
 * budget. Wraps the last attempt's underlying error in `.cause`.
 */
export class ApiRetryBudgetExhaustedError extends ApiClientError {
  readonly attempts: number;

  constructor(args: {
    attempts: number;
    message: string;
    cause?: unknown | undefined;
    correlationId?: string | undefined;
  }) {
    super({
      code: 'retry-budget-exhausted',
      ...args,
    });
    this.name = 'ApiRetryBudgetExhaustedError';
    this.attempts = args.attempts;
  }
}

/**
 * Type-guard helpers for narrow consumer handling.
 */
export function isApiClientError(value: unknown): value is ApiClientError {
  return value instanceof ApiClientError;
}

export function isApiProblemError(value: unknown): value is ApiProblemError {
  return value instanceof ApiProblemError;
}

export function isApiHttpError(value: unknown): value is ApiHttpError {
  return value instanceof ApiHttpError;
}
