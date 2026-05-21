import { test, expect } from '@playwright/test';

/**
 * Two-tier CSP verification (D59 + ADR-0005). Marketing routes ship
 * static CSP (CDN-cacheable); portal + auth routes ship nonce + strict-
 * dynamic. The branching lives in apps/web/proxy.ts.
 *
 * a11y reviewer cross-check: explicit `expect(csp).toBeDefined()`
 * before shape assertions — `?? ''` fallback would mask absence (negative
 * assertions trivially pass against empty string).
 */

test('@security marketing route ships static CSP (no nonce)', async ({ request }) => {
  const response = await request.get('/en');
  const csp = response.headers()['content-security-policy-report-only'];
  expect(csp, 'CSP report-only header must be set on marketing routes').toBeDefined();
  expect(csp).not.toMatch(/'nonce-/);
  expect(csp).not.toContain("'strict-dynamic'");
});

test('@security portal route ships nonce + strict-dynamic CSP', async ({ request }) => {
  const response = await request.get('/en/account');
  const csp = response.headers()['content-security-policy-report-only'];
  expect(csp, 'CSP report-only header must be set on portal routes').toBeDefined();
  expect(csp).toMatch(/'nonce-[A-Za-z0-9_-]+'/);
  expect(csp).toContain("'strict-dynamic'");
});

test('@security API auth route ships portal-tier CSP', async ({ request }) => {
  const response = await request.get('/api/auth/session');
  const csp = response.headers()['content-security-policy-report-only'];
  // Even though the response is 501, the proxy layer still applies CSP.
  expect(csp, 'CSP report-only header must be set on /api/auth/* routes').toBeDefined();
  expect(csp).toMatch(/'nonce-[A-Za-z0-9_-]+'/);
});
