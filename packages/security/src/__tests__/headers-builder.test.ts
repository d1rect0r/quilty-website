import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHstsValue, buildSecurityHeaders, currentHstsPhase } from '../domain/headers-builder';

describe('buildHstsValue', () => {
  it('starts at max-age=300 in the scaffold phase', () => {
    expect(buildHstsValue('scaffold')).toBe('max-age=300');
  });

  it('progresses through ramp phases', () => {
    expect(buildHstsValue('scaffold')).toBe('max-age=300');
    expect(buildHstsValue('short-ramp')).toBe('max-age=86400');
    expect(buildHstsValue('medium-ramp')).toBe('max-age=604800');
    expect(buildHstsValue('long-ramp')).toContain('max-age=31536000');
    expect(buildHstsValue('long-ramp')).toContain('includeSubDomains');
    expect(buildHstsValue('preload')).toContain('max-age=63072000');
    expect(buildHstsValue('preload')).toContain('includeSubDomains');
    expect(buildHstsValue('preload')).toContain('preload');
  });

  it('only emits preload directive in the final phase', () => {
    // preload submission is irreversible — never emit before the
    // explicit `preload` phase.
    expect(buildHstsValue('scaffold')).not.toContain('preload');
    expect(buildHstsValue('short-ramp')).not.toContain('preload');
    expect(buildHstsValue('medium-ramp')).not.toContain('preload');
    expect(buildHstsValue('long-ramp')).not.toContain('preload');
    expect(buildHstsValue('preload')).toContain('preload');
  });
});

describe('currentHstsPhase', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the scaffold phase when HSTS_PHASE unset', () => {
    vi.stubEnv('HSTS_PHASE', '');
    expect(currentHstsPhase()).toBe('scaffold');
  });

  it('accepts valid phases via env', () => {
    vi.stubEnv('HSTS_PHASE', 'preload');
    expect(currentHstsPhase()).toBe('preload');
  });

  it('falls back to the scaffold phase on invalid input (defense-in-depth)', () => {
    vi.stubEnv('HSTS_PHASE', 'malicious; preload');
    expect(currentHstsPhase()).toBe('scaffold');
  });
});

describe('buildSecurityHeaders', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const byKey = (headers: ReturnType<typeof buildSecurityHeaders>, k: string) =>
    headers.find((h) => h.key === k);

  it('emits Strict-Transport-Security with the scaffold-phase value by default', () => {
    const headers = buildSecurityHeaders();
    expect(byKey(headers, 'Strict-Transport-Security')?.value).toBe('max-age=300');
  });

  it('emits Strict-Transport-Security with the preload ramp value when HSTS_PHASE=preload', () => {
    vi.stubEnv('HSTS_PHASE', 'preload');
    const headers = buildSecurityHeaders();
    expect(byKey(headers, 'Strict-Transport-Security')?.value).toContain('preload');
  });

  it('emits X-Content-Type-Options: nosniff', () => {
    const headers = buildSecurityHeaders();
    expect(byKey(headers, 'X-Content-Type-Options')?.value).toBe('nosniff');
  });

  it('emits X-Frame-Options: DENY (belt-and-suspenders with CSP frame-ancestors)', () => {
    const headers = buildSecurityHeaders();
    expect(byKey(headers, 'X-Frame-Options')?.value).toBe('DENY');
  });

  it('emits Cross-Origin-Opener-Policy: same-origin-allow-popups (D58)', () => {
    const headers = buildSecurityHeaders();
    expect(byKey(headers, 'Cross-Origin-Opener-Policy')?.value).toBe('same-origin-allow-popups');
  });

  it('emits Cross-Origin-Resource-Policy: same-origin (D58)', () => {
    const headers = buildSecurityHeaders();
    expect(byKey(headers, 'Cross-Origin-Resource-Policy')?.value).toBe('same-origin');
  });

  it('emits Referrer-Policy: strict-origin-when-cross-origin (D33)', () => {
    const headers = buildSecurityHeaders();
    expect(byKey(headers, 'Referrer-Policy')?.value).toBe('strict-origin-when-cross-origin');
  });

  it('emits Permissions-Policy with default-deny camera/mic/geo/payment (Stripe activation adds the payment allowlist)', () => {
    const headers = buildSecurityHeaders();
    const value = byKey(headers, 'Permissions-Policy')?.value ?? '';
    expect(value).toContain('camera=()');
    expect(value).toContain('microphone=()');
    expect(value).toContain('geolocation=()');
    expect(value).toContain('payment=()');
  });

  it('produces a fixed-shape array (no duplicates)', () => {
    const headers = buildSecurityHeaders();
    const keys = headers.map((h) => h.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
