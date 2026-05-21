import { describe, expect, it } from 'vitest';
import { makeDefaultDenyConsentReader } from '../domain/default-deny-consent';

describe('makeDefaultDenyConsentReader', () => {
  it('returns a snapshot denying every gated category', async () => {
    const reader = makeDefaultDenyConsentReader();
    const snapshot = await reader.read();
    expect(snapshot.analytics).toBe(false);
    expect(snapshot.marketing).toBe(false);
    expect(snapshot.preferences).toBe(false);
  });

  it('reports no GPC signal (Sec-GPC detection is a separate concern)', async () => {
    const reader = makeDefaultDenyConsentReader();
    const snapshot = await reader.read();
    expect(snapshot.gpc_detected).toBe(false);
  });

  it('produces a structurally-equal snapshot on every call (stub is stateless)', async () => {
    const reader = makeDefaultDenyConsentReader();
    const a = await reader.read();
    const b = await reader.read();
    expect(a.analytics).toBe(b.analytics);
    expect(a.marketing).toBe(b.marketing);
    expect(a.preferences).toBe(b.preferences);
    expect(a.gpc_detected).toBe(b.gpc_detected);
  });
});
