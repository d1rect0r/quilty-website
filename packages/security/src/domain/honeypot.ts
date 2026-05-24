/**
 * Bot-defense honeypot field (D113). Forms render a visually hidden
 * input with a benign-looking field name (`fax_number`, `extension`,
 * `middle_initial`, `prefix`). Real users never fill it; automated
 * form-fillers and password-manager autofill plugins fill anything
 * with a plausible field name.
 *
 * Submissions where the honeypot is non-empty are rejected at the
 * Server Action level. The call site reads the value from FormData
 * via the per-render field name and calls verifyHoneypot; this
 * function returns Ok when empty, Err when filled.
 *
 * Why a rotation pool: pinning a single field name (`company`) lets
 * a sophisticated bot maintainer pattern-match the field and skip
 * filling it. Rotating across plausible names raises the cost of
 * specialized targeting; the names chosen are all autocomplete-safe
 * (password managers will not auto-fill `fax_number` from a saved
 * profile because it is not in any browser's autofill dictionary).
 *
 * Render guidance (consumed by the contact form):
 *   - `aria-hidden="true"` + `tabindex="-1"` so screen readers +
 *     keyboard navigation skip the field.
 *   - `autocomplete="nope"` + `data-lpignore="true"` + `data-1p-ignore`
 *     so password managers do not autofill into the trap.
 *   - CSS class uses the offscreen pattern (absolute left:-9999px
 *     w:1px h:1px overflow:hidden) rather than display:none so most
 *     bots still find the field by DOM walk.
 */

import type { HoneypotError, Result } from '../errors';

/**
 * Pool of plausible-but-unautofilled field names. None appear in the
 * WHATWG autocomplete attribute table; password managers correctly
 * skip them.
 */
const HONEYPOT_FIELD_NAMES: readonly string[] = [
  'fax_number',
  'extension',
  'prefix',
  'middle_initial',
  'address_line_3',
];

export interface HoneypotField {
  readonly name: string;
  readonly autocompleteHint: string;
}

/**
 * Mint a fresh honeypot field descriptor. The name is rotated per
 * call so a single page-load reload changes the field; per-render
 * rotation is the goal, not per-request entropy.
 */
export function makeHoneypotField(): HoneypotField {
  const idx = Math.floor(Math.random() * HONEYPOT_FIELD_NAMES.length);
  const name = HONEYPOT_FIELD_NAMES[idx] ?? 'fax_number';
  return {
    name,
    autocompleteHint: 'nope',
  };
}

/**
 * Honeypot verification. The contract: a real submission has the
 * honeypot input empty (the user didn't fill it). A non-empty value
 * is a bot signature; the call site emits `honeypot_filled` and
 * silently returns a 2xx success to avoid feeding the bot maintainer
 * information about which fields are honeypots.
 */
export function verifyHoneypot(input: {
  fieldName: string;
  value: string;
}): Result<true, HoneypotError> {
  if (input.value !== '') {
    return {
      ok: false,
      error: { kind: 'honeypot_filled', fieldName: input.fieldName },
    };
  }
  return { ok: true, value: true };
}
