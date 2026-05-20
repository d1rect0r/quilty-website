/**
 * Form-submission time-trap (D113). Forms record a server-issued timestamp
 * on render; on submit, the server rejects submissions that arrived
 * implausibly fast (typically < 2 seconds — humans cannot fill a form
 * faster than that). Combines with the honeypot for layered bot defense.
 *
 * Stub at the package-extraction commit; the forms-canonical commit fills
 * in the bodies and ships the canonical 2-second floor.
 */

import type { Result, TimeTrapError } from '../errors.js';

const NOT_IMPLEMENTED = new Error(
  'Not implemented — see D113 in the architecture strategy document.',
);

export interface TimeTrapVerifyInput {
  /** Timestamp the form was rendered (ms since epoch). */
  readonly renderedAtMs: number;
  /** Timestamp the form was submitted (ms since epoch). */
  readonly submittedAtMs: number;
  /** Minimum elapsed time (ms) considered plausible. Default 2000 ms. */
  readonly minimumMs?: number;
}

export function makeRenderTimestamp(): string {
  throw NOT_IMPLEMENTED;
}

export function verifyTimeTrap(_input: TimeTrapVerifyInput): Result<true, TimeTrapError> {
  throw NOT_IMPLEMENTED;
}
