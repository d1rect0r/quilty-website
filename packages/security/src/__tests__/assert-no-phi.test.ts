import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertNoPHI } from '../domain/assert-no-phi';

describe('assertNoPHI', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws in development on PHI-shaped keys', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => assertNoPHI({ user_id: 'x', email: 'user@example.com' }, 'test')).toThrow(
      /PHI keys detected/,
    );
  });

  it('throws when PHI is nested deep', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() =>
      assertNoPHI({ ctx: { profile: { diagnosis: 'gad' } } }, 'analytics:profile_loaded'),
    ).toThrow(/diagnosis/);
  });

  it('throws on PHI inside arrays', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => assertNoPHI({ items: [{ ok: true }, { medication: 'x' }] }, 'test')).toThrow(
      /medication/,
    );
  });

  it('does not throw on payloads with only safe keys', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() =>
      assertNoPHI({ route: '/en/account', method: 'GET', duration_ms: 142 }, 'test'),
    ).not.toThrow();
  });

  it('is silent in production (sanitize() is the production defense)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertNoPHI({ email: 'user@example.com' }, 'test')).not.toThrow();
  });

  it('reports the full key path for easier debugging', () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      assertNoPHI({ ctx: { user: { email: 'x' } } }, 'test');
    } catch (err) {
      expect((err as Error).message).toContain('ctx.user.email');
    }
  });

  it('handles circular references without infinite recursion', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const circular: Record<string, unknown> = { route: '/en' };
    circular['self'] = circular;
    expect(() => assertNoPHI(circular, 'test')).not.toThrow();
  });
});
