import { describe, expect, it } from 'vitest';
import {
  isProblemJsonContentType,
  parseProblemDetails,
  retryAfterMsFromProblem,
  retryableFromProblem,
} from '../src/domain/problem-details';
import { PROBLEM_TYPES, RECOMMENDED_STATUS, slugForUri } from '../src/domain/problem-types';

describe('parseProblemDetails — canonical RFC 9457 shape', () => {
  it('parses a fully-specified canonical payload', () => {
    const body = {
      type: PROBLEM_TYPES.validation,
      title: 'Validation Failed',
      status: 400,
      detail: 'Email field is invalid',
      instance: '/v1/auth/signup',
      field_errors: { email: 'must be a valid email' },
    };
    const result = parseProblemDetails(body, 400);
    expect(result.type).toBe(PROBLEM_TYPES.validation);
    expect(result.title).toBe('Validation Failed');
    expect(result.status).toBe(400);
    expect(result.detail).toBe('Email field is invalid');
    expect(result.instance).toBe('/v1/auth/signup');
    expect(result.slug).toBe('validation');
    expect(result.extensions.field_errors).toEqual({ email: 'must be a valid email' });
  });

  it('falls back to httpStatus when status omitted', () => {
    const body = { type: PROBLEM_TYPES.csrf, title: 'CSRF Failed', detail: 'Token mismatch' };
    const result = parseProblemDetails(body, 403);
    expect(result.status).toBe(403);
  });

  it('synthesizes title from httpStatus when omitted', () => {
    const result = parseProblemDetails({}, 500);
    expect(result.title).toBe('HTTP 500');
    expect(result.type).toBe('about:blank');
    expect(result.slug).toBeUndefined();
  });

  it('puts non-canonical fields into extensions', () => {
    const body = {
      type: PROBLEM_TYPES['rate-limit'],
      title: 'Too Many Requests',
      status: 429,
      detail: 'Slow down',
      retry_after_ms: 5000,
      retryable: true,
    };
    const result = parseProblemDetails(body, 429);
    expect(result.extensions.retry_after_ms).toBe(5000);
    expect(result.extensions.retryable).toBe(true);
    // canonical keys should NOT leak into extensions
    expect('type' in result.extensions).toBe(false);
    expect('title' in result.extensions).toBe(false);
  });

  it('promotes correlation_id from extensions to top-level field', () => {
    // Per QA Phase B finding: Rust backend's actual emission shape
    // (verified against quilty-aws/...auth-user/tests/snapshots/*.snap)
    // includes a top-level `correlation_id` field. Promoting it to a
    // first-class field on ProblemDetails lets consumers render
    // "Support ref: q1m_xyz" without rummaging through extensions.
    const body = {
      type: PROBLEM_TYPES.validation,
      title: 'Validation Failed',
      status: 400,
      detail: 'Email invalid',
      correlation_id: 'q1m_a1b2c3d4',
    };
    const result = parseProblemDetails(body, 400);
    expect(result.correlationId).toBe('q1m_a1b2c3d4');
    // Promoted out of extensions — no double exposure.
    expect('correlation_id' in result.extensions).toBe(false);
  });

  it('emits undefined correlationId when the server did not emit one', () => {
    const result = parseProblemDetails({ type: PROBLEM_TYPES.validation, status: 400 }, 400);
    expect(result.correlationId).toBeUndefined();
  });
});

describe('parseProblemDetails — Rust-backend wrapper shape', () => {
  it('translates { error: { code, message, details } } into canonical envelope', () => {
    const body = {
      error: {
        code: 'session-expired',
        message: 'Your session has expired',
        details: { last_activity: '2026-05-26T12:00:00Z' },
      },
    };
    const result = parseProblemDetails(body, 401);
    expect(result.slug).toBe('session-expired');
    expect(result.type).toBe(PROBLEM_TYPES['session-expired']);
    expect(result.detail).toBe('Your session has expired');
    expect(result.status).toBe(401);
    expect(result.extensions.error_code).toBe('session-expired');
    expect(result.extensions.last_activity).toBe('2026-05-26T12:00:00Z');
  });

  it('emits urn: scheme type URI for unknown error codes', () => {
    const body = { error: { code: 'unknown_vendor_error', message: 'Internal' } };
    const result = parseProblemDetails(body, 500);
    expect(result.type).toBe('urn:quilty:error:unknown-vendor-error');
    expect(result.slug).toBeUndefined();
  });

  it('handles missing code or message gracefully', () => {
    const result = parseProblemDetails({ error: {} }, 502);
    expect(result.detail).toBe('HTTP 502');
    expect(result.title).toBe('unknown');
  });
});

