import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildHstsValue,
  buildSecurityHeaders,
  currentHstsPhase,
} from '@/lib/security/headers';

describe('buildHstsValue', () => {
  it('starts at max-age=300 in M1 phase', () => {
    expect(buildHstsValue('m1')).toBe('max-age=300');
  });

  it('progresses through ramp phases', () => {
    expect(buildHstsValue('m1')).toBe('max-age=300');
    expect(buildHstsValue('m2-m6')).toBe('max-age=86400');
    expect(buildHstsValue('m7')).toBe('max-age=604800');
    expect(buildHstsValue('m8-prelaunch')).toContain('max-age=31536000');
    expect(buildHstsValue('m8-prelaunch')).toContain('includeSubDomains');
    expect(buildHstsValue('m8-launch')).toContain('max-age=63072000');
    expect(buildHstsValue('m8-launch')).toContain('includeSubDomains');
    expect(buildHstsValue('m8-launch')).toContain('preload');
  });

  it('only emits preload directive in the launch phase', () => {
    // preload submission is irreversible — never emit before M8 launch.
    expect(buildHstsValue('m1')).not.toContain('preload');
    expect(buildHstsValue('m2-m6')).not.toContain('preload');
    expect(buildHstsValue('m7')).not.toContain('preload');
    expect(buildHstsValue('m8-prelaunch')).not.toContain('preload');
    expect(buildHstsValue('m8-launch')).toContain('preload');
  });
});

describe('currentHstsPhase', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to m1 when HSTS_PHASE unset', () => {
    vi.stubEnv('HSTS_PHASE', '');
    expect(currentHstsPhase()).toBe('m1');
  });

  it('accepts valid phases via env', () => {
    vi.stubEnv('HSTS_PHASE', 'm8-launch');
    expect(currentHstsPhase()).toBe('m8-launch');
  });

  it('falls back to m1 on invalid input (defense-in-depth)', () => {
    vi.stubEnv('HSTS_PHASE', 'malicious; preload');
    expect(currentHstsPhase()).toBe('m1');
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

  it('emits Strict-Transport-Security with the m1 ramp value by default', () => {
    const headers = buildSecurityHeaders();
    expect(byKey(headers, 'Strict-Transport-Security')?.value).toBe('max-age=300');
  });

  it('emits Strict-Transport-Security with the launch ramp value when HSTS_PHASE=m8-launch', () => {
    vi.stubEnv('HSTS_PHASE', 'm8-launch');
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
    expect(byKey(headers, 'Cross-Origin-Opener-Policy')?.value).toBe(
      'same-origin-allow-popups',
    );
  });

  it('emits Cross-Origin-Resource-Policy: same-origin (D58)', () => {
    const headers = buildSecurityHeaders();
    expect(byKey(headers, 'Cross-Origin-Resource-Policy')?.value).toBe('same-origin');
  });

  it('emits Referrer-Policy: strict-origin-when-cross-origin (D33)', () => {
    const headers = buildSecurityHeaders();
    expect(byKey(headers, 'Referrer-Policy')?.value).toBe(
      'strict-origin-when-cross-origin',
    );
  });

  it('emits Permissions-Policy with default-deny camera/mic/geo/payment (M7 adds payment allowlist for Stripe)', () => {
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
