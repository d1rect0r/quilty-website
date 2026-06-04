import { describe, expect, it } from 'vitest';
import {
  COOKIE_REGISTRY,
  DEFAULT_DENY_STATE,
  TAXONOMY_VERSION,
  migrateFromV0,
  type V0ConsentCategoryState,
} from '../domain/cookie-taxonomy';

describe('cookie taxonomy', () => {
  describe('DEFAULT_DENY_STATE', () => {
    it('keeps essential cookies enabled (site function depends on them)', () => {
      expect(DEFAULT_DENY_STATE.essential).toBe(true);
    });

    it('denies functional + analytics + marketing + personalization by default (D35 Cerebral lesson)', () => {
      expect(DEFAULT_DENY_STATE.functional).toBe(false);
      expect(DEFAULT_DENY_STATE.analytics).toBe(false);
      expect(DEFAULT_DENY_STATE.marketing).toBe(false);
      expect(DEFAULT_DENY_STATE.personalization).toBe(false);
    });
  });

  describe('TAXONOMY_VERSION', () => {
    it('is locked at v1 (D98) — bumping requires a re-consent banner per the grandfathering rule', () => {
      expect(TAXONOMY_VERSION).toBe('v1');
    });
  });

  describe('COOKIE_REGISTRY', () => {
    it('declares __Host-prefixed cookies for session + CSRF (D7)', () => {
      const sessionCookie = COOKIE_REGISTRY.find((c) => c.name === '__Host-quilty_sid');
      const csrfCookie = COOKIE_REGISTRY.find((c) => c.name === '__Host-quilty_csrf');
      expect(sessionCookie).toBeDefined();
      expect(csrfCookie).toBeDefined();
    });

    it('declares the opaque guest-session cookie (ADR-0029 F) as httpOnly + session-scoped', () => {
      const guest = COOKIE_REGISTRY.find((c) => c.name === '__Host-quilty_sid_guest');
      expect(guest).toBeDefined();
      expect(guest?.attributes.httpOnly).toBe(true);
      expect(guest?.lifetime).toBe('session');
      expect(guest?.category).toBe('essential');
    });

    it('marks every cookie as secure (no plaintext-HTTP fallback)', () => {
      for (const cookie of COOKIE_REGISTRY) {
        expect(cookie.attributes.secure).toBe(true);
      }
    });

    it('classifies every cookie into one of the five taxonomy categories', () => {
      const validCategories = new Set([
        'essential',
        'functional',
        'analytics',
        'marketing',
        'personalization',
      ]);
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

  describe('migrateFromV0 (D98 grandfathering)', () => {
    it('renames necessary → essential', () => {
      const v0: V0ConsentCategoryState = {
        necessary: true,
        analytics: false,
        marketing: false,
        preferences: false,
      };
      expect(migrateFromV0(v0).essential).toBe(true);
    });

    it('maps preferences → functional (semantic match — theme/locale/feature-toggles)', () => {
      const v0: V0ConsentCategoryState = {
        necessary: true,
        analytics: false,
        marketing: false,
        preferences: true,
      };
      expect(migrateFromV0(v0).functional).toBe(true);
    });

    it('preserves analytics + marketing values unchanged', () => {
      const v0: V0ConsentCategoryState = {
        necessary: true,
        analytics: true,
        marketing: true,
        preferences: false,
      };
      const v1 = migrateFromV0(v0);
      expect(v1.analytics).toBe(true);
      expect(v1.marketing).toBe(true);
    });

    it('defaults the NEW personalization category to false (D98: NEW categories trigger re-consent)', () => {
      const v0: V0ConsentCategoryState = {
        necessary: true,
        analytics: true,
        marketing: true,
        preferences: true,
      };
      expect(migrateFromV0(v0).personalization).toBe(false);
    });
  });
});
