/**
 * Bot-defense honeypot field (D113). Forms render a visually hidden form
 * field with a benign name (e.g. `company`, `website`); real users do not
 * fill it, automated form-fillers do. Submissions where the honeypot is
 * non-empty are rejected silently (returned as a success to discourage
 * bot retraining).
 *
 * Stub at the package-extraction commit; the forms-canonical commit fills
 * in the bodies + wires verification into the contact form Server Action.
 */

import type { HoneypotError, Result } from '../errors.js';

const NOT_IMPLEMENTED = new Error(
  'Not implemented — see D113 in the architecture strategy document.',
);

export interface HoneypotField {
  readonly name: string;
  readonly autocompleteHint: string;
}

export function makeHoneypotField(): HoneypotField {
  throw NOT_IMPLEMENTED;
}

export function verifyHoneypot(_input: {
  fieldName: string;
  value: string;
}): Result<true, HoneypotError> {
  throw NOT_IMPLEMENTED;
}
