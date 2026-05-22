/**
 * Consent-state merge rules for `ConsentStore.migrate(from, to)`.
 *
 * The merge composes two `ConsentSnapshot` records into the canonical
 * post-migration state. Rules per D87 + D100 + CCPA §7025(c)(2):
 *
 *   1. **GPC honored always wins.** If EITHER side carries
 *      `gpc_honored: true`, the merged record forces
 *      `analytics / marketing / personalization` to `false` and stamps
 *      `gpc_honored: true`. CCPA §7025(c)(2) requires the opt-out to
 *      survive cross-device migration — the Disney $2.75M Feb 2026
 *      enforcement turned on exactly this loss-of-opt-out vector.
 *
 *   2. **Explicit grant beats default-deny.** When neither side has
 *      GPC honored, each category resolves to `from OR to` — an
 *      explicit user grant from either record propagates. The cookie
 *      tier carries the user's most recent explicit choice; the user
 *      tier may be default-deny on a fresh-device sign-in.
 *
 *   3. **Most recent `updated_at` wins on the `updated_at` field
 *      itself.** When both sides have timestamps, the merged record
 *      carries the later one; a `null` loses to a real timestamp.
 *
 *   4. **`essential` is always `true`** by the type contract.
 *
 *   5. **`version` follows the destination snapshot's version**,
 *      falling back to the source if the destination has none. The
 *      next read-path on the merged record will re-stamp the version
 *      to whatever the current `TAXONOMY_VERSION` is.
 *
 * The merge is pure + deterministic — same inputs always produce the
 * same output. It does NOT touch the persistence layer; adapters call
 * this helper from inside their `migrate()` implementation.
 */

import type { ConsentSnapshot } from '../ports';

export function mergeConsentSnapshots(from: ConsentSnapshot, to: ConsentSnapshot): ConsentSnapshot {
  const gpcHonored = from.gpc_honored || to.gpc_honored;

  // Rule 1: GPC honored forces sale/share categories off regardless
  // of any explicit grant on either side.
  const analytics = gpcHonored ? false : from.analytics || to.analytics;
  const marketing = gpcHonored ? false : from.marketing || to.marketing;
  const personalization = gpcHonored ? false : from.personalization || to.personalization;
  // Functional + essential do not involve sale/share — they survive
  // GPC. Functional resolves via OR like the other categories so an
  // explicit grant on either side propagates.
  const functional = from.functional || to.functional;

  return {
    essential: true,
    functional,
    analytics,
    marketing,
    personalization,
    // `gpc_detected` is the live per-request header signal — by the
    // time this merged snapshot is consumed, the live signal must be
    // re-read from the current request headers. Stamping `false` on
    // the merged record prevents downstream consumers from acting on
    // a stale source-request value as if it were current.
    gpc_detected: false,
    gpc_honored: gpcHonored,
    // `version` follows the destination — both snapshots' `version`
    // is the `TaxonomyVersion` literal by type contract, so the
    // destination's value is always present.
    version: to.version,
    updated_at: pickLaterTimestamp(from.updated_at, to.updated_at),
  };
}

function pickLaterTimestamp(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}
