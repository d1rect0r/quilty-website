import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMarketingCsp,
  buildPortalCsp,
  generateNonce,
  isPortalRoute,
} from '../domain/csp-builder';

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

  it('appends additionalScriptSrc origins to script-src', () => {
    const csp = buildMarketingCsp({
      additionalScriptSrc: ['https://challenges.cloudflare.com'],
    });
    expect(csp).toMatch(/script-src 'self'\s+https:\/\/challenges\.cloudflare\.com/);
  });

  it('appends additionalConnectSrc origins to connect-src (after Sentry ingest)', () => {
    const csp = buildMarketingCsp({
      additionalConnectSrc: ['https://challenges.cloudflare.com'],
    });
    expect(csp).toContain('https://challenges.cloudflare.com');
    expect(csp).toMatch(
      /connect-src 'self'\s+https:\/\/[^;]*sentry[^;]*\s+https:\/\/challenges\.cloudflare\.com/,
    );
  });

  it('rejects malformed additionalScriptSrc entries (CSP injection guard)', () => {
    const csp = buildMarketingCsp({
      additionalScriptSrc: ['https://evil.com; default-src *'],
    });
    expect(csp).not.toContain('default-src *');
    expect(csp).not.toContain('evil.com');
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

  it('REJECTS wildcard Sentry ingest host in connect-src (portal exfiltration guard)', () => {
    // Module is loaded with the default unset SENTRY_INGEST_HOST,
    // so the wildcard fallback `https://*.ingest.us.sentry.io`
    // never reaches the portal builder. Marketing tier still
    // allows the wildcard pre-launch (informational tier); portal
    // tier MUST NOT — otherwise a misconfigured DSN exfiltrates
    // portal error payloads to any other Sentry project.
    const csp = buildPortalCsp('abc123');
    expect(csp).not.toContain('*.ingest.us.sentry.io');
    // The connect-src directive still includes 'self'.
    expect(csp).toMatch(/connect-src 'self'/);
  });
});

describe('isPortalRoute', () => {
  it('classifies portal paths', () => {
    expect(isPortalRoute('/en/account')).toBe(true);
    expect(isPortalRoute('/en/account/security')).toBe(true);
    // `/auth/*` is the BFF token-handler surface (ADR-0029, relocated from
    // `/api/auth/*`) — portal-tier because its callback runs inline script.
    expect(isPortalRoute('/auth/callback')).toBe(true);
    expect(isPortalRoute('/auth')).toBe(true);
    expect(isPortalRoute('/api/webhooks/stripe')).toBe(true);
  });

  it('classifies marketing paths', () => {
    expect(isPortalRoute('/')).toBe(false);
    expect(isPortalRoute('/en')).toBe(false);
    expect(isPortalRoute('/en/features')).toBe(false);
    expect(isPortalRoute('/en/legal/privacy')).toBe(false);
    // Precision: the `/auth` prefix must NOT over-match a marketing path.
    expect(isPortalRoute('/authors')).toBe(false);
    // The relocated-from path is no longer portal (routes moved to `/auth/*`).
    expect(isPortalRoute('/api/auth/callback')).toBe(false);
  });

  it('does not classify /accountant or /accounts as portal (word-boundary discipline)', () => {
    expect(isPortalRoute('/en/accountant')).toBe(false);
    expect(isPortalRoute('/en/accounts/list')).toBe(false);
  });

  it('does not over-match /api/auth-internal or /api/webhooks-other (trailing-slash discipline)', () => {
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
  // SENTRY_CSP_REPORT_URI is read at module-load, so re-import after
  // env-stubbing to pick up the new value.
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('omits report-uri when SENTRY_CSP_REPORT_URI is unset (default)', async () => {
    vi.stubEnv('SENTRY_CSP_REPORT_URI', '');
    const mod = await import('../domain/csp-builder');
    const csp = mod.buildMarketingCsp();
    expect(csp).not.toContain('report-uri');
  });

  it('rejects injected CSP directives in env value (sanitization)', async () => {
    // A malicious env value attempting to inject a second directive must
    // be filtered out by sanitizeCspValue — the resulting CSP must not
    // contain the injected payload.
    vi.stubEnv('SENTRY_CSP_REPORT_URI', 'https://evil.example.com/r; script-src *');
    const mod = await import('../domain/csp-builder');
    const csp = mod.buildMarketingCsp();
    expect(csp).not.toContain('script-src *');
    expect(csp).not.toContain('evil.example.com');
  });

  it('falls back to the wildcard host when SENTRY_INGEST_HOST contains injection chars', async () => {
    // Mirror coverage for the ingest-host env. If an attacker controls
    // the env value and tries to break out of connect-src, the
    // sanitizeCspValue guard must reject it and the connect-src
    // fallback (wildcard) must apply.
    vi.stubEnv('SENTRY_INGEST_HOST', 'https://hostile.example.com; default-src *');
    const mod = await import('../domain/csp-builder');
    const csp = mod.buildMarketingCsp();
    expect(csp).not.toContain('hostile.example.com');
    expect(csp).not.toContain('default-src *');
    expect(csp).toContain('connect-src');
    // The fallback wildcard is the only Sentry host that survives sanitization.
    expect(csp).toContain('https://*.ingest.us.sentry.io');
  });
});
