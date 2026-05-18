import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildMarketingCsp,
  buildPortalCsp,
  generateNonce,
  isPortalRoute,
} from '@/lib/security/csp';

describe('buildMarketingCsp', () => {
  it('does not include a nonce', () => {
    const csp = buildMarketingCsp();
    expect(csp).not.toContain('nonce-');
  });

  it('includes the core directives', () => {
    const csp = buildMarketingCsp();
    expect(csp).toContain(`default-src 'self'`);
    expect(csp).toContain(`object-src 'none'`);
    expect(csp).toContain(`frame-ancestors 'none'`);
    expect(csp).toContain(`base-uri 'self'`);
    expect(csp).toContain(`form-action 'self'`);
    expect(csp).toContain(`upgrade-insecure-requests`);
  });

  it('emits Trusted Types report-only directive', () => {
    const csp = buildMarketingCsp();
    expect(csp).toContain(`require-trusted-types-for 'script'`);
  });

  it('whitelists Sentry ingest in connect-src', () => {
    const csp = buildMarketingCsp();
    expect(csp).toContain('connect-src');
    expect(csp).toMatch(/connect-src 'self'\s+https/);
  });

  it('emits unsafe-eval only when isDevelopment: true', () => {
    expect(buildMarketingCsp({ isDevelopment: false })).not.toContain('unsafe-eval');
    expect(buildMarketingCsp({ isDevelopment: true })).toContain(`'unsafe-eval'`);
  });
});

describe('buildPortalCsp', () => {
  it('includes the nonce + strict-dynamic in script-src', () => {
    const csp = buildPortalCsp('abc123');
    expect(csp).toContain(`'nonce-abc123'`);
    expect(csp).toContain(`'strict-dynamic'`);
  });

  it('does not include strict-dynamic in marketing CSP', () => {
    const portalCsp = buildPortalCsp('abc123');
    const marketingCsp = buildMarketingCsp();
    expect(portalCsp).toContain(`'strict-dynamic'`);
    expect(marketingCsp).not.toContain(`'strict-dynamic'`);
  });

  it('emits Trusted Types directive identical to marketing', () => {
    const csp = buildPortalCsp('nonce');
    expect(csp).toContain(`require-trusted-types-for 'script'`);
  });
});

describe('isPortalRoute', () => {
  it('classifies portal paths', () => {
    expect(isPortalRoute('/en/account')).toBe(true);
    expect(isPortalRoute('/en/account/security')).toBe(true);
    expect(isPortalRoute('/api/auth/callback')).toBe(true);
    expect(isPortalRoute('/api/webhooks/stripe')).toBe(true);
  });

  it('classifies marketing paths', () => {
    expect(isPortalRoute('/')).toBe(false);
    expect(isPortalRoute('/en')).toBe(false);
    expect(isPortalRoute('/en/features')).toBe(false);
    expect(isPortalRoute('/en/legal/privacy')).toBe(false);
  });

  it('does not classify /accountant or /accounts as portal (word-boundary discipline)', () => {
    expect(isPortalRoute('/en/accountant')).toBe(false);
    expect(isPortalRoute('/en/accounts/list')).toBe(false);
  });

  it('does not over-match /api/auth-internal or /api/webhooks-other (trailing-slash discipline)', () => {
    // Round-5 HIPAA/CSP reviewer flagged the original prefix matches as
    // over-broad; verify the tightened trailing-slash version.
    expect(isPortalRoute('/api/auth-internal')).toBe(false);
    expect(isPortalRoute('/api/webhooks-other')).toBe(false);
    expect(isPortalRoute('/api/authentication')).toBe(false);
  });
});

describe('generateNonce', () => {
  it('produces a base64-url-safe nonce', () => {
    const nonce = generateNonce();
    // 16 bytes -> 22 base64 chars (without padding) or 24 with padding stripped
    expect(nonce.length).toBeGreaterThanOrEqual(20);
    expect(nonce).not.toMatch(/[+/=]/); // url-safe encoding (+ / = not present)
  });

  it('produces unique values on each call (sanity check)', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toEqual(b);
  });
});

describe('Sentry CSP report-uri env var handling', () => {
  // SENTRY_CSP_REPORT_URI is read at module-load, so we cannot test the
  // presence-vs-absence behavior via vi.stubEnv after import. Document
  // the invariant via a smoke check on the current value (`''` by default
  // in CI without the env var set) and a sanitization assertion.
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('omits report-uri when SENTRY_CSP_REPORT_URI is unset (default)', async () => {
    vi.stubEnv('SENTRY_CSP_REPORT_URI', '');
    // Re-import to pick up the new env value
    const mod = await import('@/lib/security/csp');
    const csp = mod.buildMarketingCsp();
    expect(csp).not.toContain('report-uri');
  });

  it('rejects injected CSP directives in env value (sanitization)', async () => {
    // A malicious env value attempting to inject a second directive must
    // be filtered out by sanitizeCspValue — the resulting CSP must not
    // contain the injected payload.
    vi.stubEnv('SENTRY_CSP_REPORT_URI', 'https://evil.example.com/r; script-src *');
    const mod = await import('@/lib/security/csp');
    const csp = mod.buildMarketingCsp();
    expect(csp).not.toContain('script-src *');
    expect(csp).not.toContain('evil.example.com');
  });
});
