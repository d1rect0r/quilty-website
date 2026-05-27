/**
 * Public barrel for @quilty/search.
 *
 * Consumers import the SearchIndex port + adapter factories from this
 * file. Deep imports are forbidden by `.dependency-cruiser.cjs` rule
 * `cross-package-imports-must-use-barrel`.
 *
 * The composition root (apps/web/composition.client.ts) wires
 * `makePagefindAdapter()` as the default; the in-memory fake at
 * `@quilty/search/testing` is the test surface; the Algolia skeleton
 * is the swap-trigger placeholder per ADR-0019.
 */

// ---------------------------------------------------------------------------
// Port (type-only re-exports)
// ---------------------------------------------------------------------------

export type {
  FacetBucket,
  SearchFilter,
  SearchHit,
  SearchHitCategory,
  SearchIndex,
  SearchOptions,
  SearchResponse,
  SearchSort,
  SearchSortDirection,
  SearchSortField,
} from './ports/search-index';

// ---------------------------------------------------------------------------
// Adapter factories — vendor-bound; ONLY appear under `src/adapters/*`
// per ADR-0014 Rule 5
// ---------------------------------------------------------------------------

export {
  makePagefindAdapter,
  PagefindBundleUnavailableError,
  type PagefindAdapterOptions,
} from './adapters/pagefind';

// Skeleton — see file for activation gate. Throws at instantiation
// today; uncomment + install algoliasearch at the typo-tolerance /
// facets / analytics trigger per ADR-0019.
export {
  makeAlgoliaAdapter,
  AlgoliaAdapterNotActivatedError,
  type AlgoliaAdapterOptions,
} from './adapters/algolia';
