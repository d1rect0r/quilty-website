import { describe, expect, it } from 'vitest';
import { makeDefaultDenyConsentReader } from '../domain/default-deny-consent';

describe('makeDefaultDenyConsentReader', () => {
  it('returns a snapshot denying every gated category', async () => {
    const reader = makeDefaultDenyConsentReader();
    const snapshot = await reader.read();
    expect(snapshot.functional).toBe(false);
    expect(snapshot.analytics).toBe(false);
    expect(snapshot.marketing).toBe(false);
    expect(snapshot.personalization).toBe(false);
  });

  it('keeps essential true (site cannot function without it)', async () => {
    const reader = makeDefaultDenyConsentReader();
    const snapshot = await reader.read();
    expect(snapshot.essential).toBe(true);
  });

  it('reports no GPC signal + no GPC honored (Sec-GPC detection is a separate concern)', async () => {
    const reader = makeDefaultDenyConsentReader();
    const snapshot = await reader.read();
    expect(snapshot.gpc_detected).toBe(false);
    expect(snapshot.gpc_honored).toBe(false);
  });

  it('stamps the locked taxonomy version (v1) + null updated_at', async () => {
    const reader = makeDefaultDenyConsentReader();
    const snapshot = await reader.read();
    expect(snapshot.version).toBe('v1');
    expect(snapshot.updated_at).toBeNull();
  });

  it('produces a structurally-equal snapshot on every call (stub is stateless)', async () => {
    const reader = makeDefaultDenyConsentReader();
    const a = await reader.read();
    const b = await reader.read();
    expect(a.functional).toBe(b.functional);
    expect(a.analytics).toBe(b.analytics);
    expect(a.marketing).toBe(b.marketing);
    expect(a.personalization).toBe(b.personalization);
    expect(a.gpc_detected).toBe(b.gpc_detected);
    expect(a.gpc_honored).toBe(b.gpc_honored);
  });
});
