import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e + a11y test config per D22 + ADR-0006.
 *
 * Browser matrix: Chromium + WebKit. Firefox is omitted at M1 (mobile +
 * Safari = highest user surface; Chrome covers the rest). Add Firefox at
 * the M2 launch gate if Lighthouse CI flags a regression.
 *
 * Test orchestration: spawns `pnpm dev` once via global-setup; tears down
 * via global-teardown. M2+ may switch to `pnpm build && pnpm start` for
 * production-mode assertions.
 *
 * Tag conventions:
 *   - `@a11y` — axe-core assertions; tagged tests run via `pnpm test:a11y`
 *   - `@security` — CSP + headers assertions
 *   - `@seo` — sitemap, robots, metadata assertions
 *   - `@smoke` — basic route reachability
 */
export default defineConfig({
  testDir: './tests/playwright',
  // Honor tsconfig path aliases — without this, Playwright's TS transform
  // does not resolve `@/*` at runtime, and every spec importing the
  // makeAxeBuilder fixture would crash on module load (Round-5 TS
  // reviewer cross-check). Playwright 1.45+ supports this key.
  tsconfig: './tsconfig.json',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/playwright/global-setup.ts',
  globalTeardown: './tests/playwright/global-teardown.ts',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: process.env.CI
    ? {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
