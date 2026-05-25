/**
 * `AccountState` + `ClinicalRecordsState` discriminated unions —
 * D137 + 2026 enterprise canon (Stripe / Plaid / Notion / Calm /
 * Talkspace post-settlement).
 *
 * Two separate lifecycles modelled here:
 *
 *   1. **`AccountState`** — the user-account lifecycle. Four
 *      branches: `active`, `hibernating`, `pending_deletion`,
 *      `deleted`. The `pending_deletion` branch is the
 *      Stripe/Plaid/Calm/Notion-canonical 30-day grace period
 *      between a delete request and the actual data-purge cascade.
 *      During grace, the user can revoke the request; expiry
 *      triggers the async erasure side-effects per the
 *      vendor-erasure-matrix runbook.
 *   2. **`ClinicalRecordsState`** — the clinical-records lifecycle,
 *      independent from the account state. Under HIPAA §164.530(j),
 *      clinical records have a 6-year retention regardless of
 *      account-deletion status. The four states (`active`,
 *      `access_restricted`, `retained_for_6_years`, `purged`) let
 *      compliance + audit query "which accounts have retained
 *      clinical data" without post-hoc reason inference (Talkspace
 *      post-settlement separation pattern).
 *
 * Scaffold-only at present. Today's wiring:
 *
 *   - The discriminators are consumed by the analytics call site +
 *     the future portal delete-flow UI. No live transition handlers
 *     exist yet — the deletion-flow milestone fills them.
 *   - No DynamoDB tables exist yet for either state. The deletion-
 *     flow milestone provisions both tables (via the
 *     `quilty-aws/website-baseline/` Terraform layer) + activates
 *     the transition handlers (login-block on pending_deletion,
 *     TTL job to flip pending_deletion → deleted at expires_at,
 *     etc.).
 *   - The contract test asserts the `taking_break` → hibernating
 *     mapping convention + the `medical_records_retain` →
 *     `retained_for_6_years` clinical-state mapping at the
 *     analytics-event-emission site.
 *
 * Discriminator: `kind`. Each branch carries the timestamps that
 * are load-bearing for the state transition (HIPAA audit log +
 * GDPR Article 30 records-of-processing).
 *
 * Date format: ISO 8601 strings (UTC, the `Z` suffix is mandatory).
 * Match the analytics event convention — no `Date` objects on the
 * wire so the sanitizer + cross-runtime serialization stays
 * trivial. `new Date().toISOString()` produces UTC by ECMA-262
 * spec; the default `now` parameter relies on that guarantee.
 *
 * Grace period: 30 days. Stripe + Plaid + Calm + Notion converged
 * on this floor. The constant is exported so the deletion-flow
 * milestone consumes the same number rather than re-litigating it.
 */

import type { AccountDeleteReason } from './account-delete-reason';

const GRACE_PERIOD_DAYS = 30;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/**
 * 30-day grace period in milliseconds. Exported so consumers
 * (deletion-flow UI, TTL job, audit reports) reference the same
 * floor without re-deriving it.
 */
export const ACCOUNT_DELETION_GRACE_PERIOD_MS = GRACE_PERIOD_MS;

export type AccountState =
  | { readonly kind: 'active' }
  | {
      readonly kind: 'hibernating';
      /**
       * Timestamp when the user requested hibernation (`taking_break`
       * reason). Surfaces in the future portal "you can wake your
       * account up anytime" copy + the GDPR Article 30 RoP.
       */
      readonly hibernated_at: string;
    }
  | {
      readonly kind: 'pending_deletion';
      /**
       * Timestamp the user submitted the delete request. The grace
       * window starts here; the user can revoke until `expires_at`.
       */
      readonly deletion_requested_at: string;
      /**
       * Timestamp at which the async erasure cascade fires (30 days
       * after `deletion_requested_at`). The TTL job at the deletion-
       * flow milestone consumes this value to drive the transition
       * to `kind: 'deleted'`.
       */
      readonly expires_at: string;
      readonly reason: AccountDeleteReason;
    }
  | {
      readonly kind: 'deleted';
      /**
       * Timestamp when the deletion completed at the BFF. The actual
       * data-erasure cascade (DynamoDB + S3 + Sentry user-record purge)
       * fires asynchronously per the vendor-erasure-matrix runbook;
       * `deleted_at` is the BFF-acknowledgement timestamp, not the
       * fully-purged moment.
       */
      readonly deleted_at: string;
      readonly reason: AccountDeleteReason;
    };

