// @vitest-environment node
//
// `lib/env.ts` is a server/build-time module. `@t3-oss/env-nextjs` decides
// server-vs-client by `typeof window`, and the apps/web default jsdom
// environment defines `window` — which would make t3-env treat server-var
// reads as illegal client access. Pin this file to the node environment so
// it validates the module the way it actually runs (server + `next build`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `lib/env.ts` skips validation under NODE_ENV=test, so these tests stub
 * NODE_ENV=production (and clear SKIP_ENV_VALIDATION) to exercise the real
 * build/runtime validation path, then re-import the module fresh each time.
 */
async function importEnvFresh() {
  vi.resetModules();
  return import('../env');
}

describe('lib/env (boot-time validation)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws when a required client var (NEXT_PUBLIC_SITE_URL) is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    await expect(importEnvFresh()).rejects.toThrow(/Invalid environment variables/i);
  });

  it('throws when NEXT_PUBLIC_SITE_URL is not a valid URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'not-a-url');
    await expect(importEnvFresh()).rejects.toThrow(/Invalid environment variables/i);
  });

  it('succeeds with a valid required environment', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://my-quilty.com');
    const { env } = await importEnvFresh();
    expect(env.NEXT_PUBLIC_SITE_URL).toBe('https://my-quilty.com');
  });

  describe('QUILTY_ALLOW_INMEMORY_ADAPTERS transform', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://my-quilty.com');
    });

    it("coerces 'true' to boolean true", async () => {
      vi.stubEnv('QUILTY_ALLOW_INMEMORY_ADAPTERS', 'true');
      const { env } = await importEnvFresh();
      expect(env.QUILTY_ALLOW_INMEMORY_ADAPTERS).toBe(true);
    });

    it("coerces 'false' to boolean false", async () => {
      vi.stubEnv('QUILTY_ALLOW_INMEMORY_ADAPTERS', 'false');
      const { env } = await importEnvFresh();
      expect(env.QUILTY_ALLOW_INMEMORY_ADAPTERS).toBe(false);
    });

    it('defaults to false when unset (fail-closed default)', async () => {
      vi.stubEnv('QUILTY_ALLOW_INMEMORY_ADAPTERS', '');
      const { env } = await importEnvFresh();
      expect(env.QUILTY_ALLOW_INMEMORY_ADAPTERS).toBe(false);
    });

    it('rejects a non-enum value rather than guessing', async () => {
      vi.stubEnv('QUILTY_ALLOW_INMEMORY_ADAPTERS', 'yes');
      await expect(importEnvFresh()).rejects.toThrow(/Invalid environment variables/i);
    });
  });

  it('rejects a CSRF_SECRET shorter than 32 chars when present', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://my-quilty.com');
    vi.stubEnv('CSRF_SECRET', 'too-short');
    await expect(importEnvFresh()).rejects.toThrow(/Invalid environment variables/i);
  });
});
