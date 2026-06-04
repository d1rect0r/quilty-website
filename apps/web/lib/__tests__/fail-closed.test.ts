import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertInMemoryAdapterAllowed,
  resolveInMemoryGuardContext,
  shouldEmitInMemoryAuditLog,
} from '../fail-closed';

describe('assertInMemoryAdapterAllowed', () => {
  describe('real-adapter activation env present (wiring bug)', () => {
    it('throws regardless of runtime — the real adapter should be wired', () => {
      expect(() =>
        assertInMemoryAdapterAllowed({
          name: 'rate-limiter',
          isProductionRuntime: false,
          allowInMemory: false,
          realActivationEnv: 'quilty-prod-rate-limit',
        }),
      ).toThrow(/has its real-adapter activation env set/);
    });

    it('throws even when the opt-in is set (still a wiring bug)', () => {
      expect(() =>
        assertInMemoryAdapterAllowed({
          name: 'consent-store',
          isProductionRuntime: true,
          allowInMemory: true,
          realActivationEnv: 'quilty-prod-consent',
        }),
      ).toThrow(/Wire the real/);
    });
  });

  describe('production runtime', () => {
    it('throws (fail-closed) when no real adapter and no opt-in', () => {
      expect(() =>
        assertInMemoryAdapterAllowed({
          name: 'rate-limiter',
          isProductionRuntime: true,
          allowInMemory: false,
          realActivationEnv: undefined,
        }),
      ).toThrow(/refusing to use the in-memory rate-limiter adapter in production/);
    });

    it('names QUILTY_ALLOW_INMEMORY_ADAPTERS as the explicit escape in the error', () => {
      expect(() =>
        assertInMemoryAdapterAllowed({
          name: 'consent-store',
          isProductionRuntime: true,
          allowInMemory: false,
          realActivationEnv: undefined,
        }),
      ).toThrow(/QUILTY_ALLOW_INMEMORY_ADAPTERS=true/);
    });

    it('returns warn-and-use when the opt-in is explicitly set', () => {
      expect(
        assertInMemoryAdapterAllowed({
          name: 'email-sender',
          isProductionRuntime: true,
          allowInMemory: true,
          realActivationEnv: undefined,
        }),
      ).toEqual({ action: 'warn-and-use' });
    });
  });

  describe('non-production runtime (dev / test / static build)', () => {
    it('returns use (silent) with no opt-in', () => {
      expect(
        assertInMemoryAdapterAllowed({
          name: 'rate-limiter',
          isProductionRuntime: false,
          allowInMemory: false,
          realActivationEnv: undefined,
        }),
      ).toEqual({ action: 'use' });
    });

    it('returns use (not warn-and-use) even if the opt-in happens to be set', () => {
      expect(
        assertInMemoryAdapterAllowed({
          name: 'captcha-verifier',
          isProductionRuntime: false,
          allowInMemory: true,
          realActivationEnv: undefined,
        }),
      ).toEqual({ action: 'use' });
    });
  });
});

describe('resolveInMemoryGuardContext', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is production-runtime when NODE_ENV=production and NEXT_PHASE is unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', '');
    expect(resolveInMemoryGuardContext().isProductionRuntime).toBe(true);
  });

  it('is NOT production-runtime during the next build static-generation phase', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    expect(resolveInMemoryGuardContext().isProductionRuntime).toBe(false);
  });

  it('is NOT production-runtime in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PHASE', '');
    expect(resolveInMemoryGuardContext().isProductionRuntime).toBe(false);
  });

  it("reads the opt-in only when set to exactly 'true'", () => {
    vi.stubEnv('QUILTY_ALLOW_INMEMORY_ADAPTERS', 'true');
    expect(resolveInMemoryGuardContext().allowInMemory).toBe(true);
    vi.stubEnv('QUILTY_ALLOW_INMEMORY_ADAPTERS', 'false');
    expect(resolveInMemoryGuardContext().allowInMemory).toBe(false);
    vi.stubEnv('QUILTY_ALLOW_INMEMORY_ADAPTERS', '1');
    expect(resolveInMemoryGuardContext().allowInMemory).toBe(false);
  });
});

describe('shouldEmitInMemoryAuditLog', () => {
  it('returns true only the first time a given adapter name is seen this process', () => {
    // Unique names so this test does not interfere with other suites that
    // share the module-scope dedupe set.
    expect(shouldEmitInMemoryAuditLog('audit-test-alpha')).toBe(true);
    expect(shouldEmitInMemoryAuditLog('audit-test-alpha')).toBe(false);
    expect(shouldEmitInMemoryAuditLog('audit-test-alpha')).toBe(false);
  });

  it('tracks distinct adapter names independently', () => {
    expect(shouldEmitInMemoryAuditLog('audit-test-beta')).toBe(true);
    expect(shouldEmitInMemoryAuditLog('audit-test-gamma')).toBe(true);
    expect(shouldEmitInMemoryAuditLog('audit-test-beta')).toBe(false);
  });
});
