/**
 * Testing barrel for @quilty/rate-limit. Consumed via
 * `@quilty/rate-limit/testing`. The in-memory limiter is the
 * canonical test fake (also the production wiring at M1.5).
 */

export {
  makeInMemoryRateLimiter,
  type InMemoryRateLimiter,
  type InMemoryRateLimiterOptions,
} from '../adapters/in-memory.js';
