/**
 * Security headers — CloudFront Function (viewer-response).
 *
 * Mirrors `applySecurityHeaders` baseline from `apps/web/proxy.ts`
 * + `packages/security/src/domain/headers-builder.ts` `buildSecurityHeaders()`.
 *
 * NOT included: CSP. Per-route nonce generation requires per-request
 * cryptographic randomness, which is not available in CFF runtime v2
 * (no `crypto.subtle`, no `crypto.randomBytes`). CSP stays at the
 * Lambda origin (proxy.ts / Next.js) where nonce minting lives.
 *
 * HSTS phase: hardcoded to `max-age=300` (scaffold tier) to mirror
 * the current `currentHstsPhase()` default. Phase escalation flips
 * this literal via a deploy-time injection from the canonical
 * `@quilty/security` value (build step lands at activation gate).
 *
 * Parity test: `__tests__/security-headers.test.ts` imports
 * `buildSecurityHeaders()` from `@quilty/security` and asserts every
 * canonical header appears on the CFF output.
 */

function handler(event) {
  const response = event.response;
  const responseHeaders = response.headers || {};

  // Header keys MUST be lowercase per the CFF event-structure spec.
  // Values mirror @quilty/security buildSecurityHeaders() output.
  responseHeaders['strict-transport-security'] = { value: 'max-age=300' };
  responseHeaders['x-content-type-options'] = { value: 'nosniff' };
  responseHeaders['x-frame-options'] = { value: 'DENY' };
  responseHeaders['cross-origin-opener-policy'] = { value: 'same-origin-allow-popups' };
  responseHeaders['cross-origin-resource-policy'] = { value: 'same-origin' };
  responseHeaders['referrer-policy'] = { value: 'strict-origin-when-cross-origin' };
  responseHeaders['permissions-policy'] = {
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  };

  response.headers = responseHeaders;
  return response;
}
