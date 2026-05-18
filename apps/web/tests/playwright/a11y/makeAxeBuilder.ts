import AxeBuilder from '@axe-core/playwright';
import { test as base } from '@playwright/test';

/**
 * Shared `makeAxeBuilder` fixture per D22 + Round-5 a11y reviewer.
 *
 * Tag set: WCAG 2.2 AA — the full WCAG 2.0 + 2.1 + 2.2 Level A + AA bands.
 * This is the legal floor for ADA / EAA / Section 508 per D23.
 *
 * Disabled rules: NONE at M1. Every axe-core rule that flags is a real
 * issue we need to fix. If a rule needs to be disabled, document the
 * justification inline alongside the disable.
 *
 * Usage:
 *   import { test, expect } from '@/tests/playwright/a11y/makeAxeBuilder';
 *   test('@a11y homepage has no axe violations', async ({ page, makeAxeBuilder }) => {
 *     await page.goto('/en');
 *     const results = await makeAxeBuilder().analyze();
 *     expect(results.violations).toEqual([]);
 *   });
 */

const WCAG_22_AA_TAGS: readonly string[] = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

export const test = base.extend<{
  makeAxeBuilder: () => AxeBuilder;
}>({
  makeAxeBuilder: async ({ page }, use) => {
    const builder = () => new AxeBuilder({ page }).withTags([...WCAG_22_AA_TAGS]);
    await use(builder);
  },
});

export { expect } from '@playwright/test';
