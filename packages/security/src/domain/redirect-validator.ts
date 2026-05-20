/**
 * Open-redirect defense per D92 / OWASP A01 + CWE-601.
 *
 * Validates a raw redirect target (typically from a query parameter like
 * `?next=`, `?to=`, or an OAuth `?state=` extension) against:
 *
 *   1. Parseability — the value must be a valid URL.
 *   2. Scheme allowlist — `https:` only by default; consumers can widen
 *      to `http:` for dev/loopback only.
 *   3. Origin allowlist — the absolute origin (scheme + host + port) must
 *      match one of the consumer-supplied allowlist entries.
 *
 * Path-only targets (e.g. `/account`) are accepted by resolving them
 * against the first allowlist origin — internal redirects are safe by
 * definition since they cannot escape the application's own host.
 *
 * Returns a Result envelope so callers branch on the failure kind without
 * exception handling.
 */

import type { RedirectValidatorError, Result } from '../errors.js';
import type { RedirectValidatorOptions } from '../ports.js';

const DEFAULT_ALLOWED_SCHEMES: readonly string[] = ['https:'];

/**
 * Validates a redirect target. Returns `{ ok: true, value: URL }` on
 * success or `{ ok: false, error: ... }` on rejection.
 */
export function isSafeRedirect(
  raw: string,
  options: RedirectValidatorOptions,
): Result<URL, RedirectValidatorError> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: { kind: 'invalid_url', reason: 'empty input' } };
  }
  if (options.allowlist.length === 0) {
    return {
      ok: false,
      error: { kind: 'invalid_url', reason: 'allowlist must contain at least one origin' },
    };
  }

  const allowedSchemes = options.allowedSchemes ?? DEFAULT_ALLOWED_SCHEMES;
  // Use the first allowlist origin as the base for path-only inputs so an
  // internal redirect like `/account` resolves to a same-origin destination
  // rather than failing parsing.
  const baseOrigin = options.allowlist[0];
  if (baseOrigin === undefined) {
    return {
      ok: false,
      error: { kind: 'invalid_url', reason: 'allowlist must contain at least one origin' },
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed, baseOrigin);
  } catch {
    return { ok: false, error: { kind: 'invalid_url', reason: 'URL parsing failed' } };
  }

  if (!allowedSchemes.includes(url.protocol)) {
    return { ok: false, error: { kind: 'scheme_not_allowed', scheme: url.protocol } };
  }

  if (!options.allowlist.includes(url.origin)) {
    return { ok: false, error: { kind: 'origin_not_allowlisted', origin: url.origin } };
  }

  return { ok: true, value: url };
}
