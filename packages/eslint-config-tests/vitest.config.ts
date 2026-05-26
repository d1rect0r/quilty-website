import { defineConfig } from 'vitest/config';

// Tests verify the repo-root `eslint.config.mjs` by spinning up an
// ESLint instance against fixture strings. Node environment only —
// no DOM, no React, no jsx.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['__tests__/**/*.{test,spec}.ts'],
    // The fixture-linting ESLint passes are heavier than unit tests
    // (instantiates the full repo config); allow a longer per-test
    // budget without making the suite feel slow.
    testTimeout: 30_000,
  },
});
