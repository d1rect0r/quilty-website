import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.{ts,mts,mjs}'],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'scripts/**'],
      exclude: ['src/style-dictionary.config.mjs', '**/__tests__/**'],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
