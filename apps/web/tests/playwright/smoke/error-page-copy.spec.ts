import { expect, test } from '@playwright/test';

/**
 * Smoke coverage for the Copy Reference button (D145) + the noindex
 * defense-in-depth on error surfaces (D146) + cookie banner
 * suppression on the (errors) route group.
 *
 * The error.tsx + global-error.tsx Copy Reference Client Components
 * + their JS state are tested via Vitest (component-level). The
 * Playwright suite covers the rendered-in-place wiring across the
 * (errors) route group surfaces + the noindex header chain.
 */

test('@seo (errors) route group emits noindex via BOTH metadata + response header', async ({
  request,
  page,
}) => {
  for (const path of ['/410', '/451', '/503']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    // Defense-in-depth layer 1: response header (proxy.ts noindex
    // path patterns).
    expect(response.headers()['x-robots-tag']).toMatch(/noindex/i);
    // Defense-in-depth layer 2: rendered <meta name="robots"> in
    // the HTML head (layout metadata cascade). DOM query (not raw
    // body regex) — attribute order is not guaranteed by streaming
    // SSR.
    await page.goto(path);
    const noindexMeta = await page.locator('meta[name="robots"][content*="noindex"]').count();
    expect(noindexMeta).toBeGreaterThanOrEqual(1);
  }
});

test('@smoke (errors) route group does not mount any third-party SDK script + cookie banner', async ({
  page,
  request,
}) => {
  // The (errors) layout intentionally omits SiteBanner + analytics +
  // any consent surface (Discord/Linear minimal-chrome convention).
  // Both the hydrated DOM AND the raw server-rendered HTML must be
  // banner-free — a future regression that adds <SiteBanner /> as
  // an SSR-only render (no client hydration) would still leak the
  // raw HTML through if we only checked the hydrated DOM.
  await page.goto('/503');
  const sdkScripts = await page
    .locator(
      'script[src*="cloudflare"], script[src*="sentry"], script[src*="amplitude"], script[src*="posthog"]',
    )
    .count();
  expect(sdkScripts).toBe(0);
  // Hydrated-DOM check.
  const acceptAllBtn = page.getByRole('button', { name: /accept all/i });
  await expect(acceptAllBtn).toHaveCount(0);
  // Raw-HTML check — covers the non-hydrated SSR case.
  const rawResponse = await request.get('/503');
  const rawBody = await rawResponse.text();
  expect(rawBody).not.toContain('Accept all');
  expect(rawBody).not.toContain('Cookie consent');
});

test('@seo apex error path response carries X-Robots-Tag noindex on direct nav to /(errors)', async ({
  request,
}) => {
  // Direct navigation case — proxy.ts adds the response header.
  const response = await request.get('/503');
  expect(response.headers()['x-robots-tag']).toMatch(/noindex,\s*nofollow/i);
});
