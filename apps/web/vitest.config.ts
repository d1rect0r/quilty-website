import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config. Full setup (jsdom env + RTL + coverage thresholds + e2e
 * orchestration) lands in Commit 8. This minimal config wires the `@/*`
 * path alias so unit tests in `lib/security/__tests__/` can resolve their
 * `@/lib/security/csp` imports at runtime — tsconfig `paths` only applies
 * to tsc, not to vitest's resolver (Round-5 TypeScript reviewer finding).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    // Coverage + jsdom env + RTL setup lands in Commit 8.
  },
});
