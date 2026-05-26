/**
 * Parity test for `robots-tag-defense.cff.js` against `shouldNoindexPath`
 * in `apps/web/proxy.ts`. Both implementations test the same regex set;
 * the test runs each canonical path through both and asserts identical
 * emission decisions.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCfHandler, makeViewerResponse, type CfViewerResponseEvent } from './cf-runtime-stub';

const handler = loadCfHandler('robots-tag-defense.cff.js');

// Mirror of proxy.ts NOINDEX_PATH_PATTERNS, kept here so the CFF
// implementation does NOT take a runtime dependency on apps/web. The
// parity rests on this list staying behaviorally equivalent — see the
// activation-gate runbook for the cross-implementation review protocol.
const PROXY_NOINDEX_PATTERNS: readonly RegExp[] = [
  /^\/api\//,
  /^\/account(\/|$)/,
  /^\/[a-z]{2,}\/account(\/|$)/,
  /^\/dev(\/|$)/,
  /^\/(410|451|503)(\/|$)/,
  /^\/[a-z]{2,}\/(410|451|503)(\/|$)/,
];

function proxyShouldNoindex(pathname: string): boolean {
  return PROXY_NOINDEX_PATTERNS.some((p) => p.test(pathname));
}

function runHandler(uri: string): boolean {
  const event = makeViewerResponse({ uri });
  const result = handler(event) as CfViewerResponseEvent['response'];
  return result.headers['x-robots-tag']?.value === 'noindex, nofollow';
}

const NOINDEX_PATHS: readonly string[] = [
  '/api/contact',
  '/api/auth/callback',
  '/api/webhooks/stripe',
  '/account',
  '/account/security',
  '/en/account',
  '/en/account/security',
  '/zho/account/profile',
  '/dev',
  '/dev/diagnostic',
  '/410',
  '/451',
  '/503',
  '/410/',
  '/en/451',
];

const ALLOWED_PATHS: readonly string[] = [
  '/',
  '/en',
  '/en/about',
  '/en/pricing',
  '/en/contact',
  '/static/hero.jpg',
  // `/accounts` (plural) must NOT trigger — proxy.ts uses `^\/account(\/|$)`
  '/accounts',
  // Path with `account` mid-segment must NOT trigger.
  '/en/my-account-faq',
  // /.well-known/change-password — proxy.ts sets X-Robots-Tag inline on
  // the redirect, NOT via shouldNoindexPath. The CFF pattern set must
  // not match it (proxy.ts handles the well-known path; CFF flowing
  // through to a non-well-known origin response gets no tag here).
  '/.well-known/change-password',
];

describe('robots-tag-defense CFF — parity against proxy.ts', () => {
  it.each(NOINDEX_PATHS)('emits X-Robots-Tag: noindex on noindex-path: %s', (path) => {
    expect(runHandler(path)).toBe(true);
    expect(proxyShouldNoindex(path)).toBe(true);
  });

  it.each(ALLOWED_PATHS)('does NOT emit X-Robots-Tag on allowed path: %s', (path) => {
    expect(runHandler(path)).toBe(false);
    expect(proxyShouldNoindex(path)).toBe(false);
  });

  it('returns the response object (CFF viewer-response return contract)', () => {
    const event = makeViewerResponse({ uri: '/' });
    const result = handler(event);
    expect(result).toBe(event.response);
  });

  it('preserves pre-existing response headers when no noindex applies', () => {
    const event = makeViewerResponse(
      { uri: '/' },
      { headers: { 'content-type': { value: 'text/html' } } },
    );
    const result = handler(event) as CfViewerResponseEvent['response'];
    expect(result.headers['content-type']?.value).toBe('text/html');
    expect(result.headers['x-robots-tag']).toBeUndefined();
  });
});

// Drift-detection: the regex SOURCE STRINGS in proxy.ts and the CFF
// MUST match. Read both files at test time, extract every regex
// literal, and assert set equality. A future edit to either file
// without the other fails this test.
function extractNoindexRegexSources(source: string): readonly string[] {
  // Extract regex literals that START with `/^\/` (path-anchored
  // patterns). The pattern walks character-by-character per line and
  // captures the body between the bracketing slashes, honouring
  // escaped slashes (`\/`). Returns the inner pattern body (no
  // leading `/`, no trailing `/flags`).
  const out: string[] = [];
  const lines = source.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Lines that look like array entries: `/^\/.../,` or `/^\/.../]`.
    if (!trimmed.startsWith('/^\\/')) continue;
    // Walk forward to find the closing `/` that ends the regex.
    let i = 1;
    while (i < trimmed.length) {
      if (trimmed[i] === '\\') {
        i += 2;
        continue;
      }
      if (trimmed[i] === '/') break;
      i += 1;
    }
    out.push(trimmed.slice(1, i));
  }
  return out.sort((a, b) => a.localeCompare(b));
}

describe('robots-tag-defense — regex parity (drift detection)', () => {
  it('CFF and proxy.ts share an identical noindex regex set', () => {
    const cffSource = readFileSync(join(__dirname, '..', 'robots-tag-defense.cff.js'), 'utf8');
    const proxySource = readFileSync(
      join(__dirname, '..', '..', 'apps', 'web', 'proxy.ts'),
      'utf8',
    );

    const cffRegexes = extractNoindexRegexSources(cffSource);
    const proxyRegexes = extractNoindexRegexSources(proxySource);

    // Set-equality (NOT intersection — a proxy.ts pattern absent from
    // the CFF must fail this test). The extractor matches `/^\/...$/`
    // shapes; proxy.ts has only the NOINDEX_PATH_PATTERNS array in this
    // shape today. If proxy.ts grows a sibling array with a different
    // shape, extend the extractor before changing this assertion.
    expect(proxyRegexes).toEqual(cffRegexes);
    // Floor-check: at least the documented 6 patterns must be present.
    expect(cffRegexes.length).toBeGreaterThanOrEqual(6);
  });
});
