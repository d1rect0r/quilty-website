import { describe, expect, it } from 'vitest';
import { isSafeRedirect } from '../domain/redirect-validator';

const ALLOWLIST = ['https://my-quilty.com', 'https://auth.my-quilty.com'] as const;

describe('isSafeRedirect', () => {
  it('accepts an allowlisted absolute URL with https scheme', () => {
    const result = isSafeRedirect('https://my-quilty.com/account', { allowlist: [...ALLOWLIST] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pathname).toBe('/account');
    }
  });

  it('accepts a same-origin path (no scheme) by resolving against the first allowlist origin', () => {
    const result = isSafeRedirect('/account/security', { allowlist: [...ALLOWLIST] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.origin).toBe('https://my-quilty.com');
      expect(result.value.pathname).toBe('/account/security');
    }
  });

  it('rejects URLs whose scheme is not in the scheme allowlist', () => {
    const result = isSafeRedirect('http://my-quilty.com/account', { allowlist: [...ALLOWLIST] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('scheme_not_allowed');
    }
  });

  it('rejects URLs whose origin is not in the allowlist (defends against open-redirect)', () => {
    const result = isSafeRedirect('https://evil.example.com/phish', {
      allowlist: [...ALLOWLIST],
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'origin_not_allowlisted') {
      expect(result.error.origin).toBe('https://evil.example.com');
    } else {
      throw new Error(`expected origin_not_allowlisted, got ${JSON.stringify(result)}`);
    }
  });

  it('rejects malformed URLs that cannot be parsed', () => {
    // Incomplete IPv6 host triggers the URL constructor's TypeError path.
    // Most "invalid"-looking strings actually resolve as relative paths
    // against the base origin (the WHATWG URL spec is permissive); this
    // input is one of the few that reliably throws.
    const result = isSafeRedirect('http://[invalid', { allowlist: [...ALLOWLIST] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_url');
    }
  });

  it('rejects empty + whitespace-only input', () => {
    const empty = isSafeRedirect('', { allowlist: [...ALLOWLIST] });
    const blank = isSafeRedirect('   ', { allowlist: [...ALLOWLIST] });
    expect(empty.ok).toBe(false);
    expect(blank.ok).toBe(false);
  });

  it('rejects when allowlist is empty (defense-in-depth)', () => {
    const result = isSafeRedirect('https://my-quilty.com/account', { allowlist: [] });
    expect(result.ok).toBe(false);
  });

  it('permits widening the scheme allowlist for dev/loopback only', () => {
    const result = isSafeRedirect('http://localhost:3000/preview', {
      allowlist: ['http://localhost:3000'],
      allowedSchemes: ['http:'],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects javascript: URLs even if they parse (XSS defense)', () => {
    // The `javascript:` scheme is the classic open-redirect-to-XSS pivot.
    const result = isSafeRedirect('javascript:alert(1)', { allowlist: [...ALLOWLIST] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('scheme_not_allowed');
    }
  });

  it('rejects protocol-relative redirects to non-allowlisted hosts (// XSS pivot)', () => {
    // `//evil.example.com/path` resolves to `https://evil.example.com/path`
    // against the https base — the origin check then catches it. This test
    // locks the defense; a future regression that allowed protocol-relative
    // inputs would surface here.
    const result = isSafeRedirect('//evil.example.com/path', { allowlist: [...ALLOWLIST] });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'origin_not_allowlisted') {
      expect(result.error.origin).toBe('https://evil.example.com');
    } else {
      throw new Error(`expected origin_not_allowlisted, got ${JSON.stringify(result)}`);
    }
  });
});
