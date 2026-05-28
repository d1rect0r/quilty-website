/**
 * `AccountDeleteReason` enum (D82 / D137).
 *
 * Discriminated reason set for the `account_deleted` analytics event. A
 * free-form `reason: string` was rejected by the Cerebral-lesson review:
 * a user could smuggle clinical text ("relapsed after my doctor changed
 * my prescription") into a generic field. Callers must pre-classify
 * server-side before emitting the event; new enum values are added here
 * and consumers see compile-time errors for any non-listed reason.
 *
 * 9-value canonical set. Reflects D137 + the consumer vaping cessation
 * enterprise canon (Pivot Breathe / Pelago / EX Program retention
 * patterns + Cerebral / Monument / BetterHelp / GoodRx FTC enforcement
 * anchors):
 *
 *   - `too_expensive` / `not_helpful` / `switched_provider` —
 *     conventional churn discriminators.
 *   - `privacy` — GDPR Article 17 erasure-request signal.
 *   - `taking_break` — hibernation precedent (cessation peers ship a
 *     hibernation path so a relapse + re-engagement cycle does not
 *     destroy quit-streak history). The call site MUST route this
 *     reason to the `AccountState` -> `hibernating` transition (see
 *     `./account-state.ts`), NOT to a destructive delete. The wiring is
 *     scaffold-only today (no live UI surface); the discriminator
 *     preserves the analytics event-stream classification.
 *   - `missing_features` — product-signal discriminator for the
 *     growth surface (read-only on the analytics side).
 *   - `medical_records_retain` — HIPAA-aligned acknowledgement that
 *     even on full account deletion, clinical records remain under
 *     §164.530(j) 6-year retention. Surfacing this as a distinct
 *     reason gives users an explicit "I understand the retention"
 *     signal + lets the call site display the §164.530(j) notice
 *     in the delete-confirmation UI.
 *   - `other_specified` — free-text REQUIRED at the call site
 *     (paired with a `details: string` field that the sanitizer
 *     chokepoint scrubs before reaching the analytics adapter).
 *   - `other_not_specified` — catch-all when the user declines to
 *     classify (renamed from `unspecified` per D137 for clarity
 *     against `other_specified`).
 *
 * Adding a new value: update this union + the readonly array below +
 * extend `ACCOUNT_DELETE_REASONS` ordering (the array order is
 * load-bearing for analytics-platform schema migrations — append,
 * don't reorder).
 */
export type AccountDeleteReason =
  | 'too_expensive'
  | 'not_helpful'
  | 'privacy'
  | 'switched_provider'
  | 'taking_break'
  | 'missing_features'
  | 'medical_records_retain'
  | 'other_specified'
  | 'other_not_specified';

export const ACCOUNT_DELETE_REASONS: readonly AccountDeleteReason[] = [
  'too_expensive',
  'not_helpful',
  'privacy',
  'switched_provider',
  'taking_break',
  'missing_features',
  'medical_records_retain',
  'other_specified',
  'other_not_specified',
] as const;
