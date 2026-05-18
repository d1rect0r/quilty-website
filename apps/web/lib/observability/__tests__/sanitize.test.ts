import { describe, it, expect } from 'vitest';
import { sanitize, sanitizeAsync, isSensitiveKey } from '@/lib/observability/sanitize';

describe('isSensitiveKey', () => {
  it('matches known PHI keys', () => {
    expect(isSensitiveKey('email')).toBe(true);
    expect(isSensitiveKey('phone')).toBe(true);
    expect(isSensitiveKey('dob')).toBe(true);
    expect(isSensitiveKey('diagnosis')).toBe(true);
    expect(isSensitiveKey('medication')).toBe(true);
    expect(isSensitiveKey('mrn')).toBe(true);
    expect(isSensitiveKey('phq9')).toBe(true);
  });

  it('matches case-insensitive + dash-normalized variants', () => {
    expect(isSensitiveKey('EMAIL')).toBe(true);
    expect(isSensitiveKey('Email-Address')).toBe(true);
    expect(isSensitiveKey('date-of-birth')).toBe(true);
  });

  it('matches credential keys (defense-in-depth)', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('api_key')).toBe(true);
    expect(isSensitiveKey('access_token')).toBe(true);
    expect(isSensitiveKey('refresh_token')).toBe(true);
  });

  it('does not match common non-PHI keys', () => {
    expect(isSensitiveKey('route')).toBe(false);
    expect(isSensitiveKey('status')).toBe(false);
    expect(isSensitiveKey('duration_ms')).toBe(false);
    expect(isSensitiveKey('event_name')).toBe(false);
  });
});

describe('sanitize (sync)', () => {
  it('redacts PHI keys at any nesting depth', () => {
    const input = {
      route: '/en/account',
      email: 'user@example.com',
      nested: { phone: '+1-555-0100', diagnosis: 'panic disorder' },
      array: [{ medication: 'sertraline' }, { route: '/safe' }],
    };
    const out = sanitize(input);
    expect(out).toMatchObject({
      route: '/en/account',
      email: '[REDACTED]',
      nested: { phone: '[REDACTED]', diagnosis: '[REDACTED]' },
      array: [{ medication: '[REDACTED]' }, { route: '/safe' }],
    });
  });

  it('redacts JWT-shaped strings', () => {
    // Synthetic JWT-shaped value: starts with `ey` (matches our sanitizer
    // pattern, which requires `ey` + 3 base64url segments + length ≥ 40)
    // but NOT `eyJ` (so the repo's secret-scanner hook does not flag this
    // test fixture as a literal-looking JWT).
    const jwt = 'eyABCDEFGHIJKLMNOP.eyQRSTUVWXYZ12345.aSignatureValueHere';
    expect(sanitize(jwt)).toBe('[REDACTED]');
  });

  it('does NOT redact innocent 3-dot strings (Round-5 JWT false-positive fix)', () => {
    // Domain names, semvers, and other 3-dot non-JWT strings pass untouched.
    // Real JWTs start with `ey` (base64url of JSON `{`) and are always
    // >= 40 chars in compact form.
    expect(sanitize('auth.my-quilty.com')).toBe('auth.my-quilty.com');
    expect(sanitize('v1.0.0')).toBe('v1.0.0');
    expect(sanitize('api.example.com')).toBe('api.example.com');
  });

  it('redacts HTTP auth headers + session cookies (Round-5 reviewer fix)', () => {
    const input = {
      route: '/en/account',
      headers: {
        cookie: '__Host-quilty_session=abc',
        authorization: 'Bearer xyz',
        'x-forwarded-for': '203.0.113.5',
        'x-api-key': 'sk_live_xyz',
      },
    };
    const out = sanitize(input) as { route: string; headers: Record<string, string> };
    expect(out.route).toBe('/en/account');
    expect(out.headers.cookie).toBe('[REDACTED]');
    expect(out.headers.authorization).toBe('[REDACTED]');
    expect(out.headers['x-forwarded-for']).toBe('[REDACTED]');
    expect(out.headers['x-api-key']).toBe('[REDACTED]');
  });

  it('redacts personal name fields at any case', () => {
    const out = sanitize({
      first_name: 'Alice',
      lastName: 'Smith',
      DisplayName: 'alice42',
      username: 'aliceeee',
      route: '/en',
    }) as Record<string, string>;
    expect(out.first_name).toBe('[REDACTED]');
    expect(out.lastName).toBe('[REDACTED]');
    expect(out.DisplayName).toBe('[REDACTED]');
    expect(out.username).toBe('[REDACTED]');
    expect(out.route).toBe('/en');
  });

  it('hashes UUID-shaped strings (stable, non-reversible)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const out = sanitize(uuid) as string;
    expect(out).toMatch(/^id:[0-9a-f]{8}$/);
    // Same input → same hash (stable for debug correlation).
    expect(sanitize(uuid)).toBe(out);
  });

  it('truncates over-long free-text values', () => {
    const longText = 'a'.repeat(500);
    const out = sanitize(longText) as string;
    expect(out.length).toBeLessThan(longText.length);
    expect(out).toContain('[truncated]');
  });

  it('leaves numbers, booleans, and null untouched', () => {
    expect(sanitize(42)).toBe(42);
    expect(sanitize(true)).toBe(true);
    expect(sanitize(null)).toBe(null);
    expect(sanitize(undefined)).toBe(undefined);
  });

  it('caps recursion depth defensively', () => {
    // Build a 20-deep nested object — depth limit is 16.
    let leaf: unknown = { value: 'leaf' };
    for (let i = 0; i < 20; i++) {
      leaf = { nested: leaf };
    }
    const out = sanitize(leaf);
    // Drill in; at some level the value becomes [REDACTED] (depth cap).
    let depth = 0;
    let cur: unknown = out;
    while (depth < 20 && cur && typeof cur === 'object' && 'nested' in cur) {
      cur = (cur as { nested: unknown }).nested;
      depth++;
    }
    expect(depth).toBeLessThanOrEqual(17);
  });
});

describe('sanitizeAsync', () => {
  it('async-hashes UUID-shaped strings with SHA-256 prefix', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const out = await sanitizeAsync(uuid);
    expect(out).toMatch(/^sha256:[0-9a-f]{16}$/);
  });

  it('redacts PHI keys at any depth (parity with sync)', async () => {
    const out = await sanitizeAsync({ email: 'x@y.z', route: '/safe' });
    expect(out).toMatchObject({ email: '[REDACTED]', route: '/safe' });
  });
});
