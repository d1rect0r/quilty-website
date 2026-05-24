import { expect, test } from './makeAxeBuilder';

/**
 * WCAG 2.2 AA coverage for the (errors) route group surfaces +
 * per-route-group not-found.tsx pages (D114 + D123 + WCAG SC 4.1.3
 * Status Messages + ARIA19).
 *
 * The full role/aria-live/aria-atomic/focus-on-mount contract for
 * the JavaScript-bearing error.tsx boundaries lives in the Vitest
 * suite under apps/web/app/__tests__/{error,global-error}.test.tsx
 * + sister files for the per-group error.tsx. This file covers the
 * publicly-renderable status pages (no client state) — primarily
 * axe-core compliance + the bare-h1 contract.
 */

test('@a11y /410 has no axe-core WCAG 2.2 AA violations', async ({ page, makeAxeBuilder }) => {
  await page.goto('/410');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y /451 has no axe-core WCAG 2.2 AA violations', async ({ page, makeAxeBuilder }) => {
  await page.goto('/451');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y /503 has no axe-core WCAG 2.2 AA violations', async ({ page, makeAxeBuilder }) => {
  await page.goto('/503');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y marketing-tier 404 has no axe-core WCAG 2.2 AA violations', async ({
  page,
  makeAxeBuilder,
}) => {
  await page.goto('/en/this-does-not-exist');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y /503 maintenance page renders the maintenance copy', async ({ page }) => {
  // The maintenance message is static prose — content does not
  // change after first render, so a live region (role=status /
  // aria-live=polite) would never fire its observer. Plain <p> is
  // the correct semantic. axe-core (test above) covers the WCAG
  // contract; this assertion verifies the user-visible copy is
  // present + reachable.
  await page.goto('/503');
  await expect(page.getByText(/briefly offline for scheduled maintenance/i)).toBeVisible();
});

test('@a11y all status pages have a unique h1 + skip-link main target', async ({ page }) => {
  for (const path of ['/410', '/451', '/503']) {
    await page.goto(path);
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
    const main = page.locator('main#main');
    await expect(main).toHaveCount(1);
  }
});
