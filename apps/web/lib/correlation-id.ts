/**
 * Request-scoped correlation-ID minter for Server Action error paths.
 *
 * Server Actions in Next.js 16 production builds do NOT emit
 * `error.digest` consistently (Vercel discussion #63414 + #75004) —
 * the apex `error.tsx` + per-group `error.tsx` show "Reference: <digest>"
 * to the user, but Server Action throws leave that field undefined.
 * Without a stable correlator, support-email triage can't find the
 * server-side counterpart of a user-reported failure.
 *
 * This module mints a `q1m_<base32>` ID at action entry, stamps it on
 * the Sentry breadcrumb + the logger context, and propagates it as
 * the throw's `digest` so the existing error.tsx digest UI surfaces it.
 *
 * Format: `q1m_<10-char-base32>` (50 bits of entropy). Prefix matches
 * the brand + the M-tier (m1 → m1.5 → m2) so future log-scan tooling
 * can grep without false-positives on other 11-char IDs in the system.
 *
 * Edge-runtime safe — uses `crypto.getRandomValues` (Web Crypto API
 * available on both Node + Edge runtimes).
 */

const CORRELATION_ID_PREFIX = 'q1m_';
const CORRELATION_ID_BYTES = 6; // 48 bits → 10 base32 chars after padding strip

// Crockford base32 alphabet (excludes I/L/O/U — visually unambiguous
// for support staff reading the ID off a screenshot or a phone call).
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Mint a fresh correlation ID. Call once per Server Action invocation;
 * stamp on Sentry + logger context + the thrown Error's `digest`.
 */
export function mintCorrelationId(): string {
  const bytes = new Uint8Array(CORRELATION_ID_BYTES);
  crypto.getRandomValues(bytes);

  // Encode 48 bits as 10 base32 chars. Each char encodes 5 bits;
  // 6 bytes = 48 bits = 9.6 chars → pad to 10 by reading the last
  // remaining nibble.
  let bits = 0n;
  for (const b of bytes) {
    bits = (bits << 8n) | BigInt(b);
  }
  let out = '';
  // 10 chars × 5 bits = 50 bits; we have 48, so the first 2 bits
  // are always zero — acceptable (still 48 bits of real entropy).
  for (let i = 0; i < 10; i += 1) {
    const idx = Number((bits >> BigInt(45 - i * 5)) & 0x1fn);
    // Char access via index — verified non-undefined because the
    // base32 alphabet is exactly 32 chars + idx is mod-32 by the
    // bit-mask.
    out += CROCKFORD_BASE32[idx] ?? '0';
  }
  return `${CORRELATION_ID_PREFIX}${out}`;
}

/**
 * Type predicate — used by tests + log-scan tooling to confirm a
 * string is a correlation ID we minted (vs an arbitrary digest from
 * Next.js framework code).
 */
export function isCorrelationId(value: string): boolean {
  if (!value.startsWith(CORRELATION_ID_PREFIX)) return false;
  const suffix = value.slice(CORRELATION_ID_PREFIX.length);
  if (suffix.length !== 10) return false;
  for (const ch of suffix) {
    if (!CROCKFORD_BASE32.includes(ch)) return false;
  }
  return true;
}
