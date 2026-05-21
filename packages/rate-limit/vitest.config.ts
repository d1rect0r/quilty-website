import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // ports.ts is type-only (interfaces + type aliases — zero
      // runtime surface to cover). Tests + barrels are scaffolding,
      // not subject material.
      exclude: ['src/index.ts', 'src/testing/index.ts', 'src/ports.ts', 'src/__tests__/**'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        // META-3 target: in-memory adapter is load-bearing for
        // auth-adjacent paths today; lift the floor above the
        // utility-package default.
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 90,
      },
    },
  },
});
