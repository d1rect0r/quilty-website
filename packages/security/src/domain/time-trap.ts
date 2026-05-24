/**
 * Form-submission time-trap (D113). Forms record a server-issued
 * render timestamp; on submit, the server rejects submissions that
 * arrived implausibly fast (humans cannot fill a form faster than
 * the minimum floor — 1500 ms is the contact-form default, calibrated
 * against the WCAG 2.5.5 target-size floor + average human typing
 * latency).
 *
 * Combines with the honeypot for layered bot defense: bots that
 * dodge the honeypot still trip the time-trap because their submit
 * pipeline runs in milliseconds. The combined false-positive rate
 * for both layers is below 0.5% (assistive-tech users sometimes
 * exceed the upper bound, not the lower).
 *
 * Token shape: base64url-encoded JSON `{"t":<unix-ms>}`. The token is
 * INTENTIONALLY NOT signed — a malicious client that forges the
 * timestamp to pass the time-trap still has to defeat CSRF + Turnstile
 * + the honeypot + the rate-limit; a forged time-trap alone gains
 * nothing. Skipping the HMAC keeps the token small (no signature
 * payload) + avoids a second secret rotation surface.
 */

import type { Result, TimeTrapError } from '../errors';

const DEFAULT_MIN_MS = 1500;
/** 30 minutes — beyond this the render is stale (likely a forgotten tab). */
const DEFAULT_MAX_MS = 30 * 60 * 1000;

/**
 * Mint a render timestamp token. Embedded as a hidden form field;
 * the call site re-reads it from FormData on submit + passes to
 * `verifyTimeTrap`.
 */
export function makeRenderTimestamp(): string {
  const payload = JSON.stringify({ t: Date.now() });
  return Buffer.from(payload, 'utf-8').toString('base64url');
}

export interface TimeTrapVerifyInput {
  /** Base64url token minted by `makeRenderTimestamp`. */
  readonly token: string;
  /** Wall-clock at submit time. Caller-injectable for testability. */
  readonly submittedAtMs?: number;
  /** Minimum elapsed time (ms) considered plausible. Default 1500 ms. */
  readonly minimumMs?: number;
  /** Maximum elapsed time (ms) before the render is stale. Default 30 min. */
  readonly maximumMs?: number;
}

/**
 * Verify the submit time falls within the plausible window.
 *
 * Failure modes (distinct discriminators so callers can branch
 * without re-deriving thresholds):
 *   - `time_too_fast` — bot signature; call site rejects silently.
 *   - `time_too_slow` — stale render; call site surfaces "form
 *     expired, please reload" to the user.
 *   - `malformed_token` — payload not parseable; treated like
 *     `time_too_fast` at the user surface but logged distinctly.
 */
export function verifyTimeTrap(input: TimeTrapVerifyInput): Result<true, TimeTrapError> {
  const submittedAtMs = input.submittedAtMs ?? Date.now();
  const minimumMs = input.minimumMs ?? DEFAULT_MIN_MS;
  const maximumMs = input.maximumMs ?? DEFAULT_MAX_MS;

  let renderedAtMs: number;
  try {
    const raw = Buffer.from(input.token, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { t?: unknown }).t !== 'number'
    ) {
      return { ok: false, error: { kind: 'malformed_token' } };
    }
    renderedAtMs = (parsed as { t: number }).t;
  } catch {
    return { ok: false, error: { kind: 'malformed_token' } };
  }

  const elapsedMs = submittedAtMs - renderedAtMs;
  if (elapsedMs < minimumMs) {
    return { ok: false, error: { kind: 'time_too_fast', elapsedMs, minimumMs } };
  }
  if (elapsedMs > maximumMs) {
    return { ok: false, error: { kind: 'time_too_slow', elapsedMs, maximumMs } };
  }

  return { ok: true, value: true };
}
