/**
 * SearchIndex port — vendor-agnostic search abstraction.
 *
 * Role-shaped (META-1 / ADR-0014): NO vendor names appear in this file.
 * Vendor identifiers live ONLY in `src/adapters/<vendor>.ts`. The shape
 * is the lowest common denominator across the 4 candidate engines
 * (Pagefind, Algolia, Typesense, Meilisearch), chosen so a future
 * vendor swap is a one-file change in the composition root.
 *
 * Today: `makePagefindAdapter()` (default) — static client-side index
 * generated at build time. Zero queries leave the device (ADR-0019
 * privacy stance).
 *
 * Future swap triggers (per ADR-0019 + watchlist):
 *   - Typo tolerance becomes a UX requirement → Algolia / Typesense
 *   - Facet aggregations across 100+ filter values → hosted engine
 *   - Search analytics (query → click conversion) → hosted engine
 *
 * Content-volume scaling is NOT the swap trigger; Pagefind scales to
 * ~1000 pages with sub-100ms query times on commodity client hardware.
 */

export type SearchSortField = 'relevance' | 'publishedAt' | 'title';
export type SearchSortDirection = 'asc' | 'desc';

export interface SearchSort {
  readonly field: SearchSortField;
  readonly direction: SearchSortDirection;
}

/**
 * Filter applied to a search result set. Today only equality
 * predicates ship; range + contains filters land at the hosted-engine
 * activation trigger (Algolia / Typesense both support them natively).
 */
export interface SearchFilter {
  readonly field: string;
  readonly equals: string | number | boolean;
}

/**
 * Caller-supplied search options. All fields optional; sensible
 * defaults applied by the adapter:
 *   - `pageSize`: 10
 *   - `page`: 1
 *   - `sort`: { field: 'relevance', direction: 'desc' }
 *   - `filters`: []
 *   - `signal`: undefined (no abort)
 */
export interface SearchOptions {
  readonly filters?: readonly SearchFilter[];
  readonly sort?: SearchSort;
  readonly page?: number;
  readonly pageSize?: number;
  readonly signal?: AbortSignal;
}

/**
 * A single search result. Shape locked across all 4 engines: the
 * adapter normalises engine-specific fields (Pagefind `excerpt`,
 * Algolia `_highlightResult`, etc.) into this canonical envelope.
 *
 * `category` is a closed union — adapters that return a different
 * category string MUST extend the union at the port level (port-owned
 * vocabulary per ADR-0014 Rule 4).
 */
export interface SearchHit {
  readonly id: string;
  readonly title: string;
  readonly excerpt: string;
  readonly url: string;
  readonly category: SearchHitCategory;
  readonly locale: string;
  /**
   * Relevance score 0.0-1.0 (higher = better match). Adapters
   * normalise engine-specific scores (Pagefind's word-score,
   * Algolia's ranking score, Typesense's text_match) into [0, 1].
   * Tests assert relative ordering, not absolute values.
   */
  readonly score: number;
}

export type SearchHitCategory = 'blog' | 'customers' | 'legal' | 'changelog' | 'page';

/**
 * Facet bucket — `value` + `count` for a single distinct value of
 * the facet field. Only populated by hosted engines that support
 * facets natively; Pagefind returns `undefined` for `facets`.
 */
export interface FacetBucket {
  readonly value: string;
  readonly count: number;
}

/**
 * Search response envelope. `total` is the unpaginated hit count;
 * `hits` is the current-page slice.
 */
export interface SearchResponse {
  readonly hits: readonly SearchHit[];
  readonly total: number;
  readonly facets?: Readonly<Record<string, readonly FacetBucket[]>>;
}

/**
 * The single public surface every consumer holds. Consumers (search
 * page, Cmd+K modal) call `index.search(q, opts)` and render the
 * response directly.
 *
 * Implementations MUST:
 *   - Treat an empty `q` string as "match nothing" (return `total:
 *     0, hits: []`) — NOT as "match everything".
 *   - Honour `signal.aborted` by rejecting with an `AbortError`-named
 *     error so callers can race against navigation.
 *   - Surface engine errors as plain `Error` (the port deliberately
 *     does NOT carry a typed error union today; the swap-trigger
 *     activation is the right moment to add `SearchError` taxonomy).
 */
export interface SearchIndex {
  readonly search: (q: string, opts?: SearchOptions) => Promise<SearchResponse>;
}
