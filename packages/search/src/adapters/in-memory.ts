/**
 * In-memory SearchIndex adapter — production-grade test fake.
 *
 * Backs the contract test surface (parameterised against this fake +
 * every real adapter) AND any consumer test that needs deterministic
 * search results without standing up Pagefind/Algolia. Exposed via the
 * `@quilty/search/testing` subpath barrel so it cannot leak into a
 * production import path (matches the @quilty/api-client convention).
 *
 * Search semantics:
 *   - Case-insensitive substring match against `title` + `excerpt`
 *   - Empty query → empty result set (matches the port invariant
 *     "an empty query means match nothing, not everything")
 *   - Score = 1.0 when both title + excerpt match; 0.7 title-only;
 *     0.4 excerpt-only. Sorted desc by score, then by `id` asc for
 *     determinism.
 *   - Filters apply equality predicates; multiple filters AND.
 *   - Pagination: `page` is 1-indexed; `pageSize` defaults to 10.
 *   - `signal.aborted` short-circuits with `AbortError`.
 *
 * NOT exhaustive — does not implement facets (returns undefined), does
 * not implement typo tolerance, does not implement stemming. Real
 * engines layer those concerns on top of the same port contract.
 */

import type {
  SearchFilter,
  SearchHit,
  SearchHitCategory,
  SearchIndex,
  SearchOptions,
  SearchResponse,
} from '../ports/search-index';

export interface InMemorySearchDocument {
  readonly id: string;
  readonly title: string;
  readonly excerpt: string;
  readonly url: string;
  readonly category: SearchHitCategory;
  readonly locale: string;
  /** Arbitrary extra fields the in-memory adapter uses for filter
   * matching. Hosted engines store these as facets or filterable
   * attributes; in-memory just keys on the field name. */
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface InMemorySearchIndexOptions {
  readonly documents: readonly InMemorySearchDocument[];
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

export function makeInMemorySearchIndex(options: InMemorySearchIndexOptions): SearchIndex {
  const { documents } = options;
  return {
    async search(q: string, opts: SearchOptions = {}): Promise<SearchResponse> {
      if (opts.signal?.aborted) {
        throw makeAbortError();
      }
      const trimmed = q.trim();
      if (trimmed.length === 0) {
        return { hits: [], total: 0 };
      }

      const needle = trimmed.toLowerCase();
      const filtered = opts.filters?.length ? applyFilters(documents, opts.filters) : documents;

      // Score every doc; drop zero-score matches.
      const scored: SearchHit[] = [];
      for (const doc of filtered) {
        const titleMatch = doc.title.toLowerCase().includes(needle);
        const excerptMatch = doc.excerpt.toLowerCase().includes(needle);
        if (!titleMatch && !excerptMatch) continue;
        scored.push({
          id: doc.id,
          title: doc.title,
          excerpt: doc.excerpt,
          url: doc.url,
          category: doc.category,
          locale: doc.locale,
          score: titleMatch && excerptMatch ? 1.0 : titleMatch ? 0.7 : 0.4,
        });
      }

      // Stable sort: score desc, then id asc.
      scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id.localeCompare(b.id)));

      const page = opts.page ?? DEFAULT_PAGE;
      const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
      const start = (page - 1) * pageSize;
      const sliced = scored.slice(start, start + pageSize);

      return { hits: sliced, total: scored.length };
    },
  };
}

function applyFilters(
  documents: readonly InMemorySearchDocument[],
  filters: readonly SearchFilter[],
): readonly InMemorySearchDocument[] {
  return documents.filter((doc) => {
    return filters.every((filter) => {
      // Built-in fields take precedence over `attributes`.
      const builtIn = readBuiltInField(doc, filter.field);
      if (builtIn !== undefined) return builtIn === filter.equals;
      const attr = doc.attributes?.[filter.field];
      return attr !== undefined && attr === filter.equals;
    });
  });
}

function readBuiltInField(
  doc: InMemorySearchDocument,
  field: string,
): string | number | boolean | undefined {
  if (field === 'category') return doc.category;
  if (field === 'locale') return doc.locale;
  if (field === 'id') return doc.id;
  return undefined;
}

function makeAbortError(): Error {
  // Match the DOM `AbortError` shape so callers can `if (err.name ===
  // 'AbortError')` without importing this package.
  const err = new Error('Search aborted by caller');
  err.name = 'AbortError';
  return err;
}
