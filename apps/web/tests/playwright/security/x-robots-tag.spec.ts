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

// Exercise multiple distinct paths under each `NOINDEX_PATH_PATTERNS`
// regex so a regression that narrows any pattern from its wildcard
// form to a specific subpath fails CI:
//   `/api/*` — 5 auth Route Handlers + 1 webhook
//   `/{locale}/account*` — locale-bare + 1 subpage
//   `/dev/*` — the synchronous-throw diagnostic surface
// `/.well-known/change-password` is added because its noindex
// header is set on the redirect-response branch in proxy.ts (NOT
// via `NOINDEX_PATH_PATTERNS`) — the .well-known prefix is
// otherwise excluded from the primary matcher.
const NOINDEX_PATHS: readonly string[] = [
  '/auth/callback',
  '/auth/session',
  '/auth/refresh',
  '/auth/logout',
  '/auth/backchannel-logout',
  '/api/webhooks/stripe',
  '/en/account',
  '/en/account/security',
  '/dev/boom',
  '/.well-known/change-password',
];

for (const path of NOINDEX_PATHS) {
  test(`@security ${path} response carries X-Robots-Tag: noindex, nofollow`, async ({
    request,
  }) => {
    // Some endpoints reject GET (e.g. webhooks expect POST) — POST
    // for those, GET for everything else. Either way the
    // proxy-injected response header must be present.
    const isWebhook = path.startsWith('/api/webhooks/');
    const response = isWebhook
      ? await request.post(path, { maxRedirects: 0 })
      : await request.get(path, { maxRedirects: 0 });
    // Response may be a 200, 307 redirect, 404 (dev/boom in
    // production), 405 (wrong method on a webhook stub), or 501
    // (auth-stub) — the X-Robots-Tag posture must hold for every
    // status. A 200 that leaks a portal page into a SERP is the
    // worst case; a 307 that does the same is equally bad if the
    // redirect itself is cached.
    expect(response.headers()['x-robots-tag'] ?? '').toBe('noindex, nofollow');
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
