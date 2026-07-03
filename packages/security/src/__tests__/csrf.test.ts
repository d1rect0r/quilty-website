import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCsrfToken, verifyCsrf, type CsrfVerifyInput } from '../domain/csrf';
import { __resetCsrfKeyCacheForTesting } from '../domain/csrf-keys';

const VALID_SECRET = 'a'.repeat(32);
const EXPECTED_ORIGIN = 'https://my-quilty.com';

describe('CSRF token generation', () => {
  beforeEach(() => {
    __resetCsrfKeyCacheForTesting();
    vi.stubEnv('CSRF_SECRET', VALID_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetCsrfKeyCacheForTesting();
  });

  it('returns a `<random>.<signature>` shape', async () => {
    const token = await generateCsrfToken();
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0]?.length).toBeGreaterThan(20);
    expect(parts[1]?.length).toBeGreaterThan(20);
  });

  it('mints distinct tokens across calls', async () => {
    const a = await generateCsrfToken();
    const b = await generateCsrfToken();
    expect(a).not.toBe(b);
  });

  it('rejects (fail-closed) when CSRF_SECRET is shorter than 32 chars', async () => {
    vi.stubEnv('CSRF_SECRET', 'short');
    await expect(generateCsrfToken()).rejects.toThrow(/CSRF signing key unavailable/);
  });
});

describe('verifyCsrf — triple-layer', () => {
  beforeEach(() => {
    __resetCsrfKeyCacheForTesting();
    vi.stubEnv('CSRF_SECRET', VALID_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetCsrfKeyCacheForTesting();
  });

  async function makeValidInput(token?: string): Promise<CsrfVerifyInput> {
    const t = token ?? (await generateCsrfToken());
    return {
      origin: EXPECTED_ORIGIN,
      referer: null,
      cookieToken: t,
      bodyToken: t,
      headerToken: t,
      expectedOrigin: EXPECTED_ORIGIN,
    };
  }

  it('accepts a valid triple-matching token + Origin', async () => {
    const result = await verifyCsrf(await makeValidInput());
    expect(result.ok).toBe(true);
  });

  it('accepts when Origin is null but Referer matches', async () => {
    const t = await generateCsrfToken();
    const result = await verifyCsrf({
      ...(await makeValidInput(t)),
      origin: null,
      referer: `${EXPECTED_ORIGIN}/contact`,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects with origin_mismatch when Origin + Referer both differ', async () => {
    const result = await verifyCsrf({
      ...(await makeValidInput()),
      origin: 'https://attacker.com',
      referer: 'https://attacker.com/x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('origin_mismatch');
  });

  it('rejects with header_missing when X-Quilty-CSRF header absent', async () => {
    const result = await verifyCsrf({ ...(await makeValidInput()), headerToken: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('header_missing');
  });

  it('rejects with token_missing when cookie OR body token absent', async () => {
    const r1 = await verifyCsrf({ ...(await makeValidInput()), cookieToken: null });
    const r2 = await verifyCsrf({ ...(await makeValidInput()), bodyToken: null });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    if (!r1.ok) expect(r1.error.kind).toBe('token_missing');
    if (!r2.ok) expect(r2.error.kind).toBe('token_missing');
  });

  it('rejects with token_invalid (mismatch) when cookie + body differ', async () => {
    const a = await generateCsrfToken();
    const b = await generateCsrfToken();
    const result = await verifyCsrf({
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

  it('rejects with token_invalid (signature_invalid) when signature does not verify', async () => {
    const valid = await generateCsrfToken();
    const parts = valid.split('.');
    const tampered = `${parts[0]}.${'A'.repeat((parts[1] ?? '').length)}`;
    const result = await verifyCsrf({
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

  it('rejects with token_invalid (malformed) when token has no separator', async () => {
    const result = await verifyCsrf({
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

describe('verifyCsrf — dual-key rotation', () => {
  // The dual-key path is exercised through the extension source (env keys
  // never carry a previous generation). Stub the extension contract at the
  // fetch layer, exactly as the provider sees it in Lambda.
  const OLD_KEY = 'old-key-'.padEnd(48, 'o');
  const NEW_KEY = 'new-key-'.padEnd(48, 'n');

  function stubExtension(current: string, previous: string | null): void {
    vi.stubEnv('QUILTY_CSRF_VIA_EXTENSION', '1');
    vi.stubEnv('AWS_SESSION_TOKEN', 'test-session-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const stage = String(url).includes('AWSPREVIOUS') ? previous : current;
        return stage === null
          ? new Response('not found', { status: 404 })
          : Response.json({ SecretString: stage });
      }),
    );
  }

  beforeEach(() => {
    __resetCsrfKeyCacheForTesting();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    __resetCsrfKeyCacheForTesting();
  });

  async function inputFor(token: string): Promise<CsrfVerifyInput> {
    return {
      origin: EXPECTED_ORIGIN,
      referer: null,
      cookieToken: token,
      bodyToken: token,
      headerToken: token,
      expectedOrigin: EXPECTED_ORIGIN,
    };
  }

  it('accepts a token signed by the PREVIOUS key after a rotation', async () => {
    stubExtension(OLD_KEY, null);
    const preRotationToken = await generateCsrfToken();

    __resetCsrfKeyCacheForTesting();
    stubExtension(NEW_KEY, OLD_KEY);
    const result = await verifyCsrf(await inputFor(preRotationToken));
    expect(result.ok).toBe(true);
  });

  it('rejects a token whose key aged out of the CURRENT+PREVIOUS window', async () => {
    stubExtension(OLD_KEY, null);
    const ancientToken = await generateCsrfToken();

    __resetCsrfKeyCacheForTesting();
    stubExtension(NEW_KEY, 'mid-key-'.padEnd(48, 'm'));
    const result = await verifyCsrf(await inputFor(ancientToken));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('token_invalid');
  });

  it('verifies CURRENT-only when no AWSPREVIOUS exists (first-ever key)', async () => {
    stubExtension(NEW_KEY, null);
    const token = await generateCsrfToken();
    const result = await verifyCsrf(await inputFor(token));
    expect(result.ok).toBe(true);
  });
});
