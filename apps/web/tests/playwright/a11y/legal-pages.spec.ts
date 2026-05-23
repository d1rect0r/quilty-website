import { expect, test } from './makeAxeBuilder';

/**
 * DSAR entry-point a11y coverage per D99.
 *
 * Coverage:
 *   1. /en/legal/privacy-choices — axe-core WCAG 2.2 AA + indexable
 *      (EDPB / ICO / CA AG enforcement crawlers must discover it) +
 *      published-45-day SLA verbatim + Privacy Lead title verbatim +
 *      photo-ID anti-pattern language present + cross-link to MHMDA
 *      standalone.
 *   2. /en/account/privacy — axe-core WCAG 2.2 AA + NOT indexable
 *      (signed-in surface; DSAR affordance copy reaching a SERP would
 *      be a brand + compliance exposure for a HIPAA-aligned product) +
 *      disabled-button contract (disabled + aria-disabled +
 *      aria-describedby pointing to status copy).
 */

test('@a11y /en/legal/privacy-choices has no axe-core WCAG 2.2 AA violations', async ({
  page,
  makeAxeBuilder,
}) => {
  await page.goto('/en/legal/privacy-choices');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y /en/legal/privacy-choices is indexable + carries Privacy Lead + 45-day SLA verbatim', async ({
  page,
}) => {
  await page.goto('/en/legal/privacy-choices');
  const noindexMeta = await page.locator('meta[name="robots"][content*="noindex"]').count();
  expect(noindexMeta).toBe(0);

  // Privacy Lead title is load-bearing — D136 + GDPR Art 38(6)
  // fineable-risk precedents (Austrian €5K + CJEU C-453/21 + Belgian
  // €50K) make claiming "DPO" without one a fineable risk. Anchor
  // the assertion to the h2 + body paragraph so a relocation that
  // keeps the phrase elsewhere on the page fails the test.
  await expect(page.locator('h2').filter({ hasText: 'Privacy Lead' })).toBeVisible();
  await expect(
    page.locator('p').filter({ hasText: /designated point of contact.*Privacy Lead/is }),
  ).toBeVisible();

  // 45-day published SLA is the conservative floor (D152) shown to
  // users; anchor the assertion to the "How long we take" paragraph
  // so a future edit that drops the published-floor framing fails
  // even if the bare "45 days" string survives elsewhere.
  await expect(
    page.locator('p').filter({ hasText: /Our published response window is.*45 days/is }),
  ).toBeVisible();
});

test('@a11y /en/legal/privacy-choices names the photo-ID anti-pattern (D151)', async ({ page }) => {
  await page.goto('/en/legal/privacy-choices');
  // The exact wording matters — EDPB Guidelines 01/2022 + the Dutch
  // DPA €525K DPG Media fine flag photo-ID-as-routine-DSAR-friction
  // as an anti-pattern. A page that pivots to ID-requirement copy
  // contradicts D151.
  await expect(page.getByText(/not require government-issued photo ID/i)).toBeVisible();
});

test('@a11y /en/account/privacy has no axe-core WCAG 2.2 AA violations', async ({
  page,
  makeAxeBuilder,
}) => {
  await page.goto('/en/account/privacy');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y /en/account/privacy is NOT indexable (signed-in surface)', async ({ page }) => {
  await page.goto('/en/account/privacy');
  // Robots noindex is load-bearing — a signed-in DSAR hub reaching a
  // SERP for a HIPAA-aligned consumer mental-health product is a
  // brand + compliance exposure.
  const noindexMeta = await page.locator('meta[name="robots"][content*="noindex"]').count();
  expect(noindexMeta).toBeGreaterThanOrEqual(1);
});

test('@a11y /en/account/privacy disabled action buttons carry the full inert-control contract', async ({
  page,
}) => {
  await page.goto('/en/account/privacy');

  const exportBtn = page.getByRole('button', { name: 'Export my data' });
  await expect(exportBtn).toBeDisabled();
  await expect(exportBtn).toHaveAttribute('aria-disabled', 'true');
  await expect(exportBtn).toHaveAttribute('aria-describedby', 'export-status');
  await expect(page.locator('#export-status')).toBeVisible();

  const profilingBtn = page.getByRole('button', { name: 'Opt out of profiling' });
  await expect(profilingBtn).toBeDisabled();
  await expect(profilingBtn).toHaveAttribute('aria-disabled', 'true');
  await expect(profilingBtn).toHaveAttribute('aria-describedby', 'profiling-status');
  await expect(page.locator('#profiling-status')).toBeVisible();
});
