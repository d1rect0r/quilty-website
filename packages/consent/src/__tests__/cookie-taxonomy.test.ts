import { describe, expect, it } from 'vitest';
import { COOKIE_REGISTRY, DEFAULT_DENY_STATE } from '../domain/cookie-taxonomy.js';

describe('cookie taxonomy', () => {
  describe('DEFAULT_DENY_STATE', () => {
    it('keeps necessary cookies enabled (site function depends on them)', () => {
      expect(DEFAULT_DENY_STATE.necessary).toBe(true);
    });

    it('denies analytics + marketing + preferences by default (D35 Cerebral lesson)', () => {
      expect(DEFAULT_DENY_STATE.analytics).toBe(false);
      expect(DEFAULT_DENY_STATE.marketing).toBe(false);
      expect(DEFAULT_DENY_STATE.preferences).toBe(false);
    });
  });

  describe('COOKIE_REGISTRY', () => {
    it('declares __Host-prefixed cookies for session + CSRF (D7)', () => {
      const sessionCookie = COOKIE_REGISTRY.find((c) => c.name === '__Host-quilty_sid');
      const csrfCookie = COOKIE_REGISTRY.find((c) => c.name === '__Host-quilty_csrf');
      expect(sessionCookie).toBeDefined();
      expect(csrfCookie).toBeDefined();
    });

    it('marks every cookie as secure (no plaintext-HTTP fallback)', () => {
      for (const cookie of COOKIE_REGISTRY) {
        expect(cookie.attributes.secure).toBe(true);
      }
    });

    it('classifies every cookie into one of the four taxonomy categories', () => {
      const validCategories = new Set(['necessary', 'analytics', 'marketing', 'preferences']);
      for (const cookie of COOKIE_REGISTRY) {
        expect(validCategories.has(cookie.category)).toBe(true);
      }
    });

    it('sets sameSite to Strict or Lax for every cookie (None is reserved for cross-site flows only)', () => {
      for (const cookie of COOKIE_REGISTRY) {
        expect(['Strict', 'Lax']).toContain(cookie.attributes.sameSite);
      }
    });

    it('has no duplicate cookie names', () => {
      const names = COOKIE_REGISTRY.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });
});
