import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/testing/**', 'src/__tests__/**', 'src/index.ts'],
      reporter: ['text', 'html', 'json-summary'],
      // The observability spine carries the default-deny consent gate +
      // PHI sanitizer chokepoint composition. Coverage targets sit above
      // the project floor because the Cerebral lesson is load-bearing here.
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 80,
      },
    },
  },
});
