import 'server-only';

/**
 * Public barrel for @quilty/rate-limit.
 *
 * Consumers import the `RateLimiter` port + the in-memory adapter
 * (production wiring today; load-bearing for auth-adjacent paths)
 * + the DynamoDB adapter (typed-throwing skeleton until activation).
 * Deep imports into `src/*` are forbidden by `.dependency-cruiser.cjs`
 * rule `cross-package-imports-must-use-barrel`.
 */

export type { RateLimitDecision, RateLimitPolicy, RateLimiter } from './ports';

export {
  makeInMemoryRateLimiter,
  type InMemoryRateLimiter,
  type InMemoryRateLimiterOptions,
} from './adapters/in-memory';

export { makeDynamoDbRateLimiter, type DynamoDbAdapterOptions } from './adapters/dynamodb';
