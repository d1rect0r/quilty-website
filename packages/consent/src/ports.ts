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

/**
 * Identity of a consent record per D87.
 *
 * Anonymous users are identified by `cookie_id` — at the scaffold
 * stage the only stable cookie-side identifier is the value of the
 * persisted consent cookie itself (`__Host-quilty_consent`); when the
 * session cookie ships (`__Host-quilty_sid`) at the auth-integration
 * milestone, the session cookie value replaces it as the canonical
 * `cookie_id`. The transition is a single-site change in
 * `proxy.ts` + the auth-callback Route Handler — no port API change.
 *
 * Signed-in users are identified by `user_id_hash` — the HASHED form
 * of the Rust-backend-issued `quilty_sub` (D11 + D67 PHI-sanitizer
 * chokepoint discipline: NEVER store the raw `quilty_sub` in any
 * persisted consent record; the hash is the only identifier that
 * crosses the consent boundary).
 *
 * Discriminated union so callers narrow on `type`. Adapters key off
 * the canonical serialization of this value (`<type>:<value>`).
 */
export type ConsentIdentifier =
  | { readonly type: 'cookie'; readonly cookie_id: string }
  | { readonly type: 'user'; readonly user_id_hash: string };

/**
 * Persistence port for consent records (D87). The cookie tier holds
 * the anonymous state; the user tier holds the signed-in state. The
 * `migrate(from, to)` method runs on the auth callback to carry the
 * pre-sign-in consent choice into the user record so a fresh device
 * sign-in inherits the cookie-side preference (Disney $2.75M Feb 2026
 * enforcement precedent: cross-device GPC opt-out must follow the
 * user, not just the device).
 *
 * The in-memory adapter is the production wiring at scaffold; the
 * DynamoDB adapter lands when the two-table layout (D63 consent-current
 * + consent-audit) ships in `quilty-aws/website-baseline/`.
 *
 * Fail-closed semantics: a thrown read returns `null`; a thrown write
 * propagates so the caller surfaces the failure (cookie write +
 * migrate-on-sign-in both have user-visible failure modes).
 */
export interface ConsentStore {
  readonly get: (id: ConsentIdentifier) => Promise<ConsentSnapshot | null>;
  readonly set: (id: ConsentIdentifier, state: ConsentSnapshot) => Promise<void>;
  readonly delete: (id: ConsentIdentifier) => Promise<void>;
  /**
   * Carry the consent record from `from` to `to`. Used on sign-in to
   * promote the anonymous cookie-tier record to the signed-in user
   * record. Merge rules live in `@quilty/consent/domain/migrate.ts`
   * (GPC honored always wins; explicit grant beats default-deny;
   * most-recent updated_at wins on ties).
   */
  readonly migrate: (from: ConsentIdentifier, to: ConsentIdentifier) => Promise<void>;
}
