/**
 * Edge-runtime-compatible CSRF token mint.
 *
 * Web Crypto (SubtleCrypto) is available in both Node 20+ AND the
 * Next.js Edge runtime, so the same module body works in proxy.ts
 * (Edge) + Server Components (Node) + Route Handlers (Node). The token
 * shape is byte-identical to the Node variant in `./csrf.ts` —
 * `<base64url(32 random bytes)>.<base64url(HMAC-SHA-256(random, secret))>` —
 * so a token minted here verifies under the existing Node `verifyCsrf()`
 * unchanged.
 *
 * Why a split file rather than co-locating with csrf.ts:
 *   1. `./csrf.ts` imports `node:crypto` at module load. Webpack's Edge
 *      target refuses to bundle any `node:` URI, so importing csrf.ts
 *      from a default `@quilty/security` consumer that's then reached
 *      by proxy.ts breaks Edge builds.
 *   2. Sync vs async: SubtleCrypto APIs are Promise-returning by
 *      design. Co-locating a sync `generateCsrfToken()` and an async
 *      `generateCsrfTokenEdge()` would invite call-site bugs where a
 *      caller dropped the await.
 *
 * Cross-runtime contract: `verifyCsrf()` in `./csrf.ts` (Node) accepts
 * a token minted by `generateCsrfTokenEdge()` (Edge). The contract test
 * in `__tests__/csrf-edge.test.ts` mints in Edge + verifies under Node
 * to lock the byte-identical invariant.
 *
 * Constant-time concerns: this module ONLY mints. Verification still
 * runs through the Node `verifyCsrf()` which uses `timingSafeEqual` for
 * constant-time signature comparison. A mint-side timing leak is not
 * exploitable (the random nonce + HMAC make timing irrelevant to the
 * attacker's forgery problem).
 */

const TOKEN_RANDOM_BYTES = 32;
const TOKEN_PARTS_SEPARATOR = '.';

function readCsrfSecret(): string {
  const secret = process.env['CSRF_SECRET'];
  if (!secret || secret.length < 32) {
    throw new Error(
      'CSRF_SECRET env var must be set to a value ≥ 32 chars (HMAC-SHA-256 requires ≥ 256 bits of entropy). Provision via the SST secret pipeline.',
    );
  }
  return secret;
}

/**
 * URL-safe base64 encoder for `Uint8Array`. Matches the
 * `Buffer.toString('base64url')` output that the Node variant produces
 * so the cross-runtime byte-identity invariant holds. `btoa` only
 * accepts a binary string of char codes 0-255, which `String.fromCharCode`
 * over each byte produces.
 */
function base64urlEncode(bytes: Uint8Array): string {
  let binaryString = '';
  for (const byte of bytes) {
    binaryString += String.fromCharCode(byte);
  }
  return btoa(binaryString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signWebCrypto(payload: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64urlEncode(new Uint8Array(sigBuffer));
}

/**
 * Mint a fresh CSRF token using Web Crypto APIs only.
 *
 * Call this from proxy.ts (Edge runtime) when the `__Host-quilty_csrf`
 * cookie is absent on a forms-bearing route. The returned token shape
 * matches the Node `generateCsrfToken()` byte-for-byte so the Node
 * `verifyCsrf()` accepts it on submit.
 */
export async function generateCsrfTokenEdge(): Promise<string> {
  const secret = readCsrfSecret();
  const randomBytes = new Uint8Array(TOKEN_RANDOM_BYTES);
  crypto.getRandomValues(randomBytes);
  const random = base64urlEncode(randomBytes);
  const key = await importHmacKey(secret);
  const sig = await signWebCrypto(random, key);
  return `${random}${TOKEN_PARTS_SEPARATOR}${sig}`;
}
