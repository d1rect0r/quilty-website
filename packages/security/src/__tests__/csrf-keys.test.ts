/**
 * Key-provider contract tests. The provider is the single source of CSRF
 * signing keys for both mint paths (Node + Edge) and verification, so its
 * failure semantics — fail-closed, placeholder rejection, stale-on-error,
 * retry-after-failure — are locked here rather than re-tested per consumer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetCsrfKeyCacheForTesting, getCsrfKeys } from '../domain/csrf-keys';

const VALID_KEY = 'k'.repeat(64);
const OTHER_KEY = 'p'.repeat(64);

function stubExtension(
  responder: (stage: 'AWSCURRENT' | 'AWSPREVIOUS') => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  vi.stubEnv('QUILTY_CSRF_VIA_EXTENSION', '1');
  vi.stubEnv('AWS_SESSION_TOKEN', 'test-session-token');
  const fetchMock = vi.fn(async (url: string | URL) =>
    responder(String(url).includes('AWSPREVIOUS') ? 'AWSPREVIOUS' : 'AWSCURRENT'),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  __resetCsrfKeyCacheForTesting();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  __resetCsrfKeyCacheForTesting();
});

describe('getCsrfKeys — env fallback path', () => {
  it('serves CSRF_SECRET with no previous key', async () => {
    vi.stubEnv('CSRF_SECRET', VALID_KEY);
    const keys = await getCsrfKeys();
    expect(keys.current).toBe(VALID_KEY);
    expect(keys.previous).toBeNull();
  });

  it('rejects an env secret shorter than 32 chars (fail-closed)', async () => {
    vi.stubEnv('CSRF_SECRET', 'short');
    await expect(getCsrfKeys()).rejects.toThrow(/CSRF signing key unavailable/);
  });

  it('rejects the committed placeholder string even at valid length', async () => {
    vi.stubEnv('CSRF_SECRET', 'PLACEHOLDER rotate this CSRF signing key before first deploy');
    await expect(getCsrfKeys()).rejects.toThrow(/CSRF signing key unavailable/);
  });

  it('fails FAST during the failure cooldown, then retries — a later valid env is picked up', async () => {
    vi.useFakeTimers();
    await expect(getCsrfKeys()).rejects.toThrow(/CSRF signing key unavailable/);
    // Inside the cooldown: same rejection, no re-probe (fail-fast memo).
    vi.stubEnv('CSRF_SECRET', VALID_KEY);
    await expect(getCsrfKeys()).rejects.toThrow(/CSRF signing key unavailable/);
    // Past the cooldown: self-heals onto the now-valid source.
    await vi.advanceTimersByTimeAsync(5_001);
    const keys = await getCsrfKeys();
    expect(keys.current).toBe(VALID_KEY);
  });
});

describe('getCsrfKeys — extension path', () => {
  it('fetches AWSCURRENT + AWSPREVIOUS and prefers the extension over env', async () => {
    vi.stubEnv('CSRF_SECRET', 'env-key-'.padEnd(40, 'e'));
    stubExtension((stage) =>
      Response.json({ SecretString: stage === 'AWSCURRENT' ? VALID_KEY : OTHER_KEY }),
    );
    const keys = await getCsrfKeys();
    expect(keys.current).toBe(VALID_KEY);
    expect(keys.previous).toBe(OTHER_KEY);
  });

  it('treats a missing AWSPREVIOUS (first-ever key) as current-only, not an error', async () => {
    stubExtension((stage) =>
      stage === 'AWSCURRENT'
        ? Response.json({ SecretString: VALID_KEY })
        : new Response('not found', { status: 404 }),
    );
    const keys = await getCsrfKeys();
    expect(keys.current).toBe(VALID_KEY);
    expect(keys.previous).toBeNull();
  });

  it('drops a placeholder AWSPREVIOUS instead of accepting or failing on it', async () => {
    stubExtension((stage) =>
      Response.json({
        SecretString: stage === 'AWSCURRENT' ? VALID_KEY : 'PLACEHOLDER leftover',
      }),
    );
    const keys = await getCsrfKeys();
    expect(keys.current).toBe(VALID_KEY);
    expect(keys.previous).toBeNull();
  });

  it('memoizes concurrent cold-start callers onto one lookup', async () => {
    const fetchMock = stubExtension(() => Response.json({ SecretString: VALID_KEY }));
    await Promise.all([getCsrfKeys(), getCsrfKeys(), getCsrfKeys()]);
    // 2 = one AWSCURRENT + one AWSPREVIOUS request for the single shared lookup.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('re-fetches after the cache TTL so a rotation reaches warm instances', async () => {
    vi.useFakeTimers();
    let current = VALID_KEY;
    const fetchMock = stubExtension((stage) =>
      Response.json({ SecretString: stage === 'AWSCURRENT' ? current : OTHER_KEY }),
    );
    expect((await getCsrfKeys()).current).toBe(VALID_KEY);
    current = 'rotated-'.padEnd(64, 'r');
    // Inside the TTL: served from cache, no new fetch.
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await getCsrfKeys()).current).toBe(VALID_KEY);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Past the TTL: refreshed.
    await vi.advanceTimersByTimeAsync(300_000);
    expect((await getCsrfKeys()).current).toBe('rotated-'.padEnd(64, 'r'));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('serves the last-good keys when a refresh fails (stale-on-error)', async () => {
    vi.useFakeTimers();
    let healthy = true;
    stubExtension((stage) =>
      healthy
        ? Response.json({ SecretString: stage === 'AWSCURRENT' ? VALID_KEY : OTHER_KEY })
        : new Response('extension down', { status: 500 }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect((await getCsrfKeys()).current).toBe(VALID_KEY);
    healthy = false;
    await vi.advanceTimersByTimeAsync(301_000);
    const stale = await getCsrfKeys();
    expect(stale.current).toBe(VALID_KEY);
    expect(stale.previous).toBe(OTHER_KEY);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[csrf-keys]'));
    warnSpy.mockRestore();
  });

  it('never calls the extension when the deploy flag is unset', async () => {
    vi.stubEnv('AWS_SESSION_TOKEN', 'token-present-but-flag-absent');
    vi.stubEnv('CSRF_SECRET', VALID_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await getCsrfKeys();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
