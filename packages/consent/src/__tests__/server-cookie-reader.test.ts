import { describe, expect, it } from 'vitest';
import { makeServerConsentReader } from '../server/cookie-reader';

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

  it('returns default-deny when GPC absent + no cookie', async () => {
    const reader = makeServerConsentReader(makeInput(null, null));
    const snapshot = await reader.read();
    expect(snapshot.analytics).toBe(false);
    expect(snapshot.marketing).toBe(false);
    expect(snapshot.gpc_detected).toBe(false);
  });

  it('sets gpc_detected: true when Sec-GPC: 1 is present', async () => {
    const reader = makeServerConsentReader(makeInput('1', null));
    const snapshot = await reader.read();
    expect(snapshot.gpc_detected).toBe(true);
  });

  it('forces analytics + marketing to false when GPC asserted (CCPA §7025(c)(2))', async () => {
    const reader = makeServerConsentReader(makeInput('1', null));
    const snapshot = await reader.read();
    expect(snapshot.analytics).toBe(false);
    expect(snapshot.marketing).toBe(false);
  });

  it('treats Sec-GPC: 0 as no opt-out asserted (gpc_detected: false)', async () => {
    const reader = makeServerConsentReader(makeInput('0', null));
    const snapshot = await reader.read();
    expect(snapshot.gpc_detected).toBe(false);
  });
});
