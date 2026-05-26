/**
 * ConsentSnapshotFactory — fixture for the @quilty/consent
 * ConsentSnapshot port type. Useful for tests that need a specific
 * consent state (denial, granted, GPC-detected) without manually
 * constructing the 9-field object every time.
 *
 * Invariants enforced (matches the production ConsentReader behavior):
 *   - `essential` is ALWAYS `true` (never opt-out-able).
 *   - When `gpc_detected: true`, `analytics` + `marketing` are
 *     auto-forced to `false` (CCPA §7025(c)(2) — GPC overrides any
 *     stored opt-in for sale/sharing-aligned categories).
 *
 * Defaults to the default-deny posture (everything `false` except
 * `essential`). Callers override via the standard fishery `.build({})`
 * partial.
 */

import { Factory } from 'fishery';
import { faker } from '../faker';

export interface ConsentSnapshotFixture {
  readonly essential: true;
  readonly functional: boolean;
  readonly analytics: boolean;
  readonly marketing: boolean;
  readonly personalization: boolean;
  readonly gpc_detected: boolean;
  readonly gpc_honored: boolean;
  readonly version: 'v1';
  readonly updated_at: string | null;
}

export const ConsentSnapshotFactory = Factory.define<ConsentSnapshotFixture>(({ afterBuild }) => {
  // GPC invariant enforced post-merge: detected GPC forces analytics +
  // marketing off regardless of caller overrides (matches production
  // ConsentReader semantics — CCPA §7025(c)(2)). Fishery merges
  // `.build({...})` overrides on top of this generator's return value,
  // so the invariant runs in `afterBuild` AFTER the merge to remain
  // load-bearing.
  afterBuild((snapshot) => {
    if (snapshot.gpc_detected) {
      (snapshot as { analytics: boolean }).analytics = false;
      (snapshot as { marketing: boolean }).marketing = false;
    }
    // essential is structurally `true` per the type; the field is
    // re-asserted as a defense against a future maintainer relaxing
    // the type.
    (snapshot as { essential: true }).essential = true;
  });

  return {
    essential: true,
    functional: false,
    analytics: false,
    marketing: false,
    personalization: false,
    gpc_detected: false,
    gpc_honored: false,
    version: 'v1',
    updated_at: faker.date.recent({ days: 30 }).toISOString(),
  };
});
