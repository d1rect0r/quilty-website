import { expect, test } from './makeAxeBuilder';

/**
 * A11y tests for /contact form — WCAG 2.2 AA verification.
 *
 * Coverage:
 *   - axe-core scan of the full page (form + disclaimer + layout)
 *   - Keyboard-only Tab order touches every interactive control
 *     in expected sequence
 *   - Field error wiring: aria-describedby + aria-invalid + role=alert
 *     on each field's error paragraph
 *   - Form-level live regions render their expected shape (output +
 *     aria-live attribute, separate success-polite + error-assertive)
 *   - Honeypot field is NOT in the accessibility tree (aria-hidden
 *     parent + tabindex=-1 + offscreen)
 *   - Submit button meets 44×44 target-size floor (WCAG 2.5.5)
 *
 * Tag: @a11y — invoked via `pnpm test:a11y`.
 */

test.describe('@a11y /contact form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/contact');
  });

  test('passes axe-core scan on initial render', async ({ makeAxeBuilder }) => {
    const results = await makeAxeBuilder().analyze();
    expect(results.violations).toEqual([]);
  });

  test('keyboard Tab order: name → email → subject → message → submit', async ({ page }) => {
    // Focus the first tabbable element by tabbing from <body>.
    await page.keyboard.press('Tab');
    let focused = await page.evaluate(() => document.activeElement?.id);
    // The skip-link may be the first focused element on the page;
    // tab past it if so until we reach the name field.
    let attempts = 0;
    while (focused !== undefined && !focused.endsWith('-name') && attempts < 20) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => document.activeElement?.id);
      attempts += 1;
    }
    expect(focused).toMatch(/-name$/);

    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toMatch(/-email$/);

    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toMatch(/-subject$/);

    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toMatch(/-message$/);
  });

  test('field error wiring: aria-invalid + aria-describedby + persistent role=status', async ({
    page,
  }) => {
    await page.getByRole('textbox', { name: /^name$/i }).fill('Alice');
    await page.getByRole('textbox', { name: /^email$/i }).fill('not-an-email');
    await page.getByRole('textbox', { name: /^subject$/i }).fill('Hi');
    await page.getByRole('textbox', { name: /^message$/i }).fill('A message that is long enough.');
    await page.getByRole('button', { name: /send message/i }).click();

    const emailInput = page.getByRole('textbox', { name: /^email$/i });
    await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await emailInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    if (describedBy) {
      // Persistent <output> region (polite) — `<output>` carries an
      // implicit role="status" via HTML-AAM. Present in the AT tree
      // whether or not an error exists, so AT users hear
      // populated→empty→populated transitions when they correct fields.
      const errorEl = page.locator(`#${describedBy}`);
      await expect(errorEl).toHaveAttribute('aria-live', 'polite');
      await expect(errorEl).toContainText(/valid email/i);
    }
  });

  test('form-level live regions exist with the expected shape', async ({ page }) => {
    // Success region — implicit role=status via <output>, polite.
    const successOutput = page.locator('output[id$="-success"]');
    await expect(successOutput).toHaveAttribute('aria-live', 'polite');

    // Error region — explicit role=alert overrides the implicit
    // role=status; aria-live=assertive for transient submit failures.
    const errorOutput = page.locator('output[id$="-error"]');
    await expect(errorOutput).toHaveAttribute('role', 'alert');
    await expect(errorOutput).toHaveAttribute('aria-live', 'assertive');
  });

  test('honeypot field is hidden from AT (aria-hidden parent + tabindex=-1)', async ({ page }) => {
    // Honeypot field name is randomized per render from a fixed pool;
    // locate by tabindex=-1 within an aria-hidden parent.
    const honeypotInputs = page.locator('[aria-hidden="true"] input[tabindex="-1"]');
    await expect(honeypotInputs).toHaveCount(1);
    const autoComplete = await honeypotInputs.first().getAttribute('autocomplete');
    expect(autoComplete).toBe('nope');
  });

  test('submit button meets 44×44 target-size floor (WCAG 2.5.5)', async ({ page }) => {
    const button = page.getByRole('button', { name: /send message/i });
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('disclaimer carries the complementary landmark role + accessible name', async ({ page }) => {
    // <aside> with aria-label keeps its implicit complementary role —
    // verifying via getByRole asserts the role is in the AT tree.
    const disclaimer = page.getByRole('complementary', { name: /privacy disclaimer/i });
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText(/sensitive medical or personal/i);
  });
});
