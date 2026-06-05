import { vi } from 'vitest';

// `server-only` (npm) throws at module-eval time outside a React Server
// Component build context. The production safety the package provides
// (build-time rejection of client imports) lives at the Next.js bundler
// layer, not the runtime; mock it out so the store adapters load in the
// Vitest node environment.
vi.mock('server-only', () => ({}));
