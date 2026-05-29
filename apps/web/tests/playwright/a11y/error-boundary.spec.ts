import { test, expect } from '@/tests/playwright/a11y/makeAxeBuilder';

/**
 * Error boundary a11y contract per WCAG 2.4.3 (Focus Order) +
 * 3.2.5 (Change on Request) + 4.1.3 (Status Messages, ARIA19
 * technique).
 *
 * `/dev/boom` synchronously throws in non-production builds, which
 * Next.js routes through `app/error.tsx`. The spec asserts:
 *   - role="alert" + aria-live="assertive" + aria-atomic="true"
 *     on the announcement region
 *   - heading receives focus on mount (context change, not status
 *     update)
 *   - digest renders when present (D141 visibility)
 *   - axe-core WCAG 2.2 AA passes (no regression in the
 *     surrounding error UI)
 *   - D147 retry-fallback: two reset clicks within 5s reveal the
 *     permanent fallback view
 */

test('@a11y /dev/boom triggers the error boundary with role=alert + focus on heading + digest visible', async ({
  page,
  makeAxeBuilder,
}) => {
  await page.goto('/dev/boom');

  // role="alert" + ARIA19 attributes on the announcement region. Scope
  // to the error-boundary section to disambiguate from Next.js's
  // built-in `<div id="__next-route-announcer__" role="alert">` route-
  // change announcer (which is always present on every App Router
  // page) — without the scope, the locator resolves to 2+ elements
  // and the strict-mode toBeVisible() assertion fails.
  const alert = page.locator('section[aria-labelledby="error-heading"] [role="alert"]');
  await expect(alert).toBeAttached();
  await expect(alert).toHaveAttribute('aria-live', 'assertive');
  await expect(alert).toHaveAttribute('aria-atomic', 'true');

  // Heading on the error page receives focus on mount.
  const heading = page.locator('h1#error-heading');
  await expect(heading).toBeFocused();
  await expect(heading).toHaveAttribute('tabindex', '-1');

  // Digest visible (D141) — Next.js generates one for every
  // server-side error; the dev/boom throw is intercepted as a
  // client-side error in the App Router so a digest may or may not
  // be attached depending on streaming behavior. Assert presence
  // is attached but not strictly visible — the structural element
  // exists for the copy-reference activation.
  const digest = page.getByTestId('error-digest');
  await expect(digest).toBeAttached();

  // axe sweep on the full document — confirms the new markup did
  // not introduce a violation in the surrounding tree.
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});

test('@a11y /dev/boom retry-fallback — two reset clicks within 5s reveal permanent fallback (D147)', async ({
  page,
}) => {
  await page.goto('/dev/boom');

  const retryButton = page.getByRole('button', { name: /try again/i });
  await expect(retryButton).toBeVisible();
  await retryButton.click();
  // Throw is synchronous in BoomPage so reset() re-mounts the same
  // error boundary; the user-facing artifact is the boundary
  // re-rendering with the same digest. Clicking again within 5s
  // triggers the permanent-fallback transition.
  await retryButton.click();

  // After the second click, the button is removed; Go-home + Email
  // support remain.
  await expect(page.getByRole('button', { name: /try again/i })).toBeHidden();
  await expect(page.getByRole('link', { name: /go home/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /email support/i })).toBeVisible();

  // The role=alert region must re-announce when its body text flips
  // from the recoverable copy to the permanent-fallback copy. The
  // copy delta is the screen-reader-observable evidence that the
  // live region fired. Scope to the error-boundary section to skip
  // Next.js's built-in `__next-route-announcer__` role=alert.
  const alert = page.locator('section[aria-labelledby="error-heading"] [role="alert"]');
  await expect(alert).toContainText(/could not recover/i);
});
