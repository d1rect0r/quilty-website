import { describe, expect, it } from 'vitest';
import { makeTurnstileCaptchaVerifier } from '../adapters/turnstile.js';

describe('makeTurnstileCaptchaVerifier (skeleton — rejects until BAA + secret provisioning)', () => {
  it('constructs without throwing (composition root wiring typechecks)', () => {
    expect(() => makeTurnstileCaptchaVerifier({ secretKey: 'placeholder' })).not.toThrow();
  });

  it('rejects verify() with a reason that names the BAA + secret-key gates', async () => {
    const verifier = makeTurnstileCaptchaVerifier({ secretKey: 'placeholder' });
    await expect(
      verifier.verify('any-token', { action: 'signup', remoteIp: '203.0.113.1' }),
    ).rejects.toThrow(/BAA|secret|skeleton/i);
  });

  it('reports [MISSING] in the skeleton note when secretKey is empty', async () => {
    const verifier = makeTurnstileCaptchaVerifier({ secretKey: '' });
    await expect(
      verifier.verify('t', { action: 'signup', remoteIp: '203.0.113.1' }),
    ).rejects.toThrow(/MISSING/);
  });

  it('reports [REDACTED] in the skeleton note when secretKey is provided (never echoes the key value)', async () => {
    const verifier = makeTurnstileCaptchaVerifier({ secretKey: 'super-secret-do-not-leak' });
    let captured: unknown;
    try {
      await verifier.verify('t', { action: 'signup', remoteIp: '203.0.113.1' });
    } catch (err) {
      captured = err;
    }
    expect(String(captured)).toMatch(/REDACTED/);
    expect(String(captured)).not.toMatch(/super-secret-do-not-leak/);
  });
});
