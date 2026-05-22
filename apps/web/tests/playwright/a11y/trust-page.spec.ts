import { expect, test } from './makeAxeBuilder';

/**
 * Trust Center one-pager at `/en/trust` per D103.
 *
 * Coverage:
 *   1. axe-core WCAG 2.2 AA — the Trust Center is the page enterprise
 *      procurement scans against accessibility-conformance + security-
 *      posture criteria simultaneously; a violation here directly
 *      contradicts the EAA conformance claim made on the adjacent
 *      accessibility statement.
 *   2. The page uses "HIPAA-aligned" + does NOT use "HIPAA-compliant"
 *      (D104; Cerebral $7M FTC settlement precedent — claiming
 *      compliance without third-party attestation is a deceptive-acts
 *      violation under §5 of the FTC Act).
 *   3. The SOC 2 disclosure is honest — "readiness work" is named,
 *      not in-force attestation.
 */

test('@a11y /en/trust has no axe-core WCAG 2.2 AA violations', async ({ page, makeAxeBuilder }) => {
  await page.goto('/en/trust');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y /en/trust uses "HIPAA-aligned" and never "HIPAA-compliant"', async ({ page }) => {
  await page.goto('/en/trust');
  // The locator targets the full paragraph (not the bare <strong>
  // node) so that a refactor that keeps the keyword but drops the
  // disclaimer is caught here, not silently passed through. The
  // FTC §5 deceptive-acts posture rests on the full disclaimer
  // sentence, not the keyword alone.
  await expect(
    page.locator('p').filter({ hasText: /HIPAA-aligned.*not claim.*HIPAA compliance/is }),
  ).toBeVisible();
  const compliantMatches = await page.getByText(/HIPAA[- ]compliant/i).count();
  expect(compliantMatches).toBe(0);
});

test('@a11y /en/trust names SOC 2 as readiness work, not in-force attestation', async ({
  page,
}) => {
  await page.goto('/en/trust');
  // Filter on the same paragraph carrying BOTH the keyword + the
  // "readiness work" disclaimer. A future edit that promotes the
  // claim to "in force" without an attestation fails this locator
  // even though the keyword is still on the page (D183 honesty
  // discipline; Cerebral $7M precedent applies to attestation
  // characterization too).
  await expect(
    page.locator('p').filter({ hasText: /SOC 2 Type II.*readiness work is in progress/is }),
  ).toBeVisible();
});
