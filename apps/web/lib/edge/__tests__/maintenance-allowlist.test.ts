import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  MAINTENANCE_BYPASS_COOKIE_NAME,
  MAINTENANCE_BYPASS_PATH_PREFIXES,
  isMaintenanceBypassPath,
} from '../maintenance-allowlist';

describe('maintenance-allowlist', () => {
  it('allows health probe paths', () => {
    expect(isMaintenanceBypassPath('/api/health')).toBe(true);
    expect(isMaintenanceBypassPath('/api/ready')).toBe(true);
    expect(isMaintenanceBypassPath('/api/live')).toBe(true);
  });

  it('allows webhook callbacks', () => {
    expect(isMaintenanceBypassPath('/api/webhooks/stripe')).toBe(true);
    expect(isMaintenanceBypassPath('/api/webhooks/cognito')).toBe(true);
  });

  it('allows .well-known paths', () => {
    expect(isMaintenanceBypassPath('/.well-known/security.txt')).toBe(true);
    expect(isMaintenanceBypassPath('/.well-known/apple-app-site-association')).toBe(true);
    expect(isMaintenanceBypassPath('/.well-known/change-password')).toBe(true);
  });

  it('allows the 503 page itself + status redirect', () => {
    expect(isMaintenanceBypassPath('/503')).toBe(true);
    expect(isMaintenanceBypassPath('/status')).toBe(true);
  });

  it('allows static assets needed to render the 503 page', () => {
    expect(isMaintenanceBypassPath('/_next/static/chunks/main.js')).toBe(true);
    expect(isMaintenanceBypassPath('/favicon.ico')).toBe(true);
    expect(isMaintenanceBypassPath('/robots.txt')).toBe(true);
    expect(isMaintenanceBypassPath('/sitemap.xml')).toBe(true);
  });

  it('blocks normal marketing + portal paths', () => {
    expect(isMaintenanceBypassPath('/en')).toBe(false);
    expect(isMaintenanceBypassPath('/en/legal/privacy')).toBe(false);
    expect(isMaintenanceBypassPath('/en/account')).toBe(false);
    expect(isMaintenanceBypassPath('/en/account/security')).toBe(false);
  });

  it('exposes the bypass cookie name + retry-after constant', () => {
    expect(MAINTENANCE_BYPASS_COOKIE_NAME).toBe('qty_ops_bypass');
    expect(DEFAULT_RETRY_AFTER_SECONDS).toBe(3600);
  });

  it('allowlist is non-empty + frozen by const-readonly typing', () => {
    expect(MAINTENANCE_BYPASS_PATH_PREFIXES.length).toBeGreaterThan(0);
  });
});
