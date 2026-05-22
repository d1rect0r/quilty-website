import { expect, test } from './makeAxeBuilder';

/**
 * Sub-processors list at `/en/legal/subprocessors` per D102 +
 * D175 (vendor-erasure-orchestration matrix cross-reference).
 *
 * Coverage:
 *   1. axe-core WCAG 2.2 AA on the rendered page — the table is the
 *      load-bearing affordance and must hold up under AT users.
 *   2. Indexable — enterprise procurement crawlers discover the page
 *      during vendor due-diligence.
 *   3. The table has proper semantics: `<caption>` + per-column
 *      `<th scope="col">` + per-row `<th scope="row">`. Without these
 *      a row-by-column screen-reader sweep collapses to flat reading.
 *   4. The disabled subscribe button + email field both carry
 *      `disabled` AND `aria-disabled` (defense-in-depth) +
 *      `aria-describedby` pointing to status copy. Without
 *      `aria-disabled` an assistive-tech user can attempt focus + key
 *      activation; without `aria-describedby` they cannot discover
 *      WHY the control is inert.
 *   5. The 30-business-day notice cadence is named verbatim — change-
 *      management language is load-bearing under enterprise DPA
 *      review.
 */

test('@a11y /en/legal/subprocessors has no axe-core WCAG 2.2 AA violations', async ({
  page,
  makeAxeBuilder,
}) => {
  await page.goto('/en/legal/subprocessors');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y /en/legal/subprocessors is indexable (no robots noindex)', async ({ page }) => {
  await page.goto('/en/legal/subprocessors');
  const noindexMeta = await page.locator('meta[name="robots"][content*="noindex"]').count();
  expect(noindexMeta).toBe(0);
});

test('@a11y /en/legal/subprocessors table carries caption + th scope semantics', async ({
  page,
}) => {
  await page.goto('/en/legal/subprocessors');
  // Caption present (visually hidden via sr-only) — screen readers
  // announce it before the table content.
  const caption = page.locator('table > caption');
  await expect(caption).toHaveCount(1);

  // Every column header has scope="col".
  const colHeaders = page.locator('table thead th[scope="col"]');
  expect(await colHeaders.count()).toBeGreaterThanOrEqual(5);

  // Every row's first cell is a scope="row" header (vendor name as
  // row label).
  const rowHeaders = page.locator('table tbody th[scope="row"]');
  expect(await rowHeaders.count()).toBeGreaterThanOrEqual(5);
});

test('@a11y /en/legal/subprocessors scroll wrapper is keyboard-reachable + announced as region', async ({
  page,
}) => {
  await page.goto('/en/legal/subprocessors');
  // The scroll wrapper must be a landmark region with tabindex=0 so
  // keyboard-only users can engage horizontal arrow-key scrolling on
  // narrow viewports (WCAG 2.1.1 Keyboard).
  const region = page.getByRole('region', { name: 'Sub-processor table, scrollable' });
  await expect(region).toHaveCount(1);
  await expect(region).toHaveAttribute('tabindex', '0');
});

test('@a11y /en/legal/subprocessors disabled form carries the full inert-control contract', async ({
  page,
}) => {
  await page.goto('/en/legal/subprocessors');
  const emailInput = page.locator('#subprocessor-email');
  await expect(emailInput).toBeDisabled();
  await expect(emailInput).toHaveAttribute('aria-disabled', 'true');
  await expect(emailInput).toHaveAttribute('aria-describedby', 'subprocessor-subscribe-status');

  const submitButton = page.getByRole('button', { name: 'Subscribe' });
  await expect(submitButton).toBeDisabled();
  await expect(submitButton).toHaveAttribute('aria-disabled', 'true');
  await expect(submitButton).toHaveAttribute('aria-describedby', 'subprocessor-subscribe-status');

  // The status copy that aria-describedby points to is actually present.
  await expect(page.locator('#subprocessor-subscribe-status')).toBeVisible();
});

test('@a11y /en/legal/subprocessors surfaces the 30-business-day change notice cadence', async ({
  page,
}) => {
  await page.goto('/en/legal/subprocessors');
  await expect(page.getByText(/at least 30 business days/i)).toBeVisible();
});
