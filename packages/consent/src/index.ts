/**
 * Public barrel for @quilty/consent.
 *
 * Three consumer surfaces:
 *   1. `@quilty/consent`               — universal exports (taxonomy +
 *      GPC detector + default-deny reader + isomorphic ConsentBanner
 *      stub). Safe in any runtime.
 *   2. `@quilty/consent/server`        — server-only entry points
 *      (cookie-based ConsentReader + GpcHonoredIndicator; depend on
 *      Next.js `headers()`/`cookies()`). Importing this subpath from a
 *      Client Component is a build error (the modules carry
 *      `import 'server-only'`).
 *   3. `@quilty/consent/testing`       — in-memory fakes for unit tests.
 *
 * The package re-exports the `ConsentReader` + `ConsentSnapshot` types
 * from @quilty/observability so consumers can treat @quilty/consent as
 * the canonical consent-surface module without importing two packages.
 * The port itself remains owned by observability (the wrapper layer
 * that consumes it); this re-export is for ergonomics only.
 */

export type { ConsentReader, ConsentSnapshot } from '@quilty/observability';

export {
  type CookieCategory,
  type CookieDeclaration,
  type ConsentCategoryState,
  COOKIE_REGISTRY,
  DEFAULT_DENY_STATE,
} from './domain/cookie-taxonomy.js';

export { detectGpcFromHeaders, type HeaderGetter } from './domain/gpc-detector.js';

export { makeDefaultDenyConsentReader } from './domain/default-deny-consent.js';

export { ConsentBanner } from './components/ConsentBanner.js';
