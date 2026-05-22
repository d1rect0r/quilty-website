import { test, expect } from '@playwright/test';

/**
 * `X-Robots-Tag` response-header defense-in-depth (D66). Robots.txt
 * + per-page metadata both advertise the noindex posture; this
 * response-header layer covers crawlers that ignore robots.txt or
 * fetch a path before the page renders. Set in `proxy.ts` for paths
 * matching `/api/`, `/account/`, `/{locale}/account/`, `/dev/` —
 * with `(\/|$)` alternation so the locale-account landing path
 * (`/en/account`, no trailing slash under `trailingSlash: false`)
 * is covered alongside its subpaths.
 */

// `/api/auth/callback` + `/api/auth/session` cover two distinct
// `/api/*` paths so a regression that narrows the regex from
// `^\/api\/` to a specific subpath fails CI.
const NOINDEX_PATHS: readonly string[] = [
  '/api/auth/callback',
  '/api/auth/session',
  '/en/account',
  '/dev/boom',
];

for (const path of NOINDEX_PATHS) {
  test(`@security ${path} response carries X-Robots-Tag: noindex, nofollow`, async ({
    request,
  }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    // Response may be a 200, 307 redirect, 404 (dev/boom in
    // production), or 501 (auth-stub) — the X-Robots-Tag posture
    // must hold for every status. A 200 that leaks a portal page
    // into a SERP is the worst case; a 307 that does the same is
    // equally bad if the redirect itself is cached.
    expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
  });
}

test('@security marketing route does NOT carry X-Robots-Tag', async ({ request }) => {
  // Marketing pages must be indexable — the defense-in-depth header
  // is targeted at portal/api/dev surfaces only. A regression that
  // applies the header globally would silently de-index the entire
  // marketing tier.
  const response = await request.get('/en');
  expect(response.headers()['x-robots-tag']).toBeUndefined();
});
