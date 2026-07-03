/**
 * CSRF defense — triple-layer per D10 + D53 / OWASP 2026 + BCP draft-26 §6.3.
 *
 *   1. Origin/Referer header check against the expected origin.
 *   2. Signed double-submit token (cookie matches request body or header).
 *   3. Custom `X-Quilty-CSRF` header (preflight-required; cross-origin
 *      browsers cannot set arbitrary headers without CORS preflight).
 *
 * Token shape: `<randomBase64Url(32 bytes)>.<HMAC-SHA-256(token, secret)>`.
 * The HMAC binds the token to the server-held secret; double-submit
 * verification re-derives the HMAC and constant-time compares. The
 * random component prevents per-session token collisions; the HMAC
 * prevents a client from minting valid tokens without the secret.
 *
 * Constant-time comparison: every secret-bearing equality check uses
 * Node's `crypto.timingSafeEqual` to avoid the timing-side-channel
 * Mozilla flagged in their CSRF guide (2025-06).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getCsrfKeys } from './csrf-keys';
import type { CsrfError, Result } from '../errors';

const TOKEN_RANDOM_BYTES = 32;
const TOKEN_PARTS_SEPARATOR = '.';

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Generate a fresh CSRF token. Called once per form render — the same
 * token is written to the cookie AND embedded in the form's hidden
 * input + sent in the `X-Quilty-CSRF` header on submit. Always signs
 * with the CURRENT key (`getCsrfKeys().current`); a missing key throws
 * (fail-closed — see csrf-keys.ts).
 */
export async function generateCsrfToken(): Promise<string> {
  const { current } = await getCsrfKeys();
  const random = randomBytes(TOKEN_RANDOM_BYTES).toString('base64url');
  const sig = sign(random, current);
  return `${random}${TOKEN_PARTS_SEPARATOR}${sig}`;
}

export interface CsrfVerifyInput {
  readonly origin: string | null;
  readonly referer: string | null;
  readonly cookieToken: string | null;
  readonly bodyToken: string | null;
  readonly headerToken: string | null;
  readonly expectedOrigin: string;
}

/**
 * Triple-layer verification. Returns Result so the call site narrows
 * the VERIFICATION error branch exhaustively. One deliberate exception
 * crosses the boundary: the key provider's fail-closed throw when no
 * signing key is available (deployment misconfiguration / secrets
 * outage) — callers must catch that and map it to a retryable 5xx
 * (see the contact route), because "cannot verify" is not a
 * verification outcome.
 *
 * Verification order (fail-fast):
 *   1. Origin OR Referer header matches expectedOrigin. Either is
 *      sufficient — older browsers + Firefox-private send only one.
 *   2. Custom header `X-Quilty-CSRF` is present. The header alone
 *      stops cross-origin forms (browsers preflight any non-simple
 *      header so a malicious form on attacker.com cannot send it).
 *   3. Cookie token + body token + header token all present + equal.
 *   4. Token signature verifies under the CURRENT signing key, then —
 *      dual-key rotation support — under the PREVIOUS key (Secrets
 *      Manager AWSPREVIOUS), so an operator rotation never 403s tokens
 *      minted moments before it. This is the chokepoint that prevents
 *      a forged token (an attacker who could set the cookie via a
 *      same-site oversight could not mint a valid signature).
 */
export async function verifyCsrf(input: CsrfVerifyInput): Promise<Result<true, CsrfError>> {
  const originMatch =
    (input.origin !== null && input.origin === input.expectedOrigin) ||
    (input.referer !== null && input.referer.startsWith(`${input.expectedOrigin}/`));
  if (!originMatch) {
    return {
      ok: false,
      error: {
        kind: 'origin_mismatch',
        expected: input.expectedOrigin,
        received: input.origin ?? input.referer ?? '(none)',
      },
    };
  }

  if (input.headerToken === null || input.headerToken.length === 0) {
    return { ok: false, error: { kind: 'header_missing' } };
  }

  if (
    input.cookieToken === null ||
    input.bodyToken === null ||
    input.cookieToken.length === 0 ||
    input.bodyToken.length === 0
  ) {
    return { ok: false, error: { kind: 'token_missing' } };
  }

  // All three submission surfaces must carry the SAME token. Constant-
  // time comparison defeats the timing-side-channel that a naïve `===`
  // would otherwise leak. Length-mismatch short-circuit is fine because
  // an attacker who knew the token length would still need the secret
  // to forge the signature.
  if (
    input.cookieToken.length !== input.bodyToken.length ||
    input.cookieToken.length !== input.headerToken.length
  ) {
    return { ok: false, error: { kind: 'token_invalid', reason: 'length_mismatch' } };
  }
  const cookieBuf = Buffer.from(input.cookieToken);
  const bodyBuf = Buffer.from(input.bodyToken);
  const headerBuf = Buffer.from(input.headerToken);
  if (!timingSafeEqual(cookieBuf, bodyBuf) || !timingSafeEqual(cookieBuf, headerBuf)) {
    return { ok: false, error: { kind: 'token_invalid', reason: 'mismatch' } };
  }

  const parts = input.cookieToken.split(TOKEN_PARTS_SEPARATOR);
  if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
    return { ok: false, error: { kind: 'token_invalid', reason: 'malformed' } };
  }
  const random = parts[0];
  const providedSig = parts[1];

  // Dual-key acceptance: try CURRENT, then PREVIOUS. Sequential try-each
  // (the Django SECRET_KEY_FALLBACKS shape) — the token carries no key id,
  // and one extra HMAC on the miss path is cheaper than a format change.
  // Each comparison is individually constant-time; which KEY matched is not
  // a secret (an attacker learns nothing beyond "old token still valid").
  const { current, previous } = await getCsrfKeys();
  const candidates = previous !== null ? [current, previous] : [current];
  for (const key of candidates) {
    const expectedSig = sign(random, key);
    if (
      providedSig.length === expectedSig.length &&
      timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))
    ) {
      return { ok: true, value: true };
    }
  }
  return { ok: false, error: { kind: 'token_invalid', reason: 'signature_invalid' } };
}
