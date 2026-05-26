/**
 * Vitest setup for @quilty/content tests.
 *
 * Mocks `server-only` so any block component (or transitive import)
 * that includes `import 'server-only'` doesn't blow up in the jsdom
 * test environment. Mirrors the apps/web setup; centralised here to
 * keep package-scoped tests self-contained.
 */

import { vi } from 'vitest';

vi.mock('server-only', () => ({}));
