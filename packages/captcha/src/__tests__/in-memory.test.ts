import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeInMemoryCaptchaVerifier } from '../adapters/in-memory';

describe('makeInMemoryCaptchaVerifier', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to pass (current production wiring — no widget rendered yet)', async () => {
    const verifier = makeInMemoryCaptchaVerifier();
    const result = await verifier.verify('any-token', {
      action: 'signup',
      remoteIp: '203.0.113.1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe('signup');
    }
  });

  it('can be constructed to default-fail (test fake)', async () => {
    const verifier = makeInMemoryCaptchaVerifier({ defaultResult: 'fail' });
    const result = await verifier.verify('any-token', {
      action: 'signup',
      remoteIp: '203.0.113.1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('in_memory_default_fail');
    }
  });

  it('records every verify call for inspection', async () => {
    const verifier = makeInMemoryCaptchaVerifier();
    await verifier.verify('token-A', { action: 'signup', remoteIp: '203.0.113.1' });
    await verifier.verify('token-B', { action: 'password_reset', remoteIp: '203.0.113.2' });
    expect(verifier.records).toHaveLength(2);
    expect(verifier.records[0]?.token).toBe('token-A');
    expect(verifier.records[1]?.context.action).toBe('password_reset');
  });

  it('reset() clears the record buffer', async () => {
    const verifier = makeInMemoryCaptchaVerifier();
    await verifier.verify('t', { action: 'signup', remoteIp: '203.0.113.1' });
    expect(verifier.records).toHaveLength(1);
    verifier.reset();
    expect(verifier.records).toHaveLength(0);
  });

  it('echoes the action label on pass results (per-action token binding contract)', async () => {
    const verifier = makeInMemoryCaptchaVerifier();
    const result = await verifier.verify('t', { action: 'contact_form', remoteIp: '203.0.113.3' });
    expect(result.ok && result.action).toBe('contact_form');
  });

  it('uses the configured hostname when provided', async () => {
    const verifier = makeInMemoryCaptchaVerifier({ hostname: 'my-quilty.com' });
    const result = await verifier.verify('t', { action: 'signup', remoteIp: '203.0.113.1' });
    expect(result.ok && result.hostname).toBe('my-quilty.com');
  });

  it('refuses to verify under NODE_ENV=production without the explicit override', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('QUILTY_ALLOW_INMEMORY_CAPTCHA_IN_PROD', '');
    const verifier = makeInMemoryCaptchaVerifier();
    await expect(
      verifier.verify('t', { action: 'signup', remoteIp: '203.0.113.1' }),
    ).rejects.toThrow(/NODE_ENV=production/);
  });

  it('allows verification under NODE_ENV=production when the override is set to "1"', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('QUILTY_ALLOW_INMEMORY_CAPTCHA_IN_PROD', '1');
    const verifier = makeInMemoryCaptchaVerifier();
    const result = await verifier.verify('t', { action: 'signup', remoteIp: '203.0.113.1' });
    expect(result.ok).toBe(true);
  });
});
