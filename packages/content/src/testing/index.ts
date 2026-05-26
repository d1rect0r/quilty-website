/**
 * Testing-only barrel for @quilty/content.
 *
 * Exposed via the `@quilty/content/testing` subpath export so the
 * in-memory ImagePipeline fake is NEVER reachable from production code
 * paths. Matches the convention already used by `@quilty/api-client/testing`
 * (the in-memory ApiClient + no-op circuit breaker).
 */

export { makeInMemoryImagePipeline } from '../adapters/in-memory-image-pipeline';
