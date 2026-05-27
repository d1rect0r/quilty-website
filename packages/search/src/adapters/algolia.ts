/**
 * Algolia SearchIndex adapter — SKELETON until activation per ADR-0019.
 *
 * The factory exists so the swap-target shape is locked in the public
 * barrel + ESLint vendor-import allowlist + composition-root type
 * surface from day one. Instantiation throws until the activation
 * trigger fires (see ADR-0019: typo tolerance, facets, or analytics
 * demand — NOT content volume).
 *
 * Activation steps (deferred):
 *   1. `pnpm add algoliasearch` (or `@algolia/client-search` for the
 *      smaller browser bundle).
 *   2. Replace this skeleton's body with the real adapter that wraps
 *      `algoliasearch(appId, apiKey).initIndex(indexName).search()`.
 *   3. Wire the first-party query proxy at
 *      `apps/web/app/api/search/route.ts` (Algolia API key NEVER ships
 *      to the client; the proxy strips IP + forwards the user-agent
 *      via the `X-Algolia-UserToken` shape per Algolia BAA guidance).
 *   4. Move composition.client.ts wiring from `makePagefindAdapter()`
 *      to `makeAlgoliaAdapter(...)`.
 *   5. Add an ADR amendment documenting the swap + the privacy-stance
 *      mitigation (proxy + IP strip).
 *
 * The skeleton-throws-at-instantiation pattern mirrors
 * `makeOpossumCircuitBreaker()` from @quilty/api-client per ADR-0017.
 * Activation should be a deliberate 4-line PR (replace skeleton body
 * + composition wiring + ADR amendment + package.json dep).
 */

import type { SearchIndex } from '../ports/search-index';

export interface AlgoliaAdapterOptions {
  readonly applicationId: string;
  readonly searchApiKey: string;
  readonly indexName: string;
  /**
   * URL of the first-party proxy that strips client IP before
   * forwarding to Algolia. Required at activation: Algolia would
   * otherwise see the user's IP, which under HIPAA-aligned posture
   * is a PII signal we must NOT export to a third party without a
   * BAA in force.
   */
  readonly proxyUrl?: string;
}

export class AlgoliaAdapterNotActivatedError extends Error {
  override readonly name = 'AlgoliaAdapterNotActivatedError';
  constructor() {
    super(
      'makeAlgoliaAdapter() is a skeleton. Activate per ADR-0019 (typo-tolerance, facets, or analytics trigger) — the skeleton ships so the composition-root type surface stays vendor-swappable from day one.',
    );
  }
}

export function makeAlgoliaAdapter(_options: AlgoliaAdapterOptions): SearchIndex {
  throw new AlgoliaAdapterNotActivatedError();
}
