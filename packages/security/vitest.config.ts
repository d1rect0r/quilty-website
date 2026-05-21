import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/testing/**', 'src/__tests__/**', 'src/index.ts'],
      reporter: ['text', 'html', 'json-summary'],
      // Security package is the chokepoint primitive — coverage targets
      // sit above the project-wide floor because the PHI sanitizer +
      // CSP/headers builders are load-bearing for HIPAA-aligned posture.
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
