import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/health Route Handler contract tests.
 *
 * Three invariants under test:
 *   1. Status 200 always (the endpoint is liveness — if the
 *      Lambda is alive, this returns 200; downstream dependencies
 *      are irrelevant per the Kubernetes liveness convention).
 *   2. Response body shape: `{ status: 'ok', version, timestamp }`.
 *      `version` reflects `NEXT_PUBLIC_BUILD_SHA` env var when
 *      set; falls back to `'unknown'`.
 *   3. Response headers: `X-Robots-Tag: noindex, nofollow` +
 *      `Cache-Control: no-store`.
 */

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Defensive: reset module cache so each `await import('../route')`
    // re-evaluates the module under the current env stub. The handler
    // reads `process.env` on every GET() invocation today (not at
    // import time), but a future optimisation that caches the value
    // at module init would silently break the fallback-path tests
    // without `resetModules`.
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 200 with `status: ok` and an ISO 8601 timestamp', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('reflects NEXT_PUBLIC_BUILD_SHA in the `version` field when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', 'abc123def');
    const { GET } = await import('../route');
    const res = await GET();
    const body = (await res.json()) as { version: string };
    expect(body.version).toBe('abc123def');
  });

  it('falls back to `version: "unknown"` when build SHA is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', '');
    const { GET } = await import('../route');
    const res = await GET();
    const body = (await res.json()) as { version: string };
    expect(body.version).toBe('unknown');
  });

  it('emits X-Robots-Tag: noindex, nofollow + Cache-Control: no-store headers', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('responds within a 100ms p99 budget (cold-start tolerance)', async () => {
    const { GET } = await import('../route');
    const before = Date.now();
    await GET();
    const elapsed = Date.now() - before;
    // The actual cold-start adds 500ms in production; this unit
    // test verifies the handler body itself completes in the budget.
    expect(elapsed).toBeLessThan(100);
  });
});
