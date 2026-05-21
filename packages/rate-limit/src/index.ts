/**
 * Public barrel for @quilty/rate-limit.
 *
 * Consumers import the `RateLimiter` port + the in-memory adapter
 * (production wiring at M1.5; load-bearing for auth-adjacent paths)
 * + the DynamoDB adapter (typed-throwing skeleton until activation).
 * Deep imports into `src/*` are forbidden by `.dependency-cruiser.cjs`
 * rule `cross-package-imports-must-use-barrel`.
 */

export type { RateLimitDecision, RateLimitPolicy, RateLimiter } from './ports.js';

export {
  makeInMemoryRateLimiter,
  type InMemoryRateLimiter,
  type InMemoryRateLimiterOptions,
} from './adapters/in-memory.js';

export { makeDynamoDbRateLimiter, type DynamoDbAdapterOptions } from './adapters/dynamodb.js';
