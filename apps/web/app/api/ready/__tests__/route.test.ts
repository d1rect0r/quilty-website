import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/ready Route Handler contract tests.
 *
 * Four invariants under test:
 *   1. Pre-activation (today): status 503 + `status: 'degraded'`
 *      because every dependency reports `synthetic-ok` (not `ok`).
 *      Conservative default: load balancer drains traffic until
 *      the runbook activation wires live probes that report `ok`.
 *   2. Body shape: `{ status, timestamp, dependencies: { ... } }`.
 *      Each dependency carries `{ status, duration_ms, message? }`.
 *   3. Response headers: `X-Robots-Tag: noindex, nofollow` +
 *      `Cache-Control: no-store` (mirrors /api/health).
 *   4. Body shape stable across status codes (a 503 still carries
 *      a full envelope so observability tooling can parse).
 */

describe('GET /api/ready', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Defensive: parity with /api/health test. Both Route Handlers
    // read state at request time today, but a future optimisation
    // that caches at module init would silently break test isolation
    // without `resetModules`. Keep the suites symmetric so a single
    // pattern covers every Route Handler test.
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 + `status: degraded` pre-activation (synthetic probes)', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      status: string;
      timestamp: string;
      dependencies: Record<string, { status: string }>;
    };
    expect(body.status).toBe('degraded');
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('lists the canonical dependencies (dynamodb, sentry_ingest)', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    const body = (await res.json()) as {
      dependencies: Record<string, { status: string; duration_ms: number; message?: string }>;
    };
    expect(body.dependencies).toHaveProperty('dynamodb');
    expect(body.dependencies).toHaveProperty('sentry_ingest');
    expect(body.dependencies['dynamodb']?.status).toBe('synthetic-ok');
    expect(body.dependencies['sentry_ingest']?.status).toBe('synthetic-ok');
  });

  it('each dependency carries duration_ms (numeric) + optional message', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    const body = (await res.json()) as {
      dependencies: Record<string, { duration_ms: number; message?: string }>;
    };
    for (const dep of Object.values(body.dependencies)) {
      expect(typeof dep.duration_ms).toBe('number');
      if (dep.message !== undefined) expect(typeof dep.message).toBe('string');
    }
  });

  it('emits X-Robots-Tag: noindex, nofollow + Cache-Control: no-store headers', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('responds within 300ms p99 (synthetic checks; live ingress raises this floor)', async () => {
    const { GET } = await import('../route');
    const before = Date.now();
    await GET();
    const elapsed = Date.now() - before;
    expect(elapsed).toBeLessThan(300);
  });
});
