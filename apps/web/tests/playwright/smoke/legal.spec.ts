import { test, expect } from '@/tests/playwright/a11y/makeAxeBuilder';

const LEGAL_ROUTES = ['/en/legal/privacy', '/en/legal/terms', '/en/legal/cookies'];

for (const route of LEGAL_ROUTES) {
  test(`@smoke @a11y legal route ${route} loads + has main + skip-link + passes axe`, async ({
    page,
    makeAxeBuilder,
  }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);

    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    // Parity with marketing + account smoke: structural assertions before
    // axe sweep (a11y reviewer cross-check).
    await expect(page.locator('main#main')).toBeAttached();
    await expect(page.locator('a.skip-link')).toBeAttached();

    const results = await makeAxeBuilder().analyze();
    expect(results.violations).toEqual([]);
  });
}
