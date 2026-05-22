import { expect, test } from '@playwright/test';

/**
 * W3C TR `tracking-protection` GPC policy declaration smoke.
 *
 * The Sec-GPC: 1 request signal is detected at the edge + acted on by
 * the consent layer. This file is the matching machine-readable
 * policy publication that compliance scanners + the California AG
 * enforcement tooling read directly to verify the site honors the
 * signal. The static file is fully cacheable per the W3C spec; this
 * suite asserts on-the-wire shape only.
 */

/**
 * Tests are tagged `@seo @privacy` — `@privacy` lets future
 * compliance-regression CI passes pick up this spec without relying
 * on the SEO filter. The Sephora ($1.2M) / Disney ($2.75M) / Ford
 * ($375K) precedents make GPC regression a compliance obligation,
 * not a cosmetic SEO check.
 */

test('@seo @privacy /.well-known/gpc.json serves with status 200 + application/json', async ({
  request,
}) => {
  const response = await request.get('/.well-known/gpc.json');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type'] ?? '').toContain('application/json');
});

test('@seo @privacy /.well-known/gpc.json carries a 1h public Cache-Control', async ({
  request,
}) => {
  const response = await request.get('/.well-known/gpc.json');
  // 1h TTL — the file changes only when the policy itself changes;
  // short enough that a policy edit propagates within the hour.
  expect(response.headers()['cache-control'] ?? '').toContain('max-age=3600');
});

test('@seo @privacy /.well-known/gpc.json declares gpc=true + lastUpdate per W3C spec', async ({
  request,
}) => {
  const response = await request.get('/.well-known/gpc.json');
  // Playwright's APIResponse.json() returns `Serializable = any`. The
  // `as` direct-cast to a named shape would mask a `null` body at
  // runtime; narrow from `unknown` with explicit runtime guards so a
  // malformed file fails as a test, not as a thrown exception.
  const rawBody: unknown = await response.json();
  expect(rawBody).not.toBeNull();
  expect(typeof rawBody).toBe('object');
  const body = rawBody as { gpc?: unknown; version?: unknown; lastUpdate?: unknown };

  // The boolean assertion is the actual machine-readable commitment:
  // declaring `gpc: false` here would be the policy-level inverse of
  // the runtime Sec-GPC honoring.
  expect(body.gpc).toBe(true);

  // `version` is non-normative per W3C TR but ships in every reference
  // implementation (Linear, Stripe, Anthropic, BetterHelp). 1 is the
  // current GPC spec revision.
  expect(body.version).toBe(1);

  // ISO 8601 date — YYYY-MM-DD. Spec permits longer forms but the
  // shortest valid form is convention.
  const rawLastUpdate = body.lastUpdate;
  expect(typeof rawLastUpdate).toBe('string');
  expect(rawLastUpdate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // Defense against shipping a future-dated lastUpdate (would suggest
  // a clock-skew or copy-paste error) or a stale value (suggests the
  // policy publication has drifted from the runtime behavior).
  // 1-year window matches enforcement-audit expectations + the W3C
  // TR review cadence.
  const lastUpdate = new Date(rawLastUpdate as string);
  const now = Date.now();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  expect(lastUpdate.getTime()).toBeLessThanOrEqual(now);
  expect(now - lastUpdate.getTime()).toBeLessThan(oneYearMs);
});
