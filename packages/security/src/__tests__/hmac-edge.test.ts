import { describe, expect, it } from 'vitest';
import { signHmacEdge, verifyHmacEdge } from '../domain/hmac-edge';

// Short, obviously-fake test input (verifyHmacEdge imposes no length floor).
const KEY_A = 'test-a';
const KEY_B = 'test-b';

describe('signHmacEdge / verifyHmacEdge', () => {
  it('produces a `<payload>.<sig>` token that verifies under the same secret', async () => {
    const token = await signHmacEdge('ops-bypass', KEY_A);
    expect(token).toMatch(/^ops-bypass\.[A-Za-z0-9_-]+$/);
    expect(await verifyHmacEdge(token, KEY_A)).toBe(true);
  });

  it('rejects a token forged under a different secret', async () => {
    const token = await signHmacEdge('ops-bypass', KEY_B);
    expect(await verifyHmacEdge(token, KEY_A)).toBe(false);
  });

  it('rejects a tampered payload', async () => {
    const token = await signHmacEdge('ops-bypass', KEY_A);
    const sig = token.split('.')[1];
    expect(await verifyHmacEdge(`admin-bypass.${sig}`, KEY_A)).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const token = await signHmacEdge('ops-bypass', KEY_A);
    const payload = token.split('.')[0];
    expect(await verifyHmacEdge(`${payload}.AAAAtampered`, KEY_A)).toBe(false);
  });

  it('rejects malformed tokens', async () => {
    expect(await verifyHmacEdge('no-separator', KEY_A)).toBe(false);
    expect(await verifyHmacEdge('.sig-only', KEY_A)).toBe(false);
    expect(await verifyHmacEdge('payload-only.', KEY_A)).toBe(false);
    expect(await verifyHmacEdge('', KEY_A)).toBe(false);
  });

  it('rejects an empty/absent secret (no token can grant bypass)', async () => {
    const token = await signHmacEdge('ops-bypass', KEY_A);
    expect(await verifyHmacEdge(token, '')).toBe(false);
  });

  it('supports a payload carrying structure (e.g. an expiry stamp)', async () => {
    const token = await signHmacEdge('exp=1893456000', KEY_A);
    expect(await verifyHmacEdge(token, KEY_A)).toBe(true);
  });
});
