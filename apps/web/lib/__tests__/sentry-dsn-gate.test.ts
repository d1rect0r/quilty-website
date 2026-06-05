import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSentryDsnCspCoherent, resolveSentryEnvironment } from '../observability/sentry-dsn-gate';

describe('isSentryDsnCspCoherent', () => {
  it('accepts a US-pinned https ingest host', () => {
    expect(isSentryDsnCspCoherent('https://abc@o12345.ingest.us.sentry.io/678')).toBe(true);
  });

  it('rejects a non-US ingest region (data residency)', () => {
    expect(isSentryDsnCspCoherent('https://abc@o12345.ingest.de.sentry.io/678')).toBe(false);
  });

  it('rejects a non-pinned host', () => {
    expect(isSentryDsnCspCoherent('https://abc@sentry.example.com/1')).toBe(false);
  });

  it('rejects http', () => {
    expect(isSentryDsnCspCoherent('http://abc@o1.ingest.us.sentry.io/1')).toBe(false);
  });

  it('rejects empty / undefined / malformed', () => {
    expect(isSentryDsnCspCoherent(undefined)).toBe(false);
    expect(isSentryDsnCspCoherent('')).toBe(false);
    expect(isSentryDsnCspCoherent('   ')).toBe(false);
    expect(isSentryDsnCspCoherent('not-a-url')).toBe(false);
  });
});

describe('resolveSentryEnvironment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the explicit NEXT_PUBLIC_SENTRY_ENVIRONMENT when set', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'preview-pr-42');
    expect(resolveSentryEnvironment()).toBe('preview-pr-42');
  });

  it("derives 'production' from NODE_ENV when the explicit var is unset", () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(resolveSentryEnvironment()).toBe('production');
  });

  it("derives 'development' from NODE_ENV otherwise", () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(resolveSentryEnvironment()).toBe('development');
  });

  it('treats NODE_ENV=test as non-production (no special test branch)', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '');
    vi.stubEnv('NODE_ENV', 'test');
    expect(resolveSentryEnvironment()).toBe('development');
  });

  it('treats a blank explicit var as unset (falls through to NODE_ENV)', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '   ');
    vi.stubEnv('NODE_ENV', 'production');
    expect(resolveSentryEnvironment()).toBe('production');
  });
});
