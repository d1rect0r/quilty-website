import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Vitest config (expanded in Commit 8 from the M1-bootstrap stub in
 * Commit 5). Wires jsdom + React Testing Library + @testing-library/jest-dom
 * + v8 coverage. Per the M1 plan: tests live colocated under
 * `**\/__tests__/` directories, named `*.test.{ts,tsx}`.
 *
 * Coverage thresholds intentionally start light at M1 — they tighten
 * commit-by-commit as code expands. Round-5 a11y reviewer requested 80%
 * line coverage on `lib/observability/sanitize.ts` + `lib/security/csp.ts`
 * + `lib/content/schemas.ts` + `components/blocks/BlockRenderer.tsx` —
 * those four files are the load-bearing PHI/security/content surfaces.
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
        // Apps/web floor — tighten as code expands. Per-file thresholds
        // for the load-bearing primitives that still live in apps/web
        // (sanitizer + csp moved to @quilty/security with their own
        // ≥90% targets; content schemas + BlockRenderer move to
        // @quilty/content at the content extraction).
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 50,
        'lib/content/schemas.ts': { lines: 80, functions: 80 },
        'components/blocks/BlockRenderer.tsx': { lines: 80, functions: 80 },
      },
    },
  },
});
