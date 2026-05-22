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

import type { TaxonomyVersion } from './domain/cookie-taxonomy';

/**
 * Snapshot of the user's consent state at the moment an analytics call
 * fires. Shape matches the D87 ConsentState contract — 5 categories
 * (essential / functional / analytics / marketing / personalization) +
 * the GPC bookkeeping + the taxonomy version stamp.
 *
 * `gpc_detected` is the RAW per-request signal (was the inbound header
 * `Sec-GPC: 1` on THIS request?). `gpc_honored` is the PERSISTED state
 * flag (was the consent record written under a GPC override? D100). The
 * two diverge intentionally: a session can start with `gpc_honored:
 * true` from an earlier GPC-detected visit and then arrive on a request
 * where the header is absent — the persisted opt-out must still hold.
 *
 * `version` carries the taxonomy version so the read path can branch
 * on grandfathering rules (D98). `updated_at` is the ISO 8601 timestamp
 * of the last write — used to drive re-consent at the 180-day mark.
 */
export interface ConsentSnapshot {
  readonly essential: true;
  readonly functional: boolean;
  readonly analytics: boolean;
  readonly marketing: boolean;
  readonly personalization: boolean;
  readonly gpc_detected: boolean;
  readonly gpc_honored: boolean;
  readonly version: TaxonomyVersion;
  readonly updated_at: string | null;
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
