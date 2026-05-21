/**
 * Rate-limit package ports.
 *
 * Single hexagonal port: `RateLimiter.consume(key, policy) → Promise<RateLimitDecision>`.
 * The limiter is called from the BFF before any auth-adjacent or
 * abuse-prone path (login attempt, password reset request, signup,
 * contact form, account-delete confirmation).
 *
 * Counting strategy: sliding-window log. Each consume call appends a
 * timestamp to the per-key window; the window is pruned to entries
 * within `[now - windowMs, now]` before counting. This is more
 * accurate than fixed-window counters near the boundary (no traffic-
 * doubling at window-flip) and simpler than token-bucket for the
 * burst patterns of auth-adjacent endpoints. The in-memory adapter
 * implements the window directly; the DynamoDB adapter at activation
 * uses conditional writes against a TTL'd item per key.
 *
 * Naming discipline (META-1): the port + types carry no vendor names.
 * "DynamoDB" appears only inside `adapters/dynamodb.ts`.
 */

/**
 * Sliding-window rate-limit policy. `limit` is the maximum number of
 * consume calls allowed within `windowMs` for a given key.
 */
export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * Decision returned by `consume()`. `allowed: false` is the throttled
 * branch; `retryAfterMs` is the wall-clock delay before the next
 * attempt would succeed (caller surfaces this in a `Retry-After`
 * header).
 */
export type RateLimitDecision =
  | { readonly allowed: true; readonly remaining: number; readonly resetAtMs: number }
  | {
      readonly allowed: false;
      readonly remaining: 0;
      readonly resetAtMs: number;
      readonly retryAfterMs: number;
    };

/**
 * RateLimiter port. `key` is a caller-composed identifier — typically
 * `${action}:${remoteIp}` or `${action}:${user_id_hash}`. The limiter
 * does not classify the key; the call site composes it from values
 * the limiter MUST NOT see directly (raw IPs are fine; PHI must not
 * be embedded in the key per D67).
 */
export interface RateLimiter {
  readonly consume: (key: string, policy: RateLimitPolicy) => Promise<RateLimitDecision>;
}
