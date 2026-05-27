/**
 * Testing-only barrel for @quilty/search.
 *
 * Exposed via `@quilty/search/testing` subpath so the in-memory fake
 * is NEVER reachable from a production import path. Matches the
 * convention used by `@quilty/api-client/testing` +
 * `@quilty/content/testing` + `@quilty/security/testing`.
 */

export {
  makeInMemorySearchIndex,
  type InMemorySearchDocument,
  type InMemorySearchIndexOptions,
} from '../adapters/in-memory';
