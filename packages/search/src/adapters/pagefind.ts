/**
 * Pagefind SearchIndex adapter (vendor-bound).
 *
 * Wraps the Pagefind client-side bundle generated at `pnpm
 * build:pagefind` (post-`next build`). The bundle ships at
 * `/pagefind/pagefind.js` + `/pagefind/pagefind-ui.css`; this adapter
 * lazily imports `/pagefind/pagefind.js` at first search() call so the
 * ~50 KB bundle stays out of the initial page payload.
 *
 * Privacy stance (ADR-0019): every query stays on the device. Pagefind
 * fetches inverted-index segments via HTTP range requests on the
 * static `/pagefind/index/*.pf_index` files; the query string never
 * appears in a network request. Hosted-engine swaps (Algolia /
 * Typesense / Meilisearch) must wire a first-party proxy + IP strip
 * to preserve this stance.
 *
 * NOT ACTIVATED yet: Pagefind needs MDX content to index against.
 * The build script (`apps/web/scripts/build-pagefind.mjs`) handles
 * the empty-content case gracefully (no-op). Composition wires the
 * in-memory fake as the default; the Pagefind adapter activates when
 * MDX content lands per ADR-0019.
 *
 * Vendor-error translation (ADR-0014 Rule 5): Pagefind's loader throws
 * generic Error on bundle-not-found; the adapter normalises to a
 * `PagefindBundleUnavailableError` so callers can recover (e.g.,
 * fall back to ComingSoonSearch UI).
 */

import type {
  SearchHit,
  SearchHitCategory,
  SearchIndex,
  SearchOptions,
  SearchResponse,
} from '../ports/search-index';

export interface PagefindAdapterOptions {
  /**
   * URL where the Pagefind bundle is mounted. Defaults to
   * `/pagefind/pagefind.js`. Override only when the build pipeline
   * publishes the bundle at a non-canonical path (subpath deploy,
   * custom CDN routing).
   */
  readonly bundleUrl?: string;
  /**
   * Optional filter restricting indexed documents to a specific
   * Pagefind tag set. The Velite content collection emits the
   * `pagefind-quilty` tag on every searchable page; passing this
   * filter at the adapter layer scopes all queries.
   */
  readonly indexTag?: string;
  /**
   * Test-injection seam. Production passes nothing; the default
   * loader dynamically imports the Pagefind bundle from `bundleUrl`.
   * Tests inject a fake loader returning a stubbed module so the
   * adapter's normalisation logic can be exercised without standing
   * up a real bundle.
   *
   * The seam exists because vitest's `vi.mock` of a runtime-dynamic
   * URL like `/pagefind/pagefind.js` caches the resolution across
   * tests in the same file (the mock factory evaluates ONCE per
   * module-import), making per-test stubbing impossible without
   * `vi.resetModules()` between tests.
   */
  readonly loadModule?: () => Promise<PagefindModule>;
}

const DEFAULT_BUNDLE_URL = '/pagefind/pagefind.js';
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

/**
 * Pagefind module shape — minimal subset the adapter consumes. The
 * upstream package ships its own types but we keep a narrow local
 * shape so a Pagefind major-version bump doesn't quietly change the
 * adapter contract.
 */
export interface PagefindModule {
  search: (
    q: string,
    opts?: Record<string, unknown>,
  ) => Promise<{
    results: readonly PagefindResult[];
  }>;
  options?: (opts: Record<string, unknown>) => Promise<void>;
}

export interface PagefindResult {
  id: string;
  data: () => Promise<PagefindResultData>;
}

export interface PagefindResultData {
  url: string;
  raw_url?: string;
  excerpt: string;
  meta: {
    title?: string;
    category?: string;
    locale?: string;
    [key: string]: unknown;
  };
  // Pagefind's "score" lives on the parent result, but the data()
  // payload doesn't carry it; we attach it at the adapter layer.
  score?: number;
}

export class PagefindBundleUnavailableError extends Error {
  override readonly name = 'PagefindBundleUnavailableError';
  constructor(bundleUrl: string, cause?: unknown) {
    super(
      `Pagefind bundle not reachable at ${bundleUrl}. Run \`pnpm build:pagefind\` after \`next build\`, OR fall back to the ComingSoonSearch UI.`,
      { cause },
    );
  }
}

