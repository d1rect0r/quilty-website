/**
 * Replay masking CSS-class constants (D68). Components that render a
 * clinical-state-implying control import the appropriate class — never
 * hand-type the string. Keeps the masking surface auditable.
 *
 * Per D68 + the "Exclude beats Mask" lesson: any element capturing,
 * displaying, or implying clinical state uses the **block** class (full
 * replacement with rectangle) not the **mask** class (text-only redaction
 * with interaction data still captured).
 *
 * Vendor matrix per the locked decision (D42b revision):
 *   - Sentry Replay is the only permitted replay vendor.
 *   - Amplitude Session Replay is rejected outright (HTML-attribute
 *     leak on `alt`/`title`/`placeholder`/`aria-label`/`value`/`data-*`
 *     is structurally unsafe on a clinical surface even with
 *     Enterprise BAA).
 *   - These constants are scoped to Sentry's masking conventions. If
 *     a future locked decision adopts a second replay vendor, add its
 *     masking class constant here alongside the Sentry ones.
 */

/** Empty placeholder; no shape, no interaction event captured. */
export const REPLAY_BLOCK_CLASS = 'sentry-block';

/** Text replaced with asterisks; element shape preserved. */
export const REPLAY_MASK_CLASS = 'sentry-mask';

/** Form input events excluded entirely. */
export const REPLAY_IGNORE_CLASS = 'sentry-ignore';

/**
 * Compose for every clinical-state-implying control (mood pickers,
 * symptom checkers, condition checkboxes, free-text reflection inputs).
 */
export const CLINICAL_PROTECTED_CLASSES = REPLAY_BLOCK_CLASS;
