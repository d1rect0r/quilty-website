import { test, expect } from '@/tests/playwright/a11y/makeAxeBuilder';

/**
 * Smoke tests for account portal routes. At M1 these render unauthenticated
 * placeholder stubs — real auth gating lands in M6 per the BFF pattern
 * (ADR-0002). Tests verify:
 *   1. Routes return HTTP 200 (auth gating not yet wired)
 *   2. Single h1 per page
 *   3. <main> landmark with skip-link target
 *   4. axe-core zero violations
 *   5. Robots noindex inherited from (account)/layout
 */

const ACCOUNT_ROUTES = [
  '/en/account',
  '/en/account/security',
  '/en/account/subscription',
  '/en/account/data',
  '/en/account/notifications',
  '/en/account/delete',
];

for (const route of ACCOUNT_ROUTES) {
  test(`@smoke @a11y account route ${route} loads + passes axe`, async ({
    page,
    makeAxeBuilder,
  }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);

    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    await expect(page.locator('main#main')).toBeAttached();

    const results = await makeAxeBuilder().analyze();
    expect(results.violations).toEqual([]);
  });
}

test('@smoke @seo account routes carry noindex meta (inherited from layout)', async ({
  page,
}) => {
  await page.goto('/en/account');
  const robotsMeta = await page
    .locator('meta[name="robots"]')
    .first()
    .getAttribute('content');
  expect(robotsMeta).toContain('noindex');
});