export function makePagefindAdapter(options: PagefindAdapterOptions = {}): SearchIndex {
  const bundleUrl = options.bundleUrl ?? DEFAULT_BUNDLE_URL;
  let modulePromise: Promise<PagefindModule> | undefined;

  // Default loader: lazy dynamic import. Pagefind's bundle is a
  // side-effecty module that initialises wasm + fetches index
  // segments on first eval. Deferring until first search() call keeps
  // it out of the initial page load. Tests inject `options.loadModule`
  // to bypass dynamic-import caching (see PagefindAdapterOptions
  // docstring).
  const defaultLoader = async (): Promise<PagefindModule> => {
    try {
      // Vite-style dynamic import; comment hints to webpack to
      // emit a separate chunk + ignore the URL during build-time
      // resolution (the URL only exists at runtime after
      // build:pagefind has run).
      const mod = (await import(/* @vite-ignore */ /* webpackIgnore: true */ bundleUrl)) as
        | PagefindModule
        | { default: PagefindModule };
      return 'default' in mod ? mod.default : mod;
    } catch (err) {
      throw new PagefindBundleUnavailableError(bundleUrl, err);
    }
  };

  const loader = options.loadModule ?? defaultLoader;

  const loadModule = (): Promise<PagefindModule> => {
    if (modulePromise) return modulePromise;
    modulePromise = loader().catch((err) => {
      // Reset the cache on error so a transient failure (network /
      // missing bundle in dev) can self-heal on a retry rather than
      // sticking forever.
      modulePromise = undefined;
      if (err instanceof PagefindBundleUnavailableError) throw err;
      throw new PagefindBundleUnavailableError(bundleUrl, err);
    });
    return modulePromise;
  };

  return {
    async search(q: string, opts: SearchOptions = {}): Promise<SearchResponse> {
      if (opts.signal?.aborted) {
        throw makeAbortError();
      }
      const trimmed = q.trim();
      if (trimmed.length === 0) {
        return { hits: [], total: 0 };
      }

      const pagefind = await loadModule();

      // Apply tag-scoping options before the first search per Pagefind
      // canonical API. `.options()` is idempotent — calling it on
      // every search has no measured cost.
      if (options.indexTag && pagefind.options) {
        await pagefind.options({
          baseFilters: { 'pagefind-tag': options.indexTag },
        });
      }

      const pagefindOpts: Record<string, unknown> = {};
      if (opts.filters?.length) {
        // Pagefind filter shape: { filterField: { equals: value } } —
        // we normalise from our port shape.
        const filters: Record<string, { equals: string }> = {};
        for (const filter of opts.filters) {
          filters[filter.field] = { equals: String(filter.equals) };
        }
        pagefindOpts['filters'] = filters;
      }

      // Re-check abort after loader resolved — the bundle fetch
      // can take time on cold cache; Pagefind's own search() has no
      // native AbortSignal parameter so this is the last cancellation
      // gate before the bundle invocation. (Future-proofing: a
      // cancellable engine would receive `signal` here.)
      if (opts.signal?.aborted) {
        throw makeAbortError();
      }

      const response = await pagefind.search(trimmed, pagefindOpts);

      // Pagination + result-data fetch happens AFTER the initial
      // search returns; Pagefind defers per-result data fetch to keep
      // the initial response small. Slice before fetching to avoid
      // wasteful network on pages we won't return. The score formula
      // uses GLOBAL index (start + indexOnPage), not page-relative,
      // so page 2 results don't get artificially inflated scores.
      const page = opts.page ?? DEFAULT_PAGE;
      const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
      const start = (page - 1) * pageSize;
      const pageSlice = response.results.slice(start, start + pageSize);

      const hits: SearchHit[] = await Promise.all(
        pageSlice.map(async (result, indexOnPage) => {
          const data = await result.data();
          return normaliseHit(data, result.id, start + indexOnPage, response.results.length);
        }),
      );

      return { hits, total: response.results.length };
    },
  };
}

function normaliseHit(
  data: PagefindResultData,
  id: string,
  globalIndex: number,
  totalResults: number,
): SearchHit {
  // Pagefind doesn't expose a numeric per-result score; we synthesise
  // a [0,1] score by relative position in the FULL result list
  // (highest = 1.0, monotonically decreasing). `globalIndex` is the
  // absolute position across all pages; consumers asserting relative
  // ordering across pages get the right behaviour. Clamped to [0, 1]
  // defensively (a pathological pagination overshoot can't ever push
  // the score below 0).
  const raw = totalResults <= 1 ? 1 : 1 - globalIndex / Math.max(totalResults, 1);
  const score = Math.max(0, Math.min(1, raw));
  return {
    id,
    title: data.meta.title ?? '(untitled)',
    excerpt: data.excerpt,
    url: data.raw_url ?? data.url,
    category: normaliseCategory(data.meta.category),
    locale: data.meta.locale ?? 'en',
    score,
  };
}

function normaliseCategory(raw: string | undefined): SearchHitCategory {
  // The port locks a closed union of 5 categories. Pagefind allows
  // arbitrary string metadata; we narrow to the known set and fall
  // back to 'page' for unknowns rather than widening the port.
  if (raw === 'blog' || raw === 'customers' || raw === 'legal' || raw === 'changelog') {
    return raw;
  }
  return 'page';
}

function makeAbortError(): Error {
  const err = new Error('Search aborted by caller');
  err.name = 'AbortError';
  return err;
}
