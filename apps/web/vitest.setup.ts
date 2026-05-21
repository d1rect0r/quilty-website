import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// `server-only` throws unconditionally at module-eval time outside a
// React Server Component build context. Workspace packages with a
// server-only public barrel (@quilty/email, @quilty/captcha,
// @quilty/rate-limit) would fire the guard on every test import; mock
// it out so the jsdom test environment can load server-only modules.
// The production safety lives at the Next.js bundler layer, not here.
vi.mock('server-only', () => ({}));

/**
 * Vitest global setup. Loads @testing-library/jest-dom matchers
 * (toBeInTheDocument, toHaveAttribute, etc.) + ensures every test
 * unmounts cleanly to avoid leaked DOM state.
 *
 * Per D67: `assertNoPHI` runs in stricter mode under test (NODE_ENV
 * is automatically set to 'test' by Vitest). Tests that intentionally
 * construct PHI-shaped payloads (e.g., the `track` consent-gate test)
 * stub NODE_ENV via `vi.stubEnv` for that test only.
 */

afterEach(() => {
  cleanup();
});
