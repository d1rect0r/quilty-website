import { test, expect } from '@/tests/playwright/a11y/makeAxeBuilder';

/**
 * Smoke tests for marketing routes. Each reserved route per U2 + U3 must:
 *   1. Return HTTP 200
 *   2. Have exactly one <h1>
 *   3. Render <main> with skip-link target
 *   4. Pass axe-core (WCAG 2.2 AA)
 */

const ROUTES = [
  { path: '/en', title_substr: 'Quilty' },
  { path: '/en/features', title_substr: 'Features' },
  { path: '/en/pricing', title_substr: 'Pricing' },
  { path: '/en/about', title_substr: 'About' },
  { path: '/en/contact', title_substr: 'Contact' },
  { path: '/en/science', title_substr: 'Science' },
  { path: '/en/for-business', title_substr: 'For business' },
  { path: '/en/customers', title_substr: 'Customers' },
  { path: '/en/help', title_substr: 'Help' },
];

for (const route of ROUTES) {
  test(`@smoke @a11y marketing route ${route.path} loads + passes axe`, async ({
    page,
    makeAxeBuilder,
  }) => {
    const response = await page.goto(route.path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(new RegExp(route.title_substr, 'i'));

    // Single h1 invariant
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    // Main landmark + skip-link target
    const main = page.locator('main#main');
    await expect(main).toBeAttached();

    // Skip-link present (visually hidden until focused)
    const skipLink = page.locator('a.skip-link');
    await expect(skipLink).toBeAttached();

    // axe-core: zero violations on WCAG 2.2 AA
    const results = await makeAxeBuilder().analyze();
    expect(results.violations).toEqual([]);
  });
}
