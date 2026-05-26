/**
 * GPC FORCE-OFF cookie write — CloudFront Function (viewer-response).
 *
 * Mirrors `applyGpcForceOffCookie` in `apps/web/proxy.ts`. When a
 * request carries `Sec-GPC: 1` AND no `__Host-quilty_consent` cookie
 * exists, writes a default-deny consent snapshot stamped with
 * `gpc_detected: true / gpc_honored: true` (Disney $2.75M Feb 2026
 * enforcement precedent, D63 + D100).
 *
 * Single-CFF design (viewer-response reads request headers directly,
 * avoiding the inter-CFF stash + dual-write race). Status-gated to
 * 2xx + 3xx; cached error pages do not receive consent cookies.
 *
 * Constraints: CFF runtime v2 (ES2020 subset, no Node APIs, 1ms
 * budget, ~10KB bundle, single-file no-import). TAXONOMY_VERSION
 * ('v1') + Max-Age (15552000 = 180 days) are hardcoded to match
 * `@quilty/consent` COOKIE_REGISTRY; the parity test imports both
 * constants and asserts equality so drift fails CI.
 *
 * Parity test: `__tests__/gpc-force-off.test.ts`.
 */

function handler(event) {
  const request = event.request;
  const response = event.response;
  const requestHeaders = request.headers || {};
  const requestCookies = request.cookies || {};

  // Status gate: never write a consent cookie on error responses.
  const status = response.statusCode;
  if (status < 200 || status >= 400) {
    return response;
  }

  // Sec-GPC: 1 is the only trigger. Vendor `Sec-` prefix means the
  // browser MUST originate the header; JS cannot set it.
  const gpcHeader = requestHeaders['sec-gpc'];
  if (!gpcHeader || gpcHeader.value !== '1') {
    return response;
  }

  // Idempotency parity with proxy.ts.
  if (requestCookies['__Host-quilty_consent']) {
    return response;
  }

  const payload = JSON.stringify({
    essential: true,
    functional: true,
    analytics: false,
    marketing: false,
    personalization: false,
    gpc_detected: true,
    gpc_honored: true,
    version: 'v1',
    updated_at: new Date().toISOString(),
  });
  const encoded = btoa(payload);

  // HttpOnly deliberately omitted — consent cookie is client-readable
  // so future useConsent() + IAB TCF parity surfaces can inspect the
  // state without a server roundtrip. `__Host-` prefix supplies
  // Secure + Path=/ + no-Domain. SameSite=Lax matches an opt-out
  // marker CSRF posture (top-level navigation travels; cross-site
  // sub-resource POSTs do not).
  const responseCookies = response.cookies || {};
  responseCookies['__Host-quilty_consent'] = {
    value: encoded,
    attributes: 'Secure; SameSite=Lax; Path=/; Max-Age=15552000',
  };
  response.cookies = responseCookies;

  return response;
}
