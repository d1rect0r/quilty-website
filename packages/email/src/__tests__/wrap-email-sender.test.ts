import { describe, expect, it } from 'vitest';
import { makeSanitizer } from '@quilty/security';
import { makeInMemoryEmailSender } from '../adapters/in-memory';
import { wrapEmailSender } from '../domain/wrap-email-sender';

describe('wrapEmailSender (PHI sanitizer chokepoint)', () => {
  it('passes templateData through the sanitizer before reaching the adapter', async () => {
    const adapter = makeInMemoryEmailSender();
    const sanitizer = makeSanitizer();
    const wrapped = wrapEmailSender({ adapter, sanitizer });

    await wrapped.send({
      kind: 'password_reset',
      to: 'user@example.com',
      // Field names that the sanitizer denylists at depth-1 (D67 +
      // Cerebral lesson). The sanitized record on the adapter side
      // should NOT carry the original raw values.
      templateData: {
        resetUrl: 'https://my-quilty.com/reset',
        ssn: '123-45-6789',
        credit_card: '4242424242424242',
      },
    });

    const record = adapter.records[0];
    expect(record).toBeDefined();
    const data = record?.envelope.templateData;
    expect(data?.['resetUrl']).toBe('https://my-quilty.com/reset');
    expect(data?.['ssn']).not.toBe('123-45-6789');
    expect(data?.['credit_card']).not.toBe('4242424242424242');
  });

  it('does NOT mutate the `to` address (an identifier, not free text)', async () => {
    const adapter = makeInMemoryEmailSender();
    const sanitizer = makeSanitizer();
    const wrapped = wrapEmailSender({ adapter, sanitizer });

    await wrapped.send({
      kind: 'email_verification',
      to: 'verify@my-quilty.com',
      templateData: { code: '999000' },
    });

    expect(adapter.records[0]?.envelope.to).toBe('verify@my-quilty.com');
  });

  it('preserves the original kind unchanged', async () => {
    const adapter = makeInMemoryEmailSender();
    const sanitizer = makeSanitizer();
    const wrapped = wrapEmailSender({ adapter, sanitizer });

    await wrapped.send({
      kind: 'subscription_renewal_receipt',
      to: 'pay@example.com',
      templateData: { amount: 1200 },
    });

    expect(adapter.records[0]?.envelope.kind).toBe('subscription_renewal_receipt');
  });

  it('returns the adapter result verbatim', async () => {
    const adapter = makeInMemoryEmailSender();
    const sanitizer = makeSanitizer();
    const wrapped = wrapEmailSender({ adapter, sanitizer });

    const result = await wrapped.send({
      kind: 'email_verification',
      to: 'x@y.com',
      templateData: { code: '111111' },
    });
    expect(result.ok).toBe(true);
  });
});
