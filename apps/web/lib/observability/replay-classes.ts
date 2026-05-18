/**
 * Replay masking CSS-class constants (D68). Exported so every component
 * that renders a clinical-state-implying control imports the appropriate
 * class — never hand-types the string. Keeps the masking surface auditable.
 *
 * Per D68 + the "Exclude beats Mask" lesson from FullStory docs: any
 * element capturing, displaying, or implying clinical state uses the
 * `block` class (full replacement with rectangle) not the `mask` class
 * (text-only redaction with interaction data still captured).
 *
 * Sentry + PostHog have different masking-class conventions; this module
 * exports both so a component can compose them when needed.
 */

// Sentry Replay: `sentry-block` = empty placeholder (no shape, no interaction).
//                `sentry-mask` = text replaced with asterisks (shape preserved).
//                `sentry-ignore` = form input events excluded entirely.
export const SENTRY_BLOCK = 'sentry-block';
export const SENTRY_MASK = 'sentry-mask';
export const SENTRY_IGNORE = 'sentry-ignore';

// PostHog Replay: `.ph-no-capture` masks; `data-ph-no-capture` attribute also works.
export const POSTHOG_NO_CAPTURE = 'ph-no-capture';

/**
 * Compose mask + block classes for an element. Use this on every clinical-
 * state-implying control (mood pickers, symptom checkers, condition
 * checkboxes, free-text reflection inputs).
 */
export const CLINICAL_PROTECTED_CLASSES = `${SENTRY_BLOCK} ${POSTHOG_NO_CAPTURE}`;
