import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCsrfToken, verifyCsrf, type CsrfVerifyInput } from '../domain/csrf';

const VALID_SECRET = 'a'.repeat(32);
const EXPECTED_ORIGIN = 'https://my-quilty.com';

describe('CSRF token generation', () => {
  beforeEach(() => {
    vi.stubEnv('CSRF_SECRET', VALID_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a `<random>.<signature>` shape', () => {
    const token = generateCsrfToken();
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0]?.length).toBeGreaterThan(20);
    expect(parts[1]?.length).toBeGreaterThan(20);
  });

  it('mints distinct tokens across calls', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).not.toBe(b);
  });

  it('throws when CSRF_SECRET is shorter than 32 chars', () => {
    vi.stubEnv('CSRF_SECRET', 'short');
    expect(() => generateCsrfToken()).toThrow(/CSRF_SECRET/);
  });
});

describe('verifyCsrf — triple-layer', () => {
  beforeEach(() => {
    vi.stubEnv('CSRF_SECRET', VALID_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function makeValidInput(token?: string): CsrfVerifyInput {
    const t = token ?? generateCsrfToken();
    return {
      origin: EXPECTED_ORIGIN,
      referer: null,
      cookieToken: t,
      bodyToken: t,
      headerToken: t,
      expectedOrigin: EXPECTED_ORIGIN,
    };
  }

  it('accepts a valid triple-matching token + Origin', () => {
    const result = verifyCsrf(makeValidInput());
    expect(result.ok).toBe(true);
  });

  it('accepts when Origin is null but Referer matches', () => {
    const t = generateCsrfToken();
    const result = verifyCsrf({
      ...makeValidInput(t),
      origin: null,
      referer: `${EXPECTED_ORIGIN}/contact`,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects with origin_mismatch when Origin + Referer both differ', () => {
    const result = verifyCsrf({
      ...makeValidInput(),
      origin: 'https://attacker.com',
      referer: 'https://attacker.com/x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('origin_mismatch');
  });

  it('rejects with header_missing when X-Quilty-CSRF header absent', () => {
    const result = verifyCsrf({ ...makeValidInput(), headerToken: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('header_missing');
  });

  it('rejects with token_missing when cookie OR body token absent', () => {
    const r1 = verifyCsrf({ ...makeValidInput(), cookieToken: null });
    const r2 = verifyCsrf({ ...makeValidInput(), bodyToken: null });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    if (!r1.ok) expect(r1.error.kind).toBe('token_missing');
    if (!r2.ok) expect(r2.error.kind).toBe('token_missing');
  });

  it('rejects with token_invalid (mismatch) when cookie + body differ', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    const result = verifyCsrf({
      origin: EXPECTED_ORIGIN,
      referer: null,
      cookieToken: a,
      bodyToken: b,
      headerToken: a,
      expectedOrigin: EXPECTED_ORIGIN,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('token_invalid');
  });

  it('rejects with token_invalid (signature_invalid) when signature does not verify', () => {
    const valid = generateCsrfToken();
    const parts = valid.split('.');
    const tampered = `${parts[0]}.${'A'.repeat((parts[1] ?? '').length)}`;
    const result = verifyCsrf({
      origin: EXPECTED_ORIGIN,
      referer: null,
      cookieToken: tampered,
      bodyToken: tampered,
      headerToken: tampered,
      expectedOrigin: EXPECTED_ORIGIN,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('token_invalid');
  });

  it('rejects with token_invalid (malformed) when token has no separator', () => {
    const result = verifyCsrf({
      origin: EXPECTED_ORIGIN,
      referer: null,
      cookieToken: 'nope',
      bodyToken: 'nope',
      headerToken: 'nope',
      expectedOrigin: EXPECTED_ORIGIN,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('token_invalid');
  });
});