describe('parseProblemDetails — defensive fallbacks', () => {
  it('synthesizes a fallback envelope for null/non-object bodies', () => {
    const result = parseProblemDetails(null, 503);
    expect(result.status).toBe(503);
    expect(result.title).toBe('HTTP 503');
    expect(result.type).toBe('about:blank');
  });

  it('synthesizes a fallback envelope for strings', () => {
    const result = parseProblemDetails('not a json object', 500);
    expect(result.status).toBe(500);
    expect(result.type).toBe('about:blank');
  });
});

describe('isProblemJsonContentType', () => {
  it('matches the canonical media type', () => {
    expect(isProblemJsonContentType('application/problem+json')).toBe(true);
    expect(isProblemJsonContentType('application/problem+json; charset=utf-8')).toBe(true);
    expect(isProblemJsonContentType('APPLICATION/PROBLEM+JSON')).toBe(true);
  });

  it('rejects application/json and other types', () => {
    expect(isProblemJsonContentType('application/json')).toBe(false);
    expect(isProblemJsonContentType('text/html')).toBe(false);
    expect(isProblemJsonContentType('')).toBe(false);
    expect(isProblemJsonContentType(null)).toBe(false);
    expect(isProblemJsonContentType(undefined)).toBe(false);
  });
});

describe('retryAfterMsFromProblem + retryableFromProblem', () => {
  it('reads retry_after_ms extension when present', () => {
    const body = { type: PROBLEM_TYPES['rate-limit'], status: 429, retry_after_ms: 3000 };
    const result = parseProblemDetails(body, 429);
    expect(retryAfterMsFromProblem(result)).toBe(3000);
  });

  it('returns undefined when retry_after_ms is missing or invalid', () => {
    const result = parseProblemDetails({ type: PROBLEM_TYPES['rate-limit'], status: 429 }, 429);
    expect(retryAfterMsFromProblem(result)).toBeUndefined();
    const result2 = parseProblemDetails(
      { type: PROBLEM_TYPES['rate-limit'], status: 429, retry_after_ms: -1 },
      429,
    );
    expect(retryAfterMsFromProblem(result2)).toBeUndefined();
  });

  it('reads retryable extension when present', () => {
    const body = { type: PROBLEM_TYPES.validation, status: 400, retryable: false };
    const result = parseProblemDetails(body, 400);
    expect(retryableFromProblem(result)).toBe(false);
  });
});

describe('PROBLEM_TYPES registry', () => {
  it('declares 12 canonical types', () => {
    // 11 originals + 'forbidden' (added Phase B for Rust backend
    // ERR_FORBIDDEN 403 responses that don't match the 'csrf' shape).
    expect(Object.keys(PROBLEM_TYPES)).toHaveLength(12);
  });

  it('all URIs share the my-quilty.com/problems/v1 prefix', () => {
    for (const uri of Object.values(PROBLEM_TYPES)) {
      expect(uri.startsWith('https://my-quilty.com/problems/v1/')).toBe(true);
    }
  });

  it('slugForUri round-trips for every registered type', () => {
    for (const [slug, uri] of Object.entries(PROBLEM_TYPES)) {
      expect(slugForUri(uri)).toBe(slug);
    }
  });

  it('includes the forbidden slug for Rust-backend ERR_FORBIDDEN 403 responses', () => {
    // Per QA Phase B enterprise-comparison: Rust emits ERR_FORBIDDEN at
    // status 403 that does not slug-match `csrf` (csrf is a specific
    // CSRF-triple-layer failure shape). The `forbidden` slug captures
    // the general permission-denied case.
    expect(PROBLEM_TYPES.forbidden).toBe('https://my-quilty.com/problems/v1/forbidden');
    expect(slugForUri(PROBLEM_TYPES.forbidden)).toBe('forbidden');
  });

  it('slugForUri returns undefined for unknown URIs', () => {
    expect(slugForUri('https://my-quilty.com/problems/v1/unknown')).toBeUndefined();
    expect(slugForUri('https://example.com/problems/foo')).toBeUndefined();
  });

  it('RECOMMENDED_STATUS covers all 11 slugs', () => {
    for (const slug of Object.keys(PROBLEM_TYPES)) {
      expect(typeof RECOMMENDED_STATUS[slug as keyof typeof RECOMMENDED_STATUS]).toBe('number');
    }
  });
});
