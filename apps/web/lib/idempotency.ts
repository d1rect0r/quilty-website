/**
 * Idempotency-key store (D113 — 8th piece of the canonical form pattern).
 *
 * Stripe / Discord / Linear convention: clients mint a `crypto.randomUUID()`
 * idempotency key at form mount, send it with every retry, server SET-NX
 * the key with the result. Duplicate submissions (network retry, double-
 * click, page-reload-after-submit) return the cached envelope without
 * re-running the handler. 10-min TTL is the canonical floor — bounded
 * enough to garbage-collect stale entries, long enough to cover retry
 * patterns across an active session.
 *
 * Today's wiring: per-Lambda in-memory Map. The DynamoDB activation
 * (M5+) replaces this with a TTL'd item per key — same shape, same
 * Result envelope contract. The Lambda-warm-cycle scope is acceptable
 * for /contact (single-tier proxy + low traffic).
 *
 * Type design: `IdempotencyResult` is generic over the cached Result
 * shape so the same store serves any Server Action without leaking
 * details. The non-PHI invariant lives at the call site (the cached
 * Result must be a non-PHI envelope per D31 — the sanitizer scrub at
 * EmailSender is the chokepoint that enforces this).
 */

const TTL_MS = 10 * 60 * 1000;

interface IdempotencyEntry<T> {
  readonly value: T;
  readonly expiresAtMs: number;
}

const store = new Map<string, IdempotencyEntry<unknown>>();

/**
 * Attempt to claim a fresh idempotency key. Returns the cached value
 * if the key was already claimed (Stripe pattern). Returns null on
 * fresh claim — the caller runs the handler + calls `storeIdempotent`
 * to record the result.
 *
 * Pruning: each call sweeps expired entries opportunistically. The
 * cost is O(n) on the active key set; for the M1.5 traffic profile
 * this is negligible. Promote to a TTL-indexed structure if hot.
 */
export function claimIdempotent<T>(key: string): T | null {
  const now = Date.now();
  // Opportunistic prune — sweep at most 16 entries per call to bound
  // worst-case latency. Entries that survive the sweep get pruned on
  // a later call or on their own access.
  let sweepCount = 0;
  for (const [k, entry] of store) {
    if (entry.expiresAtMs <= now) {
      store.delete(k);
    }
    if (++sweepCount >= 16) break;
  }
  const existing = store.get(key);
  if (existing && existing.expiresAtMs > now) {
    return existing.value as T;
  }
  return null;
}

/**
 * Store the result for a freshly-claimed idempotency key. Caller
 * convention: invoke after a successful or failed handler run; the
 * cached envelope is whatever the handler returned (success or
 * field-error Result). On a duplicate within the TTL window, the
 * same envelope is returned via `claimIdempotent`.
 */
export function storeIdempotent<T>(key: string, value: T): void {
  store.set(key, {
    value,
    expiresAtMs: Date.now() + TTL_MS,
  });
}

/** Reset the store. Test-only utility. */
export function __resetIdempotencyForTesting(): void {
  store.clear();
}
