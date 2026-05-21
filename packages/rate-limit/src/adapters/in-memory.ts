/**
 * In-memory RateLimiter — production wiring today + the test fake at
 * every milestone after.
 *
 * Sliding-window log implementation: per-key arrays of timestamps,
 * pruned to the active window on every consume call. The data
 * structure is a Map<string, number[]> at module scope so the
 * counters survive across calls within a single Lambda warm cycle.
 *
 * Cold-start consequence: the limiter resets every Lambda cold start.
 * For auth-adjacent paths this is a safety property — a fresh Lambda
 * means a fresh limit window — not a bug. The DynamoDB adapter at
 * activation lifts the per-Lambda boundary to per-account, which is
 * the correct multi-Lambda concurrency model.
 *
 * Memory bound: each key holds at most `limit` timestamps (older
 * entries are pruned during consume). The Map itself can grow
 * unboundedly if callers compose unique keys (e.g., `action:${ip}`
 * with a long-tail of IPs); a Lambda's long warm cycle is the
 * implicit cleanup. The activation milestone's TTL'd DynamoDB item
 * is the deliberate replacement.
 *
 * Clock source: caller-injectable for testability (`now()`). Defaults
 * to `() => Date.now()`. Tests use a fake clock to advance the window
 * deterministically.
 */

import type { RateLimitDecision, RateLimitPolicy, RateLimiter } from '../ports';

export interface InMemoryRateLimiterOptions {
  /** Clock source. Defaults to `() => Date.now()`. */
  readonly now?: () => number;
}

export interface InMemoryRateLimiter extends RateLimiter {
  readonly reset: () => void;
}

export function makeInMemoryRateLimiter(
  options: InMemoryRateLimiterOptions = {},
): InMemoryRateLimiter {
  const now = options.now ?? ((): number => Date.now());
  const windows = new Map<string, number[]>();

  return {
    reset: (): void => {
      windows.clear();
    },
    consume: (key: string, policy: RateLimitPolicy): Promise<RateLimitDecision> => {
      const currentMs = now();
      const windowStart = currentMs - policy.windowMs;
      const existing = windows.get(key) ?? [];
      // Prune entries older than the active window. The window-log
      // is naturally chronological because we only ever append.
      const pruned = existing.filter((ts) => ts > windowStart);

      if (pruned.length >= policy.limit) {
        // Throttled. The branch invariant is
        // `pruned.length >= policy.limit >= 1`, so `pruned[0]` is
        // always defined. The non-null assertion is preferred over
        // a nullish fallback (`?? currentMs`) so a future refactor
        // that breaks the invariant surfaces as a TypeError rather
        // than silently producing a wrong but non-failing decision.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const oldest = pruned[0]!;
        const resetAtMs = oldest + policy.windowMs;
        const retryAfterMs = Math.max(0, resetAtMs - currentMs);
        windows.set(key, pruned);
        return Promise.resolve({
          allowed: false,
          remaining: 0,
          resetAtMs,
          retryAfterMs,
        });
      }

      pruned.push(currentMs);
      windows.set(key, pruned);
      const remaining = policy.limit - pruned.length;
      // resetAtMs for the allowed branch is the time at which the
      // oldest surviving entry (the just-appended entry if this was
      // the first call) exits the window. We just pushed, so the
      // array has at least one entry — non-null assertion is sound.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const oldest = pruned[0]!;
      const resetAtMs = oldest + policy.windowMs;
      return Promise.resolve({
        allowed: true,
        remaining,
        resetAtMs,
      });
    },
  };
}
