/**
 * `AccountDeleteReason` enum (D82 / D137).
 *
 * Discriminated reason set for the `account_deleted` analytics event. A
 * free-form `reason: string` was rejected by the Cerebral-lesson review:
 * a user could smuggle clinical text ("stopped because my therapist
 * changed my medication") into a generic field. Callers must
 * pre-classify server-side before emitting the event; new enum values
 * are added here and consumers see compile-time errors for any
 * non-listed reason.
 *
 * Current set (6 values inherited from the legacy analytics adapter).
 * The D137 expansion to 8 values (`taking_break`, `missing_features`,
 * rename `unspecified` → `other_not_specified`) lands in a subsequent
 * commit so this extraction stays atomic — see D137 in the strategy
 * doc decisions log for the trigger.
 */
export type AccountDeleteReason =
  | 'too_expensive'
  | 'not_helpful'
  | 'privacy'
  | 'switched_provider'
  | 'other_specified'
  | 'unspecified';

export const ACCOUNT_DELETE_REASONS: readonly AccountDeleteReason[] = [
  'too_expensive',
  'not_helpful',
  'privacy',
  'switched_provider',
  'other_specified',
  'unspecified',
] as const;
