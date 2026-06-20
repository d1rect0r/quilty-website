/**
 * Parity test for `gpc-force-off.cff.js` against `proxy.ts`
 * `applyGpcForceOffCookie`.
 *
 * The CFF is a viewer-response handler. It reads `Sec-GPC` from the
 * forwarded request headers + writes the consent cookie to the
 * response. The test imports `TAXONOMY_VERSION` + `COOKIE_REGISTRY`
 * from `@quilty/consent` and asserts CFF output equality — version
 * + Max-Age drift fails CI before activation.
 */

import { describe, expect, it } from 'vitest';
import { CONSENT_COOKIE_NAME, COOKIE_REGISTRY, TAXONOMY_VERSION } from '@quilty/consent';
import { loadCfHandler, makeViewerResponse, type CfViewerResponseEvent } from './cf-runtime-stub';

const handler = loadCfHandler('gpc-force-off.cff.js');

// Resolve the canonical max-age from the cookie registry — the CFF
// hardcodes a literal that MUST equal this value (drift = CI fail).
const registryEntry = COOKIE_REGISTRY.find((c) => c.name === CONSENT_COOKIE_NAME);
if (registryEntry === undefined || registryEntry.lifetime === 'session') {
  throw new Error('COOKIE_REGISTRY missing __Host-quilty_consent or has session lifetime');
}
const EXPECTED_MAX_AGE_SECONDS = registryEntry.lifetime * 24 * 60 * 60;

describe('gpc-force-off CFF — parity against proxy.ts', () => {
  it('writes the GPC FORCE-OFF cookie when Sec-GPC: 1 + no consent cookie + 2xx response', () => {
    const event = makeViewerResponse(
      { headers: { 'sec-gpc': { value: '1' } }, cookies: {} },
      { statusCode: 200 },
    );
    const result = handler(event) as CfViewerResponseEvent['response'];
    const cookie = result.cookies['__Host-quilty_consent'];
    expect(cookie).toBeDefined();
  });

  it('cookie payload keeps functional, denies sale/share categories, GPC-stamped', () => {
    const event = makeViewerResponse(
      { headers: { 'sec-gpc': { value: '1' } }, cookies: {} },
      { statusCode: 200 },
    );
    const result = handler(event) as CfViewerResponseEvent['response'];
    const cookie = result.cookies['__Host-quilty_consent'];
    const decoded = Buffer.from(cookie?.value ?? '', 'base64').toString('utf8');
    const payload = JSON.parse(decoded);

    expect(payload.essential).toBe(true);
    expect(payload.functional).toBe(true);
    expect(payload.analytics).toBe(false);
    expect(payload.marketing).toBe(false);
    expect(payload.personalization).toBe(false);
    expect(payload.gpc_detected).toBe(true);
    expect(payload.gpc_honored).toBe(true);
    // Drift-detection: CFF version literal must equal canonical
    // TAXONOMY_VERSION from @quilty/consent.
    expect(payload.version).toBe(TAXONOMY_VERSION);
    expect(typeof payload.updated_at).toBe('string');
    expect(() => new Date(payload.updated_at).toISOString()).not.toThrow();
  });

  it('cookie attributes match COOKIE_REGISTRY-derived Max-Age (CCPA/CPRA cadence)', () => {
    const event = makeViewerResponse(
      { headers: { 'sec-gpc': { value: '1' } }, cookies: {} },
      { statusCode: 200 },
    );
    const result = handler(event) as CfViewerResponseEvent['response'];
    const attrs = result.cookies['__Host-quilty_consent']?.attributes ?? '';

    expect(attrs).toContain('Secure');
    expect(attrs).toContain('SameSite=Lax');
    expect(attrs).toContain('Path=/');
    expect(attrs).toContain(`Max-Age=${EXPECTED_MAX_AGE_SECONDS}`);
    // HttpOnly is deliberately omitted (client-readable consent state).
    expect(attrs).not.toContain('HttpOnly');
  });

  it('does NOT write the cookie when Sec-GPC is absent', () => {
    const event = makeViewerResponse({ headers: {}, cookies: {} }, { statusCode: 200 });
    const result = handler(event) as CfViewerResponseEvent['response'];
    expect(result.cookies['__Host-quilty_consent']).toBeUndefined();
  });

  it('does NOT write the cookie when Sec-GPC is "0"', () => {
    const event = makeViewerResponse(
      { headers: { 'sec-gpc': { value: '0' } } },
      { statusCode: 200 },
    );
    const result = handler(event) as CfViewerResponseEvent['response'];
    expect(result.cookies['__Host-quilty_consent']).toBeUndefined();
  });

  it('does NOT overwrite an existing consent cookie (idempotency parity)', () => {
    // Pre-populate the RESPONSE side too so this test fails loudly if
    // the idempotency guard is ever removed — without the guard, the
    // CFF would write to `response.cookies['__Host-quilty_consent']`
    // and the assertion would catch the value change.
    const sentinelExistingCookieValue = 'previously-set-by-origin';
    const event = makeViewerResponse(
      {
        headers: { 'sec-gpc': { value: '1' } },
        cookies: { '__Host-quilty_consent': { value: 'existing-on-request' } },
      },
      {
        statusCode: 200,
        cookies: {
          '__Host-quilty_consent': { value: sentinelExistingCookieValue },
        },
      },
    );
    const result = handler(event) as CfViewerResponseEvent['response'];
    // Guard fires → response.cookies is untouched, so the sentinel
    // value the test seeded earlier remains in place. If the guard
    // were removed, the CFF would overwrite with the encoded payload
    // and this assertion would fail.
    expect(result.cookies['__Host-quilty_consent']?.value).toBe(sentinelExistingCookieValue);
  });

  it('does NOT write the cookie on a 4xx response (status gate)', () => {
    const event = makeViewerResponse(
      { headers: { 'sec-gpc': { value: '1' } }, cookies: {} },
      { statusCode: 404 },
    );
    const result = handler(event) as CfViewerResponseEvent['response'];
    expect(result.cookies['__Host-quilty_consent']).toBeUndefined();
  });

  it('does NOT write the cookie on a 5xx response (status gate)', () => {
    const event = makeViewerResponse(
      { headers: { 'sec-gpc': { value: '1' } }, cookies: {} },
      { statusCode: 503 },
    );
    const result = handler(event) as CfViewerResponseEvent['response'];
    expect(result.cookies['__Host-quilty_consent']).toBeUndefined();
  });

  it('writes the cookie on a 3xx response (redirect path)', () => {
    const event = makeViewerResponse(
      { headers: { 'sec-gpc': { value: '1' } }, cookies: {} },
      { statusCode: 307 },
    );
    const result = handler(event) as CfViewerResponseEvent['response'];
    expect(result.cookies['__Host-quilty_consent']).toBeDefined();
  });

  it('returns the response object (CFF viewer-response return contract)', () => {
    const event = makeViewerResponse({ headers: { 'sec-gpc': { value: '1' } } });
    const result = handler(event);
    expect(result).toBe(event.response);
  });
});
