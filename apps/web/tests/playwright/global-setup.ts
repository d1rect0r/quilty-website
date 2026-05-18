/**
 * Playwright global setup. `webServer` config in playwright.config.ts
 * handles dev-server lifecycle; this hook is reserved for any process-
 * wide test prep (e.g., seeding fixtures, configuring fake clocks).
 *
 * At M1: no-op. M5+ when account-portal e2e tests need seeded user
 * fixtures, the seed step lands here.
 */
async function globalSetup(): Promise<void> {
  // Reserved.
}

export default globalSetup;
