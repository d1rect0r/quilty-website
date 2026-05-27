import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['**/__tests__/**', 'src/testing/**'],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
