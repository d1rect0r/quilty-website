import { describe, expect, it } from 'vitest';
import { makeSesEmailSender } from '../adapters/ses.js';

describe('makeSesEmailSender (skeleton — throws until sandbox-lift + BAA)', () => {
  it('constructs without throwing (allows composition root wiring to typecheck)', () => {
    expect(() =>
      makeSesEmailSender({
        region: 'us-east-1',
        fromAddress: 'no-reply@my-quilty.com',
      }),
    ).not.toThrow();
  });

  it('rejects send() with a reason that names the BAA + sandbox-lift gates', async () => {
    const sender = makeSesEmailSender({
      region: 'us-east-1',
      fromAddress: 'no-reply@my-quilty.com',
    });
    await expect(
      sender.send({
        kind: 'email_verification',
        to: 'user@example.com',
        templateData: { code: '123456' },
      }),
    ).rejects.toThrow(/BAA execution|sandbox lift/);
  });

  it('rejects even for empty payloads (skeleton is total)', async () => {
    const sender = makeSesEmailSender({
      region: 'eu-west-1',
      fromAddress: 'no-reply@my-quilty.com',
    });
    await expect(
      sender.send({
        kind: 'password_reset',
        to: 'x@y.com',
        templateData: {},
      }),
    ).rejects.toThrow();
  });
});
