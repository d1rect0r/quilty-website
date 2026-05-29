/**
 * Cross-runtime contract tests for `generateCsrfTokenEdge`.
 *
 * The edge variant uses Web Crypto (SubtleCrypto + getRandomValues +
 * btoa) and the Node verifier uses `node:crypto` (createHmac +
 * timingSafeEqual). The byte-identical invariant — a token minted
 * via the edge mint MUST verify under the Node verifier — is what
 * lets proxy.ts (Edge) mint the cookie and the Route Handler (Node)
 * verify it on submit.
 *
 * Vitest runs under Node + jsdom; both runtimes expose Web Crypto
 * globally, so the edge function executes here. The contract test
 * locks the cross-runtime invariant against regressions (e.g., a
 * future base64url-encoder rewrite that changes char ordering).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCsrfTokenEdge } from '../domain/csrf-edge';
import { verifyCsrf, type CsrfVerifyInput } from '../domain/csrf';

const VALID_SECRET = 'a'.repeat(32);
const EXPECTED_ORIGIN = 'https://my-quilty.com';

describe('generateCsrfTokenEdge — edge mint shape + entropy', () => {
  beforeEach(() => {
    vi.stubEnv('CSRF_SECRET', VALID_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a `<random>.<signature>` shape matching the Node mint', async () => {
    const token = await generateCsrfTokenEdge();
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    // 32 random bytes -> base64url -> 43 chars (no padding)
    expect(parts[0]?.length).toBe(43);
    // HMAC-SHA-256 -> 32 byte digest -> base64url -> 43 chars
    expect(parts[1]?.length).toBe(43);
  });

  it('produces only URL-safe base64 chars (no +, /, =)', async () => {
    const token = await generateCsrfTokenEdge();
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('mints distinct tokens across calls (entropy sanity)', async () => {
    const a = await generateCsrfTokenEdge();
    const b = await generateCsrfTokenEdge();
    expect(a).not.toBe(b);
    // The random component must differ between calls
    expect(a.split('.')[0]).not.toBe(b.split('.')[0]);
  });

  it('throws when CSRF_SECRET is shorter than 32 chars', async () => {
    vi.stubEnv('CSRF_SECRET', 'short');
    await expect(generateCsrfTokenEdge()).rejects.toThrow(/CSRF_SECRET/);
  });

  it('throws when CSRF_SECRET is unset', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('CSRF_SECRET', '');
    await expect(generateCsrfTokenEdge()).rejects.toThrow(/CSRF_SECRET/);
  });
});

describe('generateCsrfTokenEdge ↔ verifyCsrf cross-runtime contract', () => {
  beforeEach(() => {
    vi.stubEnv('CSRF_SECRET', VALID_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function makeInputFromEdgeToken(token: string): CsrfVerifyInput {
    return {
      origin: EXPECTED_ORIGIN,
      referer: null,
      cookieToken: token,
      bodyToken: token,
      headerToken: token,
      expectedOrigin: EXPECTED_ORIGIN,
    };
  }

  it('edge-minted token verifies under the Node verifier', async () => {
    const token = await generateCsrfTokenEdge();
    const result = verifyCsrf(makeInputFromEdgeToken(token));
    expect(result.ok).toBe(true);
  });

  it('edge-minted token signature is HMAC-SHA-256 deterministic for the same random', async () => {
    // Mint twice; both must verify, even though they have different
    // random components. This catches a class of bugs where the
    // signature derivation accidentally varies per call.
    const t1 = await generateCsrfTokenEdge();
    const t2 = await generateCsrfTokenEdge();
    expect(verifyCsrf(makeInputFromEdgeToken(t1)).ok).toBe(true);
    expect(verifyCsrf(makeInputFromEdgeToken(t2)).ok).toBe(true);
  });

  it('edge-minted token fails verification under a rotated secret', async () => {
    const token = await generateCsrfTokenEdge();
    vi.stubEnv('CSRF_SECRET', 'b'.repeat(32));
    const result = verifyCsrf(makeInputFromEdgeToken(token));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('token_invalid');
    }
  });

  it('forging the random part with a fresh signature attempt fails verification', async () => {
    const token = await generateCsrfTokenEdge();
    // Forge: keep the legitimate signature, swap the random prefix.
    // The verifier re-derives the HMAC against the swapped random and
    // detects the mismatch.
    const [, sig] = token.split('.');
    const forged = `${'forged_random_part_with_43_chars_padding_____'}.${sig ?? ''}`;
    const result = verifyCsrf({
      origin: EXPECTED_ORIGIN,
      referer: null,
      cookieToken: forged,
      bodyToken: forged,
      headerToken: forged,
      expectedOrigin: EXPECTED_ORIGIN,
    });
    expect(result.ok).toBe(false);
  });
});
