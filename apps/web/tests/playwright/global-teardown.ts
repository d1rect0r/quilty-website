/**
 * Playwright global teardown. webServer lifecycle handled by Playwright;
 * reserved for process-wide cleanup (clearing seed fixtures, etc.).
 */
async function globalTeardown(): Promise<void> {
  // Reserved.
}

export default globalTeardown;
