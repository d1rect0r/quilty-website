import { expect, test, type Response } from '@playwright/test';

/**
 * Smoke coverage for the (errors) route group + per-route-group
 * not-found.tsx surfaces (D114 + D115 + D123).
 *
 * The 503 + 410 + 451 surfaces normally render only when proxy.ts
 * rewrites a matching request to them — but the routes themselves
 * are also directly addressable for smoke testing + ops verification
 * (`curl https://my-quilty.com/503` should resolve regardless of
 * MAINTENANCE_MODE state).
 */

/**
 * Narrow `Response | null` to `Response` via a throwing guard. Avoids
 * the `!` non-null assertion (banned by @typescript-eslint/no-non-null-
 * assertion) + surfaces a clear failure message ("navigation failed")
 * instead of `Expected: 200 / Received: undefined`.
 */
function assertNavigated(response: Response | null, path: string): asserts response is Response {
  if (response === null) {
    throw new Error(`Navigation to ${path} returned null — page.goto failed before status emit`);
  }
}

test('@smoke /410 renders the Gone page', async ({ page }) => {
  const response = await page.goto('/410');
  assertNavigated(response, '/410');
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'This page is gone' })).toBeVisible();
});

test('@smoke /451 renders the legal-block page', async ({ page }) => {
  const response = await page.goto('/451');
  assertNavigated(response, '/451');
  expect(response.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Unavailable for legal reasons' }),
  ).toBeVisible();
});

test('@smoke /503 renders the maintenance page', async ({ page }) => {
  const response = await page.goto('/503');
  assertNavigated(response, '/503');
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: /maintenance/i })).toBeVisible();
  // Live status link target (Instatus Pro reserved subdomain).
  await expect(page.getByRole('link', { name: 'Live status' })).toBeVisible();
});

test('@smoke /(errors) layout does NOT mount cookie banner', async ({ page }) => {
  // SiteBanner is the (marketing) layout's cookie surface. The
  // (errors) layout has no SiteBanner mount (Discord/Linear minimal-
  // chrome convention). Verify by route: visit a 410 page + assert
  // the banner button + region landmark are absent.
  await page.goto('/410');
  const bannerRegion = page.getByRole('region', { name: /cookie consent/i });
  await expect(bannerRegion).toHaveCount(0);
  const acceptAllBtn = page.getByRole('button', { name: /accept all/i });
  await expect(acceptAllBtn).toHaveCount(0);
});

test('@smoke marketing-tier not-found.tsx returns 404 for unknown path', async ({ page }) => {
  // An unknown URL inside the (marketing) tree routes to the
  // marketing-tier not-found.tsx — Next.js cascades to the
  // nearest not-found in the segment tree.
  const response = await page.goto('/en/this-does-not-exist');
  assertNavigated(response, '/en/this-does-not-exist');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});

test('@smoke status pages set noindex robots meta', async ({ page }) => {
  for (const path of ['/410', '/451', '/503']) {
    await page.goto(path);
    const noindexMeta = await page.locator('meta[name="robots"][content*="noindex"]').count();
    expect(noindexMeta).toBeGreaterThanOrEqual(1);
  }
});
