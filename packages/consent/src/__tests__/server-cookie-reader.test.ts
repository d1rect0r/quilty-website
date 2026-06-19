import { describe, expect, it } from 'vitest';
import { makeServerConsentReader } from '../server/cookie-reader';
import { TAXONOMY_VERSION } from '../domain/cookie-taxonomy';

describe('makeServerConsentReader', () => {
  function makeInput(gpc: '1' | '0' | null, cookieValue: string | null) {
    return {
      headers: () =>
        Promise.resolve({
          // Enforce the contract: the reader MUST query `sec-gpc`
          // specifically. Any other header name returns null and the
          // GPC override fails its tests — a regression on the key
          // would surface here.
          get: (name: string) => (name.toLowerCase() === 'sec-gpc' ? gpc : null),
        }),
      readConsentCookie: () => Promise.resolve(cookieValue),
    };
  }

  function encodeCookieState(state: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(state), 'utf-8').toString('base64');
  }

  describe('cookie absent', () => {
    it('returns default-deny when GPC absent + no cookie', async () => {
      const reader = makeServerConsentReader(makeInput(null, null));
      const snapshot = await reader.read();
      expect(snapshot.functional).toBe(false);
      expect(snapshot.analytics).toBe(false);
      expect(snapshot.marketing).toBe(false);
      expect(snapshot.personalization).toBe(false);
      expect(snapshot.gpc_detected).toBe(false);
      expect(snapshot.gpc_honored).toBe(false);
    });

    it('stamps essential: true even without a cookie', async () => {
      const reader = makeServerConsentReader(makeInput(null, null));
      expect((await reader.read()).essential).toBe(true);
    });

    it('sets gpc_detected + gpc_honored: true when Sec-GPC: 1 is present without cookie', async () => {
      const reader = makeServerConsentReader(makeInput('1', null));
      const snapshot = await reader.read();
      expect(snapshot.gpc_detected).toBe(true);
      expect(snapshot.gpc_honored).toBe(true);
    });

    it('keeps functional enabled but denies sale/share categories for a GPC visitor without a cookie', async () => {
      // GPC opts out of sale/share (analytics/marketing/personalization)
      // only, not first-party functional cookies — so the no-cookie+GPC
      // reader state must match what proxy.ts / cf-functions persist on the
      // same request (functional:true). This pins the distinction from the
      // no-signal default-deny path above (functional:false).
      const reader = makeServerConsentReader(makeInput('1', null));
      const snapshot = await reader.read();
      expect(snapshot.functional).toBe(true);
      expect(snapshot.analytics).toBe(false);
      expect(snapshot.marketing).toBe(false);
      expect(snapshot.personalization).toBe(false);
    });

    it('treats Sec-GPC: 0 as no opt-out asserted (gpc_detected: false)', async () => {
      const reader = makeServerConsentReader(makeInput('0', null));
      const snapshot = await reader.read();
      expect(snapshot.gpc_detected).toBe(false);
      expect(snapshot.gpc_honored).toBe(false);
    });

    it('stamps the locked taxonomy version', async () => {
      const reader = makeServerConsentReader(makeInput(null, null));
      expect((await reader.read()).version).toBe(TAXONOMY_VERSION);
    });
  });

  describe('cookie present', () => {
    it('honors per-category grants when GPC absent', async () => {
      const cookie = encodeCookieState({
        functional: true,
        analytics: true,
        marketing: false,
        personalization: true,
        gpc_honored: false,
        updated_at: '2026-05-22T00:00:00.000Z',
      });
      const reader = makeServerConsentReader(makeInput(null, cookie));
      const snapshot = await reader.read();
      expect(snapshot.functional).toBe(true);
      expect(snapshot.analytics).toBe(true);
      expect(snapshot.marketing).toBe(false);
      expect(snapshot.personalization).toBe(true);
      expect(snapshot.updated_at).toBe('2026-05-22T00:00:00.000Z');
    });

    it('forces analytics + marketing + personalization to false when GPC asserted on the request', async () => {
      const cookie = encodeCookieState({
        functional: true,
        analytics: true,
        marketing: true,
        personalization: true,
        gpc_honored: false,
      });
      const reader = makeServerConsentReader(makeInput('1', cookie));
      const snapshot = await reader.read();
      // Persisted explicit grants → forced off by live GPC signal
      expect(snapshot.analytics).toBe(false);
      expect(snapshot.marketing).toBe(false);
      expect(snapshot.personalization).toBe(false);
      // Functional + essential survive GPC (no sale/share involvement)
      expect(snapshot.functional).toBe(true);
      expect(snapshot.essential).toBe(true);
      expect(snapshot.gpc_honored).toBe(true);
    });

    it('forces analytics off when persisted gpc_honored: true even if Sec-GPC header is absent on this request', async () => {
      const cookie = encodeCookieState({
        functional: true,
        analytics: true, // tampered/legacy value
        marketing: true,
        personalization: true,
        gpc_honored: true,
      });
      const reader = makeServerConsentReader(makeInput(null, cookie));
      const snapshot = await reader.read();
      expect(snapshot.analytics).toBe(false);
      expect(snapshot.marketing).toBe(false);
      expect(snapshot.personalization).toBe(false);
      expect(snapshot.gpc_detected).toBe(false);
      expect(snapshot.gpc_honored).toBe(true);
    });

    it('falls back to default-deny when the cookie is malformed', async () => {
      const reader = makeServerConsentReader(makeInput(null, 'not-base64-json!!!'));
      const snapshot = await reader.read();
      expect(snapshot.analytics).toBe(false);
      expect(snapshot.marketing).toBe(false);
    });

    it('rejects updated_at strings that do not match strict ISO 8601 UTC', async () => {
      const cookie = encodeCookieState({
        functional: true,
        analytics: true,
        marketing: false,
        personalization: false,
        gpc_honored: false,
        // Crafted value designed to defeat the future 180-day re-consent
        // logic: a non-ISO string would coerce to NaN under new Date() +
        // produce unpredictable date arithmetic.
        updated_at: '; gpc_honored: true; ',
      });
      const reader = makeServerConsentReader(makeInput(null, cookie));
      const snapshot = await reader.read();
      expect(snapshot.updated_at).toBeNull();
    });

    it('accepts updated_at strings in strict ISO 8601 UTC form', async () => {
      const cookie = encodeCookieState({
        functional: true,
        analytics: true,
        marketing: false,
        personalization: false,
        gpc_honored: false,
        updated_at: '2026-05-22T12:34:56Z',
      });
      const reader = makeServerConsentReader(makeInput(null, cookie));
      const snapshot = await reader.read();
      expect(snapshot.updated_at).toBe('2026-05-22T12:34:56Z');
    });
  });

  describe('v0 → v1 grandfathering (D98)', () => {
    it('migrates a legacy v0-shaped cookie to v1 state on read', async () => {
      const v0Cookie = encodeCookieState({
        necessary: true,
        analytics: true,
        marketing: false,
        preferences: true,
      });
      const reader = makeServerConsentReader(makeInput(null, v0Cookie));
      const snapshot = await reader.read();
      // v0 `necessary` → v1 `essential` (rename + value preserved)
      expect(snapshot.essential).toBe(true);
      // v0 `preferences` → v1 `functional` (semantic match)
      expect(snapshot.functional).toBe(true);
      // analytics + marketing pass through unchanged
      expect(snapshot.analytics).toBe(true);
      expect(snapshot.marketing).toBe(false);
      // NEW `personalization` defaults false (re-consent trigger)
      expect(snapshot.personalization).toBe(false);
    });

    it('still applies the GPC override after v0 migration', async () => {
      const v0Cookie = encodeCookieState({
        necessary: true,
        analytics: true,
        marketing: true,
        preferences: true,
      });
      const reader = makeServerConsentReader(makeInput('1', v0Cookie));
      const snapshot = await reader.read();
      expect(snapshot.analytics).toBe(false);
      expect(snapshot.marketing).toBe(false);
      expect(snapshot.personalization).toBe(false);
      expect(snapshot.gpc_honored).toBe(true);
    });
  });
});
