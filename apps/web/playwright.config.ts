import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e + a11y test config per D22 + ADR-0006.
 *
 * Browser matrix: Chromium + WebKit. Firefox is omitted (mobile +
 * Safari = highest user surface; Chrome covers the rest). Add Firefox
 * if Lighthouse CI flags a Gecko-specific regression.
 *
 * Test orchestration: spawns the dev/prod server once via the
 * webServer config; tears down via global-teardown. In CI we use
 * `pnpm build && pnpm start` for production-mode assertions —
 * Turbopack hot-compilation in dev mode is too flaky for the wider
 * CI test budget (a slow first-route compile blows past Playwright's
 * 30s test timeout, even though the test itself takes <1s on a warm
 * server). Locally we keep `pnpm dev` with `reuseExistingServer: true`
 * so developers get immediate feedback after `pnpm dev` is already up.
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
  // makeAxeBuilder fixture would crash on module load (TS
  // reviewer cross-check). Playwright 1.45+ supports this key.
  tsconfig: './tsconfig.json',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Workers must be a string|number (not undefined) under
  // exactOptionalPropertyTypes. CI runs serial (Turbopack cold-compile
  // contention causes false-positive timeouts when parallel workers
  // hammer first-page-load); local also defaults serial since the dev
  // server is the bottleneck. Override with `--workers N` to run faster
  // once the build is warm (.next cache present).
  workers: 1,
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
        // Production build + start — avoids Turbopack dev-mode
        // compile races that previously caused systemic Playwright
        // failures across error-boundary, legal-pages, mhmda-page,
        // gpc-force-off, and contact-form suites. Build happens BEFORE
        // Playwright runs (the `Next.js build` job in ci.yml runs in
        // parallel; here we expect `.next/` to already exist from
        // the previous step). Timeout is generous to allow `next start`
        // cold boot under runner load.
        command: 'pnpm start',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 90_000,
      }
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
