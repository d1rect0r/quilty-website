/**
 * Public barrel for @quilty/consent.
 *
 * Three consumer surfaces:
 *   1. `@quilty/consent`               — universal exports (port types
 *      + taxonomy + GPC detector + default-deny reader + isomorphic
 *      ConsentBanner stub). Safe in any runtime.
 *   2. `@quilty/consent/server`        — server-only entry points
 *      (cookie-based ConsentReader + GpcHonoredIndicator; depend on
 *      Next.js `headers()`/`cookies()`). Importing this subpath from a
 *      Client Component is a build error (the modules carry
 *      `import 'server-only'`).
 *   3. `@quilty/consent/testing`       — in-memory fakes for unit tests.
 *
 * The ConsentReader + ConsentSnapshot port contracts are OWNED by this
 * package (port-owned-by-provider). Consumers (e.g., @quilty/observability)
 * depend on this package for the port type rather than re-exporting it.
 */

export type { ConsentReader, ConsentSnapshot } from './ports';

export {
  type CookieCategory,
  type CookieDeclaration,
  type ConsentCategoryState,
  COOKIE_REGISTRY,
  DEFAULT_DENY_STATE,
} from './domain/cookie-taxonomy';

export { detectGpcFromHeaders, type HeaderGetter } from './domain/gpc-detector';

export { makeDefaultDenyConsentReader } from './domain/default-deny-consent';

export { ConsentBanner } from './components/ConsentBanner';
