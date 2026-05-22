import { expect, test } from './makeAxeBuilder';

/**
 * Accessibility Statement at `/en/legal/accessibility` per D101 +
 * the European Accessibility Act (EU 2019/882) + EN 301 549 v3.2.1.
 *
 * Coverage:
 *   1. axe-core WCAG 2.2 AA on the rendered page (the page is itself
 *      the accessibility-conformance commitment — any axe violation
 *      here is a direct contradiction of the claim it makes).
 *   2. Page is indexable (no robots: noindex) — supervisory-authority
 *      tooling + research crawlers discover the statement via search.
 *   3. Required content sections are present: WCAG 2.2 AA conformance
 *      assertion, fifteen-business-day SLA, the
 *      `accessibility@my-quilty.com` mailbox, and the EAA / EN 301 549
 *      acknowledgement.
 *   4. `/accessibility` short alias redirects to the canonical URL.
 */

test('@a11y /en/legal/accessibility has no axe-core WCAG 2.2 AA violations', async ({
  page,
  makeAxeBuilder,
}) => {
  await page.goto('/en/legal/accessibility');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y /en/legal/accessibility is indexable (no robots noindex)', async ({ page }) => {
  await page.goto('/en/legal/accessibility');
  const noindexMeta = await page.locator('meta[name="robots"][content*="noindex"]').count();
  expect(noindexMeta).toBe(0);
});

test('@a11y /en/legal/accessibility names the WCAG 2.2 AA standard verbatim', async ({ page }) => {
  await page.goto('/en/legal/accessibility');
  // The exact string is load-bearing — supervisory-authority audits
  // grep for it to verify the conformance claim. A reworded claim
  // (e.g. "WCAG 2.1 AA" or "WCAG Level AA") would fail the audit.
  await expect(page.getByText(/WCAG 2\.2 Level AA/)).toBeVisible();
});

test('@a11y /en/legal/accessibility cites EN 301 549 (the EAA conformance basis)', async ({
  page,
}) => {
  await page.goto('/en/legal/accessibility');
  await expect(page.getByText(/EN 301 549/)).toBeVisible();
});

test('@a11y /en/legal/accessibility surfaces the 15-business-day SLA + mailbox', async ({
  page,
}) => {
  await page.goto('/en/legal/accessibility');
  await expect(page.getByText(/fifteen business days/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'accessibility@my-quilty.com' })).toBeVisible();
});

test('@seo /accessibility short alias redirects to /en/legal/accessibility', async ({
  request,
}) => {
  const response = await request.get('/accessibility', { maxRedirects: 0 });
  // `permanent: false` in next.config.ts maps to a 307 (temporary)
  // redirect. When i18n locks, the alias graduates to 308 permanent.
  expect([307, 308]).toContain(response.status());
  const location = response.headers()['location'] ?? '';
  expect(location).toContain('/en/legal/accessibility');
});
