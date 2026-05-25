import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // react-email templates use JSX. The vitejs plugin handles
  // .tsx transforms so vitest can import + render them via
  // @react-email/render in unit tests.
  plugins: [react()],
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/index.ts', 'src/testing/index.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 80,
      },
    },
  },
});
