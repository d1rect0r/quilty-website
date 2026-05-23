/**
 * Public barrel for @quilty/consent.
 *
 * Three consumer surfaces:
 *   1. `@quilty/consent`               — universal exports (port types
 *      + taxonomy + GPC detector + default-deny reader + Banner Client
 *      Component). Safe in any runtime.
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

export type { ConsentReader, ConsentSnapshot, ConsentStore, ConsentIdentifier } from './ports';

export { mergeConsentSnapshots } from './domain/migrate';

export {
  type CookieCategory,
  type CookieDeclaration,
  type ConsentCategoryState,
  type V0ConsentCategoryState,
  type TaxonomyVersion,
  TAXONOMY_VERSION,
  CONSENT_COOKIE_NAME,
  COOKIE_REGISTRY,
  DEFAULT_DENY_STATE,
  migrateFromV0,
} from './domain/cookie-taxonomy';

// `detectGpcFromHeaders` + its `HeaderGetter` type intentionally live
// on the `@quilty/consent/server` subpath. They read a request header
// + are meaningless in the browser; routing them through /server
// prevents a future Client-Component import from shipping the function
// to the client bundle without a build-time error.

export { makeDefaultDenyConsentReader } from './domain/default-deny-consent';

export { Banner, type BannerProps } from './components/Banner';

// `makeInMemoryConsentStore` lives on the server subpath
// (`@quilty/consent/server`) rather than the universal barrel — the
// store carries an in-process audit-history Map that should never
// instantiate in a client bundle. The server + edge composition roots
// import it from the server subpath; client code cannot reach it.
