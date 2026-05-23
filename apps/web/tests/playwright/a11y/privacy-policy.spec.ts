import { expect, test } from './makeAxeBuilder';

/**
 * Privacy Policy at `/en/legal/privacy` per D149.
 *
 * Coverage:
 *   1. axe-core WCAG 2.2 AA on the rendered page.
 *   2. Privacy Lead title verbatim (D136 + GDPR Art 38(6)) — anchored
 *      to the "Who we are" h2 + body paragraph so a relocation that
 *      keeps the keyword elsewhere fails the test.
 *   3. NEVER claim DPO as a self-applied title (D136) — the policy
 *      MAY mention "Data Protection Officer" in the context of "we
 *      do not employ" to satisfy the GDPR Art 37 transparency
 *      obligation; the assertion is on the specific claim shape, not
 *      bare keyword.
 *   4. 45-day published SLA verbatim (D152).
 *   5. Sensitive-data classification (D153) names CCPA §1798.140 +
 *      GDPR Article 9 + WA MHMDA explicitly.
 *   6. NEVER use "HIPAA-compliant" string (D104, Cerebral $7M FTC
 *      settlement precedent).
 */

test('@a11y /en/legal/privacy has no axe-core WCAG 2.2 AA violations', async ({
  page,
  makeAxeBuilder,
}) => {
  await page.goto('/en/legal/privacy');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y /en/legal/privacy is indexable (no robots noindex)', async ({ page }) => {
  await page.goto('/en/legal/privacy');
  const noindexMeta = await page.locator('meta[name="robots"][content*="noindex"]').count();
  expect(noindexMeta).toBe(0);
});

test('@a11y /en/legal/privacy carries Privacy Lead title (D136 + Art 38(6))', async ({ page }) => {
  await page.goto('/en/legal/privacy');
  // Privacy Lead title is load-bearing — D136 + GDPR Art 38(6)
  // fineable-risk precedents (Austrian €5K + CJEU C-453/21 + Belgian
  // €50K) make claiming "DPO" without one a fineable risk. Anchor
  // the assertion to the Who-we-are paragraph + h2 so a relocation
  // that keeps the phrase elsewhere fails the test.
  await expect(page.locator('h2').filter({ hasText: 'Who we are' })).toBeVisible();
  await expect(
    page.locator('p').filter({ hasText: /designated point of contact.*Privacy Lead/is }),
  ).toBeVisible();
});

test('@a11y /en/legal/privacy never claims "HIPAA-compliant" + never self-applies "DPO"', async ({
  page,
}) => {
  await page.goto('/en/legal/privacy');
  // D104 — claiming compliance without third-party audit is FTC §5
  // deceptive-acts territory (Cerebral $7M settlement precedent).
  // page.getByText only sees visible DOM text; the <meta> tags + OG
  // descriptions live in <head> and require a direct attribute read
  // to catch a regression in PAGE_DESCRIPTION (where compliance-
  // overclaim language is most likely to creep in via SEO tweaks).
  const compliantMatches = await page.getByText(/HIPAA[- ]compliant/i).count();
  expect(compliantMatches).toBe(0);

  const metaDescription = await page.locator('meta[name="description"]').getAttribute('content');
  expect(metaDescription).not.toMatch(/HIPAA[- ]compliant/i);
  // "designed to comply" is the Cerebral-pattern phrasing — soft
  // affirmative compliance assertion without third-party audit
  // backing it. The body uses "HIPAA-aligned" everywhere; the meta
  // description must not regress to a stronger claim.
  expect(metaDescription).not.toMatch(/designed to comply/i);

  const ogDescription = await page
    .locator('meta[property="og:description"]')
    .getAttribute('content');
  expect(ogDescription).not.toMatch(/HIPAA[- ]compliant/i);
  expect(ogDescription).not.toMatch(/designed to comply/i);

  // D136 — the policy may mention "Data Protection Officer" in the
  // "we do not employ" disclosure context (GDPR Art 37 transparency
  // obligation), but MUST NOT claim a DPO as Quilty's designated
  // privacy contact. The negative disclosure must live in the
  // Who-we-are section (Art 37 is a controller-identification
  // obligation) — scope the locator accordingly so a relocation to
  // a footnote or cross-reference fails the test.
  const whoWeAreHeading = page.locator('h2').filter({ hasText: 'Who we are' });
  await expect(whoWeAreHeading).toBeVisible();
  await expect(
    page.locator('p').filter({ hasText: /do not employ a designated Data Protection Officer/i }),
  ).toBeVisible();
  // Verify the negative-disclosure paragraph is in the same DOM
  // region as the Who-we-are heading (sibling, immediately after).
  const dpoDisclosure = whoWeAreHeading.locator(
    'xpath=following-sibling::p[contains(., "Data Protection Officer")][1]',
  );
  await expect(dpoDisclosure).toBeVisible();
});

test('@a11y /en/legal/privacy carries a stable #gpc fragment anchor for CCPA §7025(c)(6) linking', async ({
  page,
}) => {
  // The #gpc anchor is referenced by the footer "Your Privacy
  // Choices" link + by the cookie banner's privacy-choices target.
  // A refactor that renames the section id would silently break
  // the CCPA-mandated linking obligation. Verify the anchor exists,
  // is on an h2, and is reachable via fragment navigation.
  await page.goto('/en/legal/privacy#gpc');
  const gpcAnchor = page.locator('h2#gpc');
  await expect(gpcAnchor).toBeVisible();
});

test('@a11y /en/legal/privacy carries 45-day SLA (D152) + sensitive-data classification (D153)', async ({
  page,
}) => {
  await page.goto('/en/legal/privacy');
  await expect(
    page.locator('p').filter({ hasText: /We respond to privacy requests within 45 days/is }),
  ).toBeVisible();
  // Sensitive-data classification's three legs must all be present
  // verbatim — supervisory-authority + AI-citation audits grep for
  // the exact statutory citations.
  await expect(page.getByText(/CCPA §1798\.140/)).toBeVisible();
  await expect(page.getByText(/GDPR Article 9/)).toBeVisible();
  await expect(page.getByText(/Washington My Health My Data Act/)).toBeVisible();
});
