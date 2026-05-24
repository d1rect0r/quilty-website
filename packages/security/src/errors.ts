/**
 * Typed error unions for the security package.
 *
 * Each port that can fail returns a Result envelope whose error branch is one
 * of these discriminated-union members. Consumers narrow by `kind` and let
 * the type system enumerate every failure path; bare `throw new Error(...)`
 * is avoided so error semantics are part of the API contract.
 */

export type RedirectValidatorError =
  | { readonly kind: 'invalid_url'; readonly reason: string }
  | { readonly kind: 'origin_not_allowlisted'; readonly origin: string }
  | { readonly kind: 'scheme_not_allowed'; readonly scheme: string };

export type CsrfError =
  | { readonly kind: 'origin_mismatch'; readonly expected: string; readonly received: string }
  | { readonly kind: 'token_missing' }
  | { readonly kind: 'token_invalid'; readonly reason: string }
  | { readonly kind: 'header_missing' };

export interface HoneypotError {
  readonly kind: 'honeypot_filled';
  readonly fieldName: string;
}

/**
 * Time-trap discriminator. Three failure modes — too fast (bot
 * signature), too slow (stale render — likely a forgotten tab), and
 * malformed token. The split lets call sites surface distinct UX
 * (silently 200-OK to bots vs "form expired, reload" to humans)
 * without re-deriving thresholds from a single discriminator.
 */
export type TimeTrapError =
  | {
      readonly kind: 'time_too_fast';
      readonly elapsedMs: number;
      readonly minimumMs: number;
    }
  | {
      readonly kind: 'time_too_slow';
      readonly elapsedMs: number;
      readonly maximumMs: number;
    }
  | {
      readonly kind: 'malformed_token';
    };

/**
 * Standard Result envelope. Every port operation that can fail returns a
 * Result so callers get exhaustive type-narrowing without try/catch.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
