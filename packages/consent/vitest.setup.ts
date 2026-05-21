import { vi } from 'vitest';

// `server-only` (npm) throws unconditionally at module-eval time outside
// a React Server Component build context. Vitest runs the package tests
// in a jsdom environment where the guard would fire on every server-
// subpath import; the production safety the package provides (build-
// time rejection of client imports) lives at the Next.js bundler layer,
// not in the runtime. Mock it out so the test environment can load
// server-only modules without tripping the guard.
vi.mock('server-only', () => ({}));
