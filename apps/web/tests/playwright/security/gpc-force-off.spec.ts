import { test, expect } from '@playwright/test';

/**
 * GPC FORCE-OFF cookie write + persistence (D100 + Disney $2.75M
 * Feb 2026 enforcement precedent). When a request arrives carrying
 * `Sec-GPC: 1` and no existing consent cookie, proxy.ts writes a
 * `__Host-quilty_consent` cookie with the opt-out persisted so the
 * choice survives later requests where the live header is absent.
 *
 * Tagged `@privacy @security` so future compliance-regression CI
 * passes pick up this spec.
 */

const CONSENT_COOKIE = '__Host-quilty_consent';

test('@security @privacy Sec-GPC: 1 on a fresh visit writes the FORCE-OFF consent cookie', async ({
  request,
}) => {
  const response = await request.get('/en', {
    headers: { 'Sec-GPC': '1' },
    maxRedirects: 0,
  });

  // proxy.ts wraps the response with the cookie write regardless of
  // the response status (200 marketing page, 307 apex redirect, etc.).
  // Playwright surfaces set-cookie via response.headersArray().
  const setCookies = response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
  const consentCookie = setCookies.find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  expect(consentCookie).toBeDefined();

  // Cookie attributes must match the `__Host-` prefix requirements:
  // Secure + Path=/ + no Domain attribute.
  expect(consentCookie ?? '').toMatch(/Secure/i);
  expect(consentCookie ?? '').toMatch(/Path=\//i);
  expect(consentCookie ?? '').not.toMatch(/Domain=/i);
});

test('@security @privacy GPC cookie payload decodes to a FORCE-OFF state', async ({ request }) => {
  const response = await request.get('/en', {
    headers: { 'Sec-GPC': '1' },
    maxRedirects: 0,
  });
  const setCookies = response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
  const consentCookie = setCookies.find((c) => c.startsWith(`${CONSENT_COOKIE}=`));

  // Cookie line shape: `__Host-quilty_consent=<base64>; Path=/; ...`.
  // Decode the base64 segment via the Web atob path (matches the
  // proxy.ts edge-runtime encode). Next.js's response.cookies.set()
  // serialiser URL-encodes the value (the trailing `==` padding of
  // base64 becomes `%3D%3D` in the wire form), so the test must
  // decodeURIComponent before atob — atob throws InvalidCharacterError
  // on the literal `%` byte.
  const rawValueEncoded = (consentCookie ?? '').split(';')[0]?.split('=')[1] ?? '';
  const rawValue = decodeURIComponent(rawValueEncoded);
  const decoded: unknown = JSON.parse(atob(rawValue));
  expect(decoded).not.toBeNull();
  expect(typeof decoded).toBe('object');
  const payload = decoded as Record<string, unknown>;

  expect(payload['essential']).toBe(true);
  // functional stays enabled for a GPC visitor: GPC opts out of sale/share
  // (analytics/marketing/personalization) only, not first-party functional
  // cookies (CCPA §7025, WA MHMDA, all CMPs). See proxy.ts for the rationale;
  // this matches the proxy.ts GPC force-off cookie writer.
  expect(payload['functional']).toBe(true);
  expect(payload['analytics']).toBe(false);
  expect(payload['marketing']).toBe(false);
  expect(payload['personalization']).toBe(false);
  expect(payload['gpc_honored']).toBe(true);
  // Provenance marker — the GPC header was present at write time (D63).
  expect(payload['gpc_detected']).toBe(true);
  expect(payload['version']).toBe('v1');
  // updated_at strictly ISO 8601 UTC; the cookie-reader's regex
  // enforces the same shape on the read side.
  expect(payload['updated_at']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
});

test('@security @privacy Sec-GPC: 1 on apex / redirect also writes the cookie (307 response carries Set-Cookie)', async ({
  request,
}) => {
  // proxy.ts has three response paths: apex `/` redirect (307),
  // `/.well-known/change-password` redirect (302), and the main
  // NextResponse.next() path. The GPC cookie write must fire on all
  // three; this test pins the apex-redirect path specifically so a
  // regression that drops the helper call from the apex branch fails
  // CI rather than silently shipping.
  const response = await request.get('/', {
    headers: { 'Sec-GPC': '1' },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  const setCookies = response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
  const consentCookie = setCookies.find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  expect(consentCookie).toBeDefined();
});

test('@security @privacy GPC absent on a fresh visit does NOT write a consent cookie', async ({
  request,
}) => {
  const response = await request.get('/en', { maxRedirects: 0 });
  const setCookies = response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
  const consentCookie = setCookies.find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  expect(consentCookie).toBeUndefined();
});

test('@security @privacy GPC suppresses the cookie banner on the rendered page', async ({
  page,
}) => {
  // Per D62 — `Sec-GPC: 1` replaces the banner with the
  // GpcHonoredIndicator that lives in the Footer.
  await page.setExtraHTTPHeaders({ 'Sec-GPC': '1' });
  await page.goto('/en');

  const banner = page.getByRole('region', { name: /cookie consent/i });
  await expect(banner).toHaveCount(0);

  // GpcHonoredIndicator paragraph appears in the marketing Footer.
  const honoredText = page.getByText(/Global Privacy Control signal/i);
  await expect(honoredText).toBeVisible();
});
