/**
 * Generic edge-runtime HMAC-SHA-256 sign + verify (Web Crypto only — no
 * `node:crypto`, so it bundles in the Next.js Edge runtime / proxy.ts).
 *
 * Token shape: `<payload>.<base64url(HMAC-SHA-256(payload, secret))>`. The
 * payload is opaque to this module — callers choose what it carries (a
 * label, a timestamp, …). Verification recomputes the signature and
 * compares it in constant time, so forging a valid token requires the
 * secret.
 *
 * Kept separate from `csrf-edge.ts` (which has a locked byte-identical
 * cross-runtime contract with the Node `verifyCsrf`) so this generic
 * primitive can evolve without risk to CSRF.
 */

const SEPARATOR = '.';

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64urlEncode(new Uint8Array(sig));
}

/**
 * Constant-time string comparison. Always compares the full length of the
 * longer string so a mismatch in length or content takes the same time —
 * no early-exit timing oracle for the attacker's forgery problem.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Mint a `<payload>.<sig>` token. Used by the ops mint helper. */
export async function signHmacEdge(payload: string, secret: string): Promise<string> {
  const sig = await hmacSign(payload, secret);
  return `${payload}${SEPARATOR}${sig}`;
}

/**
 * Verify a `<payload>.<sig>` token against `secret`. Returns false for any
 * malformed token, missing/short secret, or signature mismatch.
 */
export async function verifyHmacEdge(token: string, secret: string): Promise<boolean> {
  if (typeof token !== 'string' || typeof secret !== 'string' || secret.length === 0) {
    return false;
  }
  const sepIndex = token.lastIndexOf(SEPARATOR);
  if (sepIndex <= 0 || sepIndex === token.length - 1) return false;
  const payload = token.slice(0, sepIndex);
  const sig = token.slice(sepIndex + 1);
  const expected = await hmacSign(payload, secret);
  return timingSafeStringEqual(sig, expected);
}
