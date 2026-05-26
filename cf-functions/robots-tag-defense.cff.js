/**
 * X-Robots-Tag defense — CloudFront Function (viewer-response).
 *
 * Mirrors `shouldNoindexPath` in `apps/web/proxy.ts`. Sets
 * `X-Robots-Tag: noindex, nofollow` on response paths that must never
 * appear in a SERP:
 *
 *   - `/api/*` — Route Handlers (webhooks, OAuth callbacks, csp-report).
 *   - `/account/*` + `/{locale}/account/*` — the portal.
 *   - `/dev/*` — dev-only diagnostic surface.
 *   - `/(410|451|503)` + `/{locale}/(410|451|503)` — status pages.
 *
 * Defense-in-depth: page-metadata `robots: { index: false }` covers
 * HTML-parsing crawlers; this header covers HEAD-only crawlers and
 * AI-citation bots that don't parse the body (per the Web Almanac
 * 2025 crawler taxonomy).
 *
 * Path-pattern semantics + locale handling mirror proxy.ts exactly so
 * the parity test (`__tests__/robots-tag-defense.test.ts`) can assert
 * input-vector equivalence across both implementations.
 *
 * Path regexes are pre-compiled at module load (CFF runtime v2 hoists
 * top-level RegExp construction) — the hot path is a `.some()` over a
 * frozen list, well within the 1ms budget.
 */

// Locale segment matches 2+ lowercase letters to accommodate future
// 3-letter ISO 639-2 prefixes (e.g., `zho`, `hin`, `ara`).
const NOINDEX_PATTERNS = [
  /^\/api\//,
  /^\/account(\/|$)/,
  /^\/[a-z]{2,}\/account(\/|$)/,
  /^\/dev(\/|$)/,
  /^\/(410|451|503)(\/|$)/,
  /^\/[a-z]{2,}\/(410|451|503)(\/|$)/,
];

function handler(event) {
  const request = event.request;
  const response = event.response;
  const uri = request.uri || '/';

  for (let i = 0; i < NOINDEX_PATTERNS.length; i += 1) {
    if (NOINDEX_PATTERNS[i].test(uri)) {
      const headers = response.headers || {};
      headers['x-robots-tag'] = { value: 'noindex, nofollow' };
      response.headers = headers;
      return response;
    }
  }
  return response;
}
