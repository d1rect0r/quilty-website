/**
 * Parity test for `security-headers.cff.js` against
 * `applySecurityHeaders` + `buildSecurityHeaders` in proxy.ts +
 * @quilty/security.
 *
 * The CFF mirrors the static portion of the header stack (HSTS, COOP,
 * CORP, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy).
 * It does NOT carry CSP — nonce minting requires runtime randomness
 * unavailable in the CFF v2 runtime; CSP stays at the Lambda origin.
 *
 * GPC FORCE-OFF cookie write lives in a separate CFF
 * (`gpc-force-off.cff.js`) per the single-responsibility split — the
 * cookie-write parity is tested there.
 */

import { describe, expect, it } from 'vitest';
import { buildSecurityHeaders } from '@quilty/security';
import { loadCfHandler, makeViewerResponse, type CfViewerResponseEvent } from './cf-runtime-stub';

const handler = loadCfHandler('security-headers.cff.js');

describe('security-headers CFF — parity against @quilty/security', () => {
  it('sets the full security-header baseline on the response', () => {
    const event = makeViewerResponse();
    const result = handler(event) as CfViewerResponseEvent['response'];

    // Each canonical header set by @quilty/security must appear on the
    // CFF output (key-lowercased per CFF convention). Drift in the
    // canonical surface fails this test until the CFF mirror catches up.
    for (const { key, value } of buildSecurityHeaders()) {
      const lowered = key.toLowerCase();
      expect(result.headers[lowered]?.value).toBe(value);
    }
  });

  it('does NOT set Content-Security-Policy-Report-Only (nonce minting lives at the origin)', () => {
    const event = makeViewerResponse();
    const result = handler(event) as CfViewerResponseEvent['response'];
    expect(result.headers['content-security-policy-report-only']).toBeUndefined();
    expect(result.headers['content-security-policy']).toBeUndefined();
  });

  it('does NOT write any cookies (the GPC cookie write is owned by gpc-force-off.cff.js)', () => {
    const event = makeViewerResponse(
      { headers: { 'sec-gpc': { value: '1' } } },
      { statusCode: 200, cookies: {} },
    );
    const result = handler(event) as CfViewerResponseEvent['response'];
    expect(Object.keys(result.cookies)).toHaveLength(0);
  });

  it('preserves pre-existing response headers (additive write only)', () => {
    const event = makeViewerResponse(
      {},
      { headers: { 'content-type': { value: 'text/html; charset=utf-8' } } },
    );
    const result = handler(event) as CfViewerResponseEvent['response'];
    expect(result.headers['content-type']?.value).toBe('text/html; charset=utf-8');
  });

  it('returns the response object (CFF viewer-response return contract)', () => {
    const event = makeViewerResponse();
    const result = handler(event);
    expect(result).toBe(event.response);
  });
});
