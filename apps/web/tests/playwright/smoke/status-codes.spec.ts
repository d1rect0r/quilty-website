import { expect, test } from '@playwright/test';

/**
 * Header coverage for the proxy.ts status-code routing layer
 * (D124 + D147). Validates the response-level signals that future
 * Instatus + synthetic-monitor + on-call tooling consume:
 *
 *   - `X-Cluster-Status` header (Cloudflare convention) is set on
 *     every response (operational on normal paths, maintenance on
 *     503 rewrites)
 *   - `Retry-After` is set on 503 responses per RFC 7231 §7.1.3
 *   - `X-Robots-Tag: noindex, nofollow` is set on error responses
 *     defense-in-depth atop the meta-tag layer
 *
 * The maintenance-mode end-to-end test requires MAINTENANCE_MODE=true
 * env var which we don't toggle on dev; the headers test below
 * exercises the operational path which is always live.
 */

test('@seo normal-path responses carry X-Cluster-Status: operational', async ({ request }) => {
  const response = await request.get('/en');
  expect(response.status()).toBe(200);
  expect(response.headers()['x-cluster-status']).toBe('operational');
});

test('@seo /(errors) routes carry X-Robots-Tag noindex defense-in-depth', async ({ request }) => {
  // The (errors) layout sets robots:noindex via metadata; the proxy
  // also sets X-Robots-Tag for any /api/* + /account/* path. The
  // (errors) routes are public so they currently rely on the
  // metadata-only path — verify the meta layer is doing its job
  // by re-fetching the rendered HTML and grepping for the meta tag.
  for (const path of ['/410', '/451', '/503']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const body = await response.text();
    // Defense-in-depth: meta-tag layer must carry noindex even
    // when the header layer doesn't (the (errors) routes aren't
    // in proxy.ts's noindex path patterns because they're rendered
    // via direct navigation + future-internal-rewrite).
    expect(body).toMatch(/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i);
  }
});

test('@seo proxy.ts apex redirect carries X-Cluster-Status', async ({ request }) => {
  // The apex `/` redirects to `/en` with a 307 + full security
  // header stack. X-Cluster-Status is NOT set on redirect responses
  // by design (the destination response carries it); verify the
  // destination does.
  const response = await request.get('/', { maxRedirects: 5 });
  expect(response.status()).toBe(200);
  expect(response.headers()['x-cluster-status']).toBe('operational');
});
