import { afterEach, describe, expect, it } from 'vitest';
import { makeInMemoryEmailSender } from '../adapters/in-memory.js';

describe('makeInMemoryEmailSender', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalOverride = process.env['QUILTY_ALLOW_INMEMORY_EMAIL_IN_PROD'];

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalNodeEnv;
    }
    if (originalOverride === undefined) {
      delete process.env['QUILTY_ALLOW_INMEMORY_EMAIL_IN_PROD'];
    } else {
      process.env['QUILTY_ALLOW_INMEMORY_EMAIL_IN_PROD'] = originalOverride;
    }
  });

  it('returns ok with a provider id on every send', async () => {
    const sender = makeInMemoryEmailSender();
    const result = await sender.send({
      kind: 'email_verification',
      to: 'user@example.com',
      templateData: { code: '123456' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerId).toMatch(/^inmem-\d+$/);
    }
  });

  it('records every send for inspection', async () => {
    const sender = makeInMemoryEmailSender();
    await sender.send({
      kind: 'password_reset',
      to: 'a@b.com',
      templateData: { resetUrl: 'https://my-quilty.com/reset?token=…' },
    });
    await sender.send({
      kind: 'sign_in_from_new_device_alert',
      to: 'a@b.com',
      templateData: { device: 'Chrome on Mac' },
    });
    expect(sender.records).toHaveLength(2);
    expect(sender.records[0]?.envelope.kind).toBe('password_reset');
    expect(sender.records[1]?.envelope.kind).toBe('sign_in_from_new_device_alert');
  });

  it('reset() clears the record buffer', async () => {
    const sender = makeInMemoryEmailSender();
    await sender.send({
      kind: 'email_verification',
      to: 'x@y.com',
      templateData: { code: '000000' },
    });
    expect(sender.records).toHaveLength(1);
    sender.reset();
    expect(sender.records).toHaveLength(0);
  });

  it('emits monotonically distinct provider ids across calls', async () => {
    const sender = makeInMemoryEmailSender();
    const a = await sender.send({
      kind: 'email_verification',
      to: 'a@b.com',
      templateData: { code: '1' },
    });
    const b = await sender.send({
      kind: 'email_verification',
      to: 'a@b.com',
      templateData: { code: '2' },
    });
    expect(a.ok && b.ok && a.providerId !== b.providerId).toBe(true);
  });

  it('produces distinct provider ids across separate sender instances', async () => {
    const senderA = makeInMemoryEmailSender();
    const senderB = makeInMemoryEmailSender();
    const a = await senderA.send({
      kind: 'email_verification',
      to: 'a@b.com',
      templateData: { code: '1' },
    });
    const b = await senderB.send({
      kind: 'email_verification',
      to: 'a@b.com',
      templateData: { code: '2' },
    });
    expect(a.ok && b.ok && a.providerId !== b.providerId).toBe(true);
  });

  it('refuses to send under NODE_ENV=production without the explicit override', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['QUILTY_ALLOW_INMEMORY_EMAIL_IN_PROD'];
    const sender = makeInMemoryEmailSender();
    await expect(
      sender.send({
        kind: 'email_verification',
        to: 'a@b.com',
        templateData: { code: '1' },
      }),
    ).rejects.toThrow(/NODE_ENV=production/);
  });

  it('allows sends under NODE_ENV=production when the override is set to "1"', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['QUILTY_ALLOW_INMEMORY_EMAIL_IN_PROD'] = '1';
    const sender = makeInMemoryEmailSender();
    const result = await sender.send({
      kind: 'email_verification',
      to: 'a@b.com',
      templateData: { code: '1' },
    });
    expect(result.ok).toBe(true);
  });

  it('captures sentAt as an ISO-8601 string', async () => {
    const sender = makeInMemoryEmailSender();
    await sender.send({
      kind: 'subscription_renewal_receipt',
      to: 'pay@example.com',
      templateData: { amount: 1200, currency: 'USD' },
    });
    const record = sender.records[0];
    expect(record).toBeDefined();
    expect(record?.sentAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
  });
});
