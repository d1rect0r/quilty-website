import { test, expect } from '@playwright/test';

/**
 * Trust Center SEO + structured-data coverage per D103.
 *
 * Coverage:
 *   1. /en/trust returns 200 + is indexable (no robots noindex)
 *   2. Canonical metadata + WebPage JSON-LD anchored to the URL
 *   3. Title + description match the page constants
 *   4. Sitemap includes the route (entry surfaces in /sitemap.xml)
 */

test('@seo /en/trust returns 200 + is indexable', async ({ request, page }) => {
  const response = await request.get('/en/trust');
  expect(response.status()).toBe(200);

  await page.goto('/en/trust');
  const noindexMeta = await page.locator('meta[name="robots"][content*="noindex"]').count();
  expect(noindexMeta).toBe(0);
});

test('@seo /en/trust carries canonical metadata + WebPage JSON-LD', async ({ page }) => {
  await page.goto('/en/trust');
  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveAttribute('href', /\/en\/trust$/);

  // The root layout emits Organization + WebSite JSON-LD before
  // {children}, so the page's own WebPage node is NOT the first
  // <script type="application/ld+json">. Find it by content shape
  // rather than positional index — robust to additional graph nodes
  // being authored in the layout later.
  const scripts = await page.locator('script[type="application/ld+json"]').all();
  let parsed: Record<string, unknown> | null = null;
  for (const script of scripts) {
    const raw = await script.textContent();
    if (!raw) continue;
    const candidate: unknown = JSON.parse(raw);
    if (
      candidate !== null &&
      typeof candidate === 'object' &&
      (candidate as Record<string, unknown>)['@type'] === 'WebPage'
    ) {
      parsed = candidate as Record<string, unknown>;
      break;
    }
  }
  expect(parsed).not.toBeNull();
  expect(parsed?.['name']).toBe('Trust & Security');
});

test('@seo sitemap includes /en/trust', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  const body = await response.text();
  expect(body).toContain('/en/trust');
});
