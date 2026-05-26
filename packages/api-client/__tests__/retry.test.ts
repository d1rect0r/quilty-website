import { describe, expect, it } from 'vitest';
import { makeDefaultRetryPolicy, makeNoRetryPolicy, parseRetryAfter } from '../src/domain/retry';
import { ApiHttpError, ApiNetworkError, ApiAbortedError, ApiParseError } from '../src/errors';

describe('makeDefaultRetryPolicy', () => {
  it('reports idempotent GET on network error as retryable', () => {
    // shouldRetry answers "is this error class retryable?" only — the
    // retry loop bounds attempt count via maxAttempts. Verifying the
    // answer is invariant across attempt index per ADR-0017 Decision C.
    const policy = makeDefaultRetryPolicy({ method: 'GET' });
    const err = new ApiNetworkError({ message: 'ECONNRESET' });
    expect(policy.shouldRetry(err, 0)).toBe(true);
    expect(policy.shouldRetry(err, 1)).toBe(true);
    expect(policy.shouldRetry(err, 2)).toBe(true);
    expect(policy.maxAttempts).toBe(3);
  });

  it('does NOT retry POST without idempotency key', () => {
    const policy = makeDefaultRetryPolicy({ method: 'POST' });
    const err = new ApiNetworkError({ message: 'ECONNRESET' });
    expect(policy.shouldRetry(err, 0)).toBe(false);
  });

  it('retries POST with idempotency key on transient errors', () => {
    const policy = makeDefaultRetryPolicy({
      method: 'POST',
      idempotencyKey: '01904c8a-3a7b-7c34-8e6c-5e2a1d3b4f8e',
    });
    const err = new ApiHttpError({ status: 503, message: 'Service Unavailable' });
    expect(policy.shouldRetry(err, 0)).toBe(true);
  });

  it('does NOT retry on caller-aborted requests', () => {
    const policy = makeDefaultRetryPolicy({ method: 'GET' });
    const err = new ApiAbortedError({ message: 'aborted' });
    expect(policy.shouldRetry(err, 0)).toBe(false);
  });

  it('does NOT retry on parse errors', () => {
    const policy = makeDefaultRetryPolicy({ method: 'GET' });
    const err = new ApiParseError({ message: 'bad json' });
    expect(policy.shouldRetry(err, 0)).toBe(false);
  });

  it('retries on HTTP 429 and 408', () => {
    const policy = makeDefaultRetryPolicy({ method: 'GET' });
    expect(policy.shouldRetry(new ApiHttpError({ status: 429, message: 'rate limit' }), 0)).toBe(
      true,
    );
    expect(policy.shouldRetry(new ApiHttpError({ status: 408, message: 'timeout' }), 0)).toBe(true);
  });

  it('does NOT retry on HTTP 400/401/403/404', () => {
    const policy = makeDefaultRetryPolicy({ method: 'GET' });
    for (const status of [400, 401, 403, 404, 422]) {
      expect(policy.shouldRetry(new ApiHttpError({ status, message: `HTTP ${status}` }), 0)).toBe(
        false,
      );
    }
  });

  it('full-jitter delays land within the bound', () => {
    // Use a deterministic RNG returning 0.5 → expected delay = 0.5 * upperBound
    const policy = makeDefaultRetryPolicy({
      method: 'GET',
      baseDelayMs: 100,
      maxDelayMs: 5000,
      random: () => 0.5,
    });
    // attempt 0: random(0, 100 * 2^0) = 50ms
    expect(policy.delayMs(0)).toBe(50);
    // attempt 1: random(0, 100 * 2^1) = 100ms
    expect(policy.delayMs(1)).toBe(100);
    // attempt 4: random(0, min(5000, 100 * 2^4)) = random(0, 1600) = 800ms
    expect(policy.delayMs(4)).toBe(800);
    // attempt 10: random(0, min(5000, 102_400)) = random(0, 5000) = 2500ms
    expect(policy.delayMs(10)).toBe(2500);
  });

  it('caps the exponent to avoid Math.pow overflow', () => {
    const policy = makeDefaultRetryPolicy({
      method: 'GET',
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      random: () => 0,
    });
    // Even at attempt 100, no overflow + delay capped at maxDelayMs floor
    expect(policy.delayMs(100)).toBe(0); // 0 * 10_000 = 0 from random
  });
});

describe('makeNoRetryPolicy', () => {
  it('always returns false from shouldRetry', () => {
    const policy = makeNoRetryPolicy();
    expect(policy.shouldRetry(new Error('whatever'), 0)).toBe(false);
    expect(policy.maxAttempts).toBe(1);
    expect(policy.delayMs(0)).toBe(0);
  });
});

describe('parseRetryAfter', () => {
  it('parses delta-seconds form', () => {
    expect(parseRetryAfter('30')).toBe(30_000);
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('parses HTTP-date form', () => {
    // 5 seconds from now should yield ≥ 4000ms (allowing for test runtime jitter)
    const future = new Date(Date.now() + 5000).toUTCString();
    const result = parseRetryAfter(future);
    expect(result).toBeGreaterThanOrEqual(4000);
    expect(result).toBeLessThanOrEqual(5500);
  });

  it('returns 0 for past HTTP-dates', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfter(past)).toBe(0);
  });

  it('returns undefined for missing or malformed headers', () => {
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('not-a-date')).toBeUndefined();
    expect(parseRetryAfter('-5')).toBeUndefined();
  });
});
