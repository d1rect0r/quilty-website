import { describe, expect, it } from 'vitest';
import { TAXONOMY_VERSION } from '../domain/cookie-taxonomy';
import { mergeConsentSnapshots } from '../domain/migrate';
import type { ConsentSnapshot } from '../ports';

function snapshot(overrides: Partial<ConsentSnapshot>): ConsentSnapshot {
  return {
    essential: true,
    functional: false,
    analytics: false,
    marketing: false,
    personalization: false,
    gpc_detected: false,
    gpc_honored: false,
    version: TAXONOMY_VERSION,
    updated_at: null,
    ...overrides,
  };
}

describe('mergeConsentSnapshots', () => {
  describe('GPC honored override (CCPA §7025(c)(2))', () => {
    it('forces analytics/marketing/personalization to false when source has gpc_honored', () => {
      const merged = mergeConsentSnapshots(
        snapshot({ gpc_honored: true, analytics: true, marketing: true, personalization: true }),
        snapshot({ analytics: true, marketing: true, personalization: true }),
      );
      expect(merged.gpc_honored).toBe(true);
      expect(merged.analytics).toBe(false);
      expect(merged.marketing).toBe(false);
      expect(merged.personalization).toBe(false);
    });

    it('forces analytics/marketing/personalization to false when destination has gpc_honored', () => {
      const merged = mergeConsentSnapshots(
        snapshot({ analytics: true, marketing: true, personalization: true }),
        snapshot({ gpc_honored: true }),
      );
      expect(merged.gpc_honored).toBe(true);
      expect(merged.analytics).toBe(false);
      expect(merged.marketing).toBe(false);
      expect(merged.personalization).toBe(false);
    });

    it('preserves functional + essential under GPC (not sale/share categories)', () => {
      const merged = mergeConsentSnapshots(
        snapshot({ gpc_honored: true, functional: true }),
        snapshot({ functional: false }),
      );
      expect(merged.essential).toBe(true);
      expect(merged.functional).toBe(true);
    });
  });

  describe('explicit-grant precedence (no GPC on either side)', () => {
    it('analytics: true OR false → true', () => {
      const merged = mergeConsentSnapshots(
        snapshot({ analytics: true }),
        snapshot({ analytics: false }),
      );
      expect(merged.analytics).toBe(true);
    });

    it('default-deny on both sides stays denied', () => {
      const merged = mergeConsentSnapshots(snapshot({}), snapshot({}));
      expect(merged.analytics).toBe(false);
      expect(merged.marketing).toBe(false);
      expect(merged.personalization).toBe(false);
    });

    it('functional grant propagates from either side', () => {
      const merged = mergeConsentSnapshots(snapshot({}), snapshot({ functional: true }));
      expect(merged.functional).toBe(true);
    });
  });

  describe('updated_at resolution', () => {
    it('picks the later timestamp', () => {
      const merged = mergeConsentSnapshots(
        snapshot({ updated_at: '2026-05-22T12:00:00Z' }),
        snapshot({ updated_at: '2026-05-21T12:00:00Z' }),
      );
      expect(merged.updated_at).toBe('2026-05-22T12:00:00Z');
    });

    it('null loses to a real timestamp', () => {
      const merged = mergeConsentSnapshots(
        snapshot({ updated_at: null }),
        snapshot({ updated_at: '2026-05-22T12:00:00Z' }),
      );
      expect(merged.updated_at).toBe('2026-05-22T12:00:00Z');
    });

    it('null + null stays null', () => {
      const merged = mergeConsentSnapshots(
        snapshot({ updated_at: null }),
        snapshot({ updated_at: null }),
      );
      expect(merged.updated_at).toBeNull();
    });
  });

  describe('essential + version + gpc_detected contracts', () => {
    it('essential is always true on the merged record', () => {
      const merged = mergeConsentSnapshots(snapshot({}), snapshot({}));
      expect(merged.essential).toBe(true);
    });

    it('stamps the destination taxonomy version', () => {
      const merged = mergeConsentSnapshots(snapshot({}), snapshot({}));
      expect(merged.version).toBe(TAXONOMY_VERSION);
    });

    it('always stamps gpc_detected: false (the live header is re-read per request)', () => {
      const merged = mergeConsentSnapshots(
        snapshot({ gpc_detected: true }),
        snapshot({ gpc_detected: true }),
      );
      expect(merged.gpc_detected).toBe(false);
    });
  });
});