/**
 * Clinical-records lifecycle, independent from `AccountState`. A
 * `deleted` account does NOT imply `purged` clinical records —
 * HIPAA §164.530(j) mandates 6-year retention for clinical data
 * regardless of account-deletion status.
 *
 * The four states:
 *
 *   - `active` — records readable by the user + provider.
 *   - `access_restricted` — user-view suspended (hibernation),
 *     records preserved for provider access.
 *   - `retained_for_6_years` — account deleted, records held for
 *     the §164.530(j) retention floor.
 *   - `purged` — retention floor reached + records erased. The
 *     transition is gated on a TTL job that respects the per-
 *     record retention timeline (records can have different
 *     timestamps; the purge fires per-record, not per-account).
 */
export type ClinicalRecordsState =
  | 'active'
  | 'access_restricted'
  | 'retained_for_6_years'
  | 'purged';

/**
 * Tuple returned by `deriveStatesFromReason` — both the account
 * lifecycle state AND the clinical-records state, derived from the
 * same delete-reason input. The deletion-flow milestone consumes
 * the tuple to write the two state records in lockstep.
 *
 * Why a tuple over a single combined type: the two lifecycles can
 * diverge after the initial derivation (e.g., the user revokes
 * pending deletion → `account_state` flips back to `active` while
 * `clinical_records_state` stays unchanged). Separate types let
 * each lifecycle evolve independently.
 */
export interface AccountStateTuple {
  readonly accountState: Exclude<AccountState, { readonly kind: 'active' }>;
  readonly clinicalState: Exclude<ClinicalRecordsState, 'active' | 'purged'>;
}

/**
 * Decision helper — given a delete reason, return both the
 * post-transition `AccountState` AND the `ClinicalRecordsState`
 * the call site MUST construct. Pure function; the actual state-
 * persistence side-effects are the call site's responsibility.
 *
 * Mapping:
 *
 *   - `taking_break` → `accountState: hibernating` +
 *     `clinicalState: access_restricted` (Talkspace 2024 canon).
 *   - All other reasons → `accountState: pending_deletion` +
 *     `clinicalState: retained_for_6_years` (HIPAA §164.530(j)
 *     mandates retention regardless of the chosen reason — even
 *     `privacy` / GDPR-erasure requests are subject to the
 *     HIPAA-aligned retention floor for clinical data; the
 *     reconciliation runbook handles the GDPR-vs-HIPAA conflict
 *     at the manual-action layer).
 *
 * Return type is narrowed to exclude `'active'` accountState +
 * `'active' | 'purged'` clinicalState: the function never produces
 * those branches (active = pre-delete; purged = post-retention-
 * timer-expiry, a separate transition).
 */
export function deriveStatesFromReason(
  reason: AccountDeleteReason,
  now: () => string = (): string => new Date().toISOString(),
): AccountStateTuple {
  const ts = now();
  // Guard against an injected `now` returning a malformed string. The
  // default implementation always returns a valid ISO 8601 UTC string
  // (ECMA-262 spec for `Date.prototype.toISOString`), but a test or
  // custom-clock caller could pass `() => 'yesterday'`. Without this
  // guard, the `Date.parse(ts) + GRACE_PERIOD_MS` math below produces
  // NaN, then `new Date(NaN).toISOString()` throws RangeError — a
  // silent contract-violation rather than a controlled failure.
  if (Number.isNaN(Date.parse(ts))) {
    throw new TypeError(
      `deriveStatesFromReason: 'now' returned a value that is not a valid ISO 8601 timestamp: ${JSON.stringify(ts)}`,
    );
  }
  if (reason === 'taking_break') {
    return {
      accountState: { kind: 'hibernating', hibernated_at: ts },
      clinicalState: 'access_restricted',
    };
  }
  const expiresAt = new Date(Date.parse(ts) + GRACE_PERIOD_MS).toISOString();
  return {
    accountState: {
      kind: 'pending_deletion',
      deletion_requested_at: ts,
      expires_at: expiresAt,
      reason,
    },
    clinicalState: 'retained_for_6_years',
  };
}

/**
 * Legacy single-state helper. Retained for callers that only need
 * the `AccountState` half of the tuple (e.g., analytics event
 * emission carrying the account-side discriminator). Internally
 * delegates to `deriveStatesFromReason`; the function's return
 * type matches the tuple's `accountState` field.
 *
 * NEW consumers should call `deriveStatesFromReason` directly to
 * get both lifecycles in one call.
 */
export function deriveAccountStateFromReason(
  reason: AccountDeleteReason,
  now: () => string = (): string => new Date().toISOString(),
): Exclude<AccountState, { readonly kind: 'active' }> {
  return deriveStatesFromReason(reason, now).accountState;
}
