import { expect, test } from './makeAxeBuilder';

/**
 * Washington My Health My Data Act standalone policy at
 * `/en/legal/consumer-health-data-privacy` per D150 + RCW 19.373.020
 * + 19.373.030.
 *
 * Coverage:
 *   1. axe-core WCAG 2.2 AA on the rendered page.
 *   2. Page is indexable + crawler-discoverable — the statute
 *      requires a conspicuous home-page link AND broad discoverability
 *      for supervisory-authority + research crawlers.
 *   3. Catch-22 disclosure language (D154 Hintze Law canonical
 *      phrasing) is present.
 *   4. Geofencing-ban acknowledgment (RCW 19.373.060) is present
 *      and explicit.
 *   5. Sensitive-data classification (D153) names the cross-jurisdiction
 *      classification (CCPA §1798.140, GDPR Art 9, WA MHMDA).
 */

test('@a11y /en/legal/consumer-health-data-privacy has no axe-core WCAG 2.2 AA violations', async ({
  page,
  makeAxeBuilder,
}) => {
  await page.goto('/en/legal/consumer-health-data-privacy');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y /en/legal/consumer-health-data-privacy is indexable (no robots noindex)', async ({
  page,
}) => {
  await page.goto('/en/legal/consumer-health-data-privacy');
  const noindexMeta = await page.locator('meta[name="robots"][content*="noindex"]').count();
  expect(noindexMeta).toBe(0);
});

test('@a11y /en/legal/consumer-health-data-privacy carries the Catch-22 disclosure (D154)', async ({
  page,
}) => {
  await page.goto('/en/legal/consumer-health-data-privacy');
  // The Catch-22 operational-tension disclosure is the Hintze Law
  // canonical phrasing — RCW 19.373.040 erasure right vs. consent
  // requirement for service-provider routing. Anchor the assertion
  // to the dedicated paragraph (not bare keyword match) so a future
  // edit that drops the operational-tension framing fails the test.
  await expect(
    page
      .locator('p')
      .filter({ hasText: /prohibits sharing consumer health data.*right of erasure/is }),
  ).toBeVisible();
});

test('@a11y /en/legal/consumer-health-data-privacy carries the geofencing-ban acknowledgment (RCW 19.373.060)', async ({
  page,
}) => {
  await page.goto('/en/legal/consumer-health-data-privacy');
  await expect(
    page.locator('p').filter({ hasText: /RCW 19\.373\.060 prohibits implementing a geofence/is }),
  ).toBeVisible();
});

test('@a11y /en/legal/consumer-health-data-privacy names the sensitive-data classification (D153)', async ({
  page,
}) => {
  await page.goto('/en/legal/consumer-health-data-privacy');
  await expect(page.getByText(/sensitive data class/i)).toBeVisible();
  await expect(page.getByText(/CCPA §1798\.140/)).toBeVisible();
  await expect(page.getByText(/GDPR Article 9/)).toBeVisible();
  // The Washington My Health My Data Act is the third leg of the
  // D153 classification + the surface this entire page implements.
  // A regression that drops the Act's name while keeping the other
  // two citations would otherwise pass silently.
  await expect(page.getByText(/Washington My Health My Data Act/)).toBeVisible();
});
