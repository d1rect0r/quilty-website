import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Vitest config for apps/web. Wires jsdom + React Testing Library +
 * @testing-library/jest-dom + v8 coverage. Tests live colocated under
 * `**\/__tests__/` directories, named `*.test.{ts,tsx}`.
 *
 * The load-bearing primitives previously asserted here (sanitizer + CSP
 * + content schemas + BlockRenderer) all live in extracted packages
 * (`@quilty/security`, `@quilty/content`) with their own per-file
 * thresholds. This config keeps the apps/web shell floor only.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/.velite/**', '**/tests/playwright/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        '**/node_modules/**',
        '**/.next/**',
        '**/.velite/**',
        '**/__tests__/**',
        '**/tests/**',
        '**/*.config.{ts,js,mjs}',
        '**/instrumentation.ts',
        '**/sentry.{client,server,edge}.config.ts',
      ],
      thresholds: {
        // Apps/web shell floor — load-bearing primitives live in their
        // own packages (`@quilty/security`, `@quilty/content`,
        // `@quilty/observability`, `@quilty/seo`) with per-package
        // thresholds. Tighten this floor as more code lands in apps/web.
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 50,
      },
    },
  },
});
