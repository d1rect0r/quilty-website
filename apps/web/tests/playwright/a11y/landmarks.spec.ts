import { test, expect } from '@/tests/playwright/a11y/makeAxeBuilder';

/**
 * Cross-page a11y landmarks contract per WCAG 2.4.1 (Bypass Blocks) +
 * 1.3.6 (Identify Purpose) + 4.1.2. Every page must:
 *   - Have a single <h1>
 *   - Have a <main id="main" tabindex="-1"> (skip-link target + route-
 *     change focus target for FocusOnNavigate)
 *   - Have a focusable skip-link as the first interactive element
 *   - Pass axe-core WCAG 2.2 AA — enforces the landmark + bypass-block
 *     surface beyond what structural assertions cover (Round-5 a11y
 *     reviewer requested axe sweep on these pages explicitly).
 */

const PAGES = [
  '/en',
  '/en/features',
  '/en/account',
  '/en/legal/privacy',
  '/en/customers',
  '/en/help',
];

for (const path of PAGES) {
  test(`@a11y @smoke ${path} has single h1 + main landmark + skip-link + zero axe violations`, async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.goto(path);

    // Single h1
    expect(await page.locator('h1').count()).toBe(1);

    // Main landmark with id="main" and tabindex="-1" (focus target)
    const main = page.locator('main#main');
    await expect(main).toBeAttached();
    await expect(main).toHaveAttribute('tabindex', '-1');

    // Skip-link present + targets #main
    const skipLink = page.locator('a.skip-link');
    await expect(skipLink).toBeAttached();
    await expect(skipLink).toHaveAttribute('href', '#main');

    // Full axe sweep — Round-5 a11y reviewer cross-check.
    const results = await makeAxeBuilder().analyze();
    expect(results.violations).toEqual([]);
  });
}
