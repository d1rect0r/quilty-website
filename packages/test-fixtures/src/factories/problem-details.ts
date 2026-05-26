/**
 * ProblemDetailsFactory — fixture builder for RFC 9457 Problem Details
 * payloads that conform to the `@quilty/api-client` parser.
 *
 * One builder per registry slug (12 today per ADR-0017 Decision G).
 * Builders default to a representative example of each problem type;
 * callers override via the partial map argument.
 *
 * Usage:
 *
 *   const problem = ProblemDetailsFactory.rateLimit({ retryAfterMs: 5000 });
 *   const problem = ProblemDetailsFactory.validation({
 *     fieldErrors: { email: 'invalid' },
 *   });
 *
 * The output shape mirrors what `parseProblemDetails()` would emit
 * against a canonical RFC 9457 response from the Rust backend. Tests
 * can pass these straight into `new ApiProblemError({ problem })`
 * without needing a live HTTP roundtrip.
 */

import { faker } from '../faker';

export type ProblemTypeSlug =
  | 'validation'
  | 'csrf'
  | 'rate-limit'
  | 'auth-required'
  | 'forbidden'
  | 'consent-required'
  | 'session-expired'
  | 'step-up-required'
  | 'not-found'
  | 'service-unavailable'
  | 'idempotency-key-conflict'
  | 'precondition-failed';

export interface ProblemDetailsFixture {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string | undefined;
  readonly correlationId: string | undefined;
  readonly extensions: Readonly<Record<string, unknown>>;
  readonly slug: ProblemTypeSlug | undefined;
}

const SLUG_TO_HTTP_STATUS: Readonly<Record<ProblemTypeSlug, number>> = {
  validation: 422,
  csrf: 403,
  'rate-limit': 429,
  'auth-required': 401,
  forbidden: 403,
  'consent-required': 403,
  'session-expired': 401,
  'step-up-required': 401,
  'not-found': 404,
  'service-unavailable': 503,
  'idempotency-key-conflict': 409,
  'precondition-failed': 412,
};

function makeCorrelationId(): string {
  // The canonical correlation-id is the `q1m_<crockford-base32>` shape
  // minted by apps/web/lib/correlation-id.ts; we mirror the shape here
  // without depending on the apps/web package.
  return `q1m_${faker.string.alphanumeric({ length: 10, casing: 'lower' })}`;
}

function baseProblem(slug: ProblemTypeSlug, overrides: Partial<ProblemDetailsFixture> = {}) {
  const status = overrides.status ?? SLUG_TO_HTTP_STATUS[slug];
  const correlationId = overrides.correlationId ?? makeCorrelationId();
  return {
    type: overrides.type ?? `https://my-quilty.com/problems/v1/${slug}`,
    title: overrides.title ?? humanize(slug),
    status,
    detail: overrides.detail ?? faker.lorem.sentence({ min: 6, max: 12 }),
    instance: overrides.instance ?? undefined,
    correlationId,
    extensions: overrides.extensions ?? {},
    slug,
  } as const;
}

function humanize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const ProblemDetailsFactory = {
  validation(overrides?: {
    fieldErrors?: Record<string, string>;
    extensions?: Record<string, unknown>;
    detail?: string;
  }): ProblemDetailsFixture {
    return baseProblem('validation', {
      detail: overrides?.detail ?? 'One or more fields failed validation.',
      extensions: { field_errors: overrides?.fieldErrors ?? {}, ...overrides?.extensions },
    });
  },
  csrf(): ProblemDetailsFixture {
    return baseProblem('csrf', { detail: 'CSRF token missing or invalid.' });
  },
  rateLimit(overrides?: { retryAfterMs?: number }): ProblemDetailsFixture {
    return baseProblem('rate-limit', {
      detail: 'Too many requests. Please slow down.',
      extensions: { retry_after_ms: overrides?.retryAfterMs ?? 1000 },
    });
  },
  authRequired(): ProblemDetailsFixture {
    return baseProblem('auth-required', { detail: 'Authentication is required.' });
  },
  forbidden(): ProblemDetailsFixture {
    return baseProblem('forbidden', { detail: 'You do not have permission for this resource.' });
  },
  consentRequired(): ProblemDetailsFixture {
    return baseProblem('consent-required', {
      detail: 'User consent is required for this operation.',
    });
  },
  sessionExpired(): ProblemDetailsFixture {
    return baseProblem('session-expired', { detail: 'Your session has expired.' });
  },
  stepUpRequired(): ProblemDetailsFixture {
    return baseProblem('step-up-required', {
      detail: 'A recent re-authentication is required for this action.',
    });
  },
  notFound(): ProblemDetailsFixture {
    return baseProblem('not-found', { detail: 'The requested resource was not found.' });
  },
  serviceUnavailable(overrides?: {
    retryable?: boolean;
    retryAfterMs?: number;
  }): ProblemDetailsFixture {
    return baseProblem('service-unavailable', {
      detail: 'The service is temporarily unavailable.',
      extensions: {
        ...(overrides?.retryable !== undefined ? { retryable: overrides.retryable } : {}),
        ...(overrides?.retryAfterMs !== undefined
          ? { retry_after_ms: overrides.retryAfterMs }
          : {}),
      },
    });
  },
  idempotencyKeyConflict(): ProblemDetailsFixture {
    return baseProblem('idempotency-key-conflict', {
      detail: 'An idempotency key was reused with a different request body.',
    });
  },
  preconditionFailed(): ProblemDetailsFixture {
    return baseProblem('precondition-failed', {
      detail: 'A precondition (e.g. If-Match) was not satisfied.',
    });
  },
};
