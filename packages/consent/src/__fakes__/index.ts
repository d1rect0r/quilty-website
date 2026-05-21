/**
 * Testing barrel — consumed by `import { … } from '@quilty/consent/testing'`.
 * Production code MUST NOT import from this path (dep-cruiser rule
 * `cross-package-imports-must-use-barrel` allows the `__fakes__/index.ts`
 * path only as a barrel surface; deep imports are forbidden).
 */

export { makeInMemoryConsentReader, type InMemoryConsentReaderInput } from './in-memory.js';
