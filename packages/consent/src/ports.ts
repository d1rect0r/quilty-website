/**
 * @quilty/consent ports.
 *
 * The ConsentReader port is owned by this package (the consent-domain
 * provider) following "port-owned-by-provider" — the package that
 * implements multiple variants of the port owns its contract. Consumers
 * (e.g., @quilty/observability's wrapAnalytics) depend on this package
 * for the type.
 *
 * Prior architecture had the port owned by @quilty/observability (the
 * consumer); that "consumer-driven contract" shape inverted the natural
 * dependency arrow + required the consent package to depend on
 * observability for its own port contract. The flip eliminates the
 * inversion + breaks the consent → observability dependency edge.
 */

/**
 * Snapshot of the user's consent state at the moment an analytics call
 * fires. The shape is intentionally minimal — extensions (per-vendor
 * grants, granular sub-categories) land at the consent-banner
 * activation as a discriminated extension of this base type.
 */
export interface ConsentSnapshot {
  readonly analytics: boolean;
  readonly marketing: boolean;
  readonly preferences: boolean;
  readonly gpc_detected: boolean;
}

/**
 * Minimal consent gate primitive. The wrapper that consumes this port
 * (e.g., @quilty/observability's wrapAnalytics) invokes `read()` at
 * each track call to honor per-request consent semantics — cookies +
 * GPC header can change between requests.
 *
 * Fail-closed: a thrown read or a rejected Promise must result in the
 * wrapper denying the event. `makeDefaultDenyConsentReader()` is the
 * production baseline.
 */
export interface ConsentReader {
  readonly read: () => ConsentSnapshot | Promise<ConsentSnapshot>;
}
