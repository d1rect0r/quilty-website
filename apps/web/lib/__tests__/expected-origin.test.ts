import { afterEach, describe, expect, it, vi } from 'vitest';
import { readExpectedOrigin } from '../expected-origin';

describe('readExpectedOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('derives the origin from NEXT_PUBLIC_SITE_URL (the canonical URL)', () => {
    vi.stubEnv('QUILTY_SITE_ORIGIN', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://my-quilty.com');
    expect(readExpectedOrigin()).toBe('https://my-quilty.com');
  });

  it('normalizes a path/trailing slash away — exact origin only', () => {
    vi.stubEnv('QUILTY_SITE_ORIGIN', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://my-quilty.com/some/path/');
    expect(readExpectedOrigin()).toBe('https://my-quilty.com');
  });

  it('prefers the QUILTY_SITE_ORIGIN override (preview-stage escape hatch)', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://my-quilty.com');
    vi.stubEnv('QUILTY_SITE_ORIGIN', 'https://d123preview.cloudfront.net');
    expect(readExpectedOrigin()).toBe('https://d123preview.cloudfront.net');
  });

  it('throws (fail-closed) when neither var is set — no localhost fallback', () => {
    vi.stubEnv('QUILTY_SITE_ORIGIN', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(() => readExpectedOrigin()).toThrow(/fail closed/i);
  });

  it('throws (fail-closed) on a malformed URL rather than pinning a garbage origin', () => {
    vi.stubEnv('QUILTY_SITE_ORIGIN', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'not-a-url');
    expect(() => readExpectedOrigin()).toThrow();
  });
});
