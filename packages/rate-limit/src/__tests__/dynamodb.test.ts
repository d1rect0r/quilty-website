import { describe, expect, it } from 'vitest';
import { makeDynamoDbRateLimiter } from '../adapters/dynamodb.js';

describe('makeDynamoDbRateLimiter (skeleton — rejects until table provisioning + IAM grant)', () => {
  it('constructs without throwing (composition root wiring typechecks)', () => {
    expect(() =>
      makeDynamoDbRateLimiter({
        region: 'us-east-1',
        tableName: 'quilty_rate_limit',
      }),
    ).not.toThrow();
  });

  it('rejects consume() with a reason naming the table + IAM gates', async () => {
    const limiter = makeDynamoDbRateLimiter({
      region: 'us-east-1',
      tableName: 'quilty_rate_limit',
    });
    await expect(limiter.consume('k', { limit: 3, windowMs: 60_000 })).rejects.toThrow(
      /table provisioning|IAM grant|skeleton/i,
    );
  });

  it('rejects even with an unusual policy (skeleton is total)', async () => {
    const limiter = makeDynamoDbRateLimiter({
      region: 'eu-west-1',
      tableName: 'quilty_rate_limit',
    });
    await expect(limiter.consume('k', { limit: 1, windowMs: 1_000 })).rejects.toThrow();
  });
});
