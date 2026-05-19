import { test, expect } from '@playwright/test';

/**
 * Security-headers contract (D33 + D58 + D60). Every response must carry
 * the baseline set. Verified against the marketing homepage; identical
 * headers apply to every non-static route via proxy.ts.
 */

test('@security marketing route carries full headers baseline', async ({ request }) => {
  const response = await request.get('/en');
  const headers = response.headers();

  // HSTS — M1 starts at max-age=300 per the ramp (D60).
  expect(headers['strict-transport-security']).toMatch(/max-age=\d+/);

  // Content-type sniffing (D58)
  expect(headers['x-content-type-options']).toBe('nosniff');

  // Clickjacking — belt-and-suspenders with CSP frame-ancestors
  expect(headers['x-frame-options']).toBe('DENY');

  // Cross-origin isolation (D58)
  expect(headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
  expect(headers['cross-origin-resource-policy']).toBe('same-origin');

  // Referrer policy (D33)
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

  // Permissions policy default-deny — explicit toBeDefined before shape
  // assertions (Round-5 TS reviewer cross-check parity with csp.spec.ts).
  const perm = headers['permissions-policy'];
  expect(perm, 'Permissions-Policy header must be set').toBeDefined();
  expect(perm).toContain('camera=()');
  expect(perm).toContain('microphone=()');
  expect(perm).toContain('geolocation=()');
  expect(perm).toContain('payment=()');
});

test('@security CSP report-only header is present on marketing routes', async ({ request }) => {
  const response = await request.get('/en');
  const csp = response.headers()['content-security-policy-report-only'];
  expect(csp).toBeDefined();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  // M1 ships report-only; M8 flips to enforce.
  expect(response.headers()['content-security-policy']).toBeUndefined();
});

test('@security Trusted Types directive is present in CSP (report-only)', async ({ request }) => {
  const response = await request.get('/en');
  const csp = response.headers()['content-security-policy-report-only'];
  expect(csp).toContain("require-trusted-types-for 'script'");
});
