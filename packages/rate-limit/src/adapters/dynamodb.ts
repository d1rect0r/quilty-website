/**
 * DynamoDB RateLimiter adapter — typed-throwing skeleton at M1.5.
 *
 * The `consume()` method rejects until two gates are green:
 *
 *   1. The `quilty_rate_limit` DynamoDB table is provisioned in the
 *      development account (Phase 0) or `marketing-prod` account
 *      (Phase 1 cutover) with the appropriate IAM policy on the
 *      Lambda execution role + a TTL attribute configured for
 *      automatic per-key cleanup.
 *   2. The Lambda execution role is granted `dynamodb:GetItem` +
 *      `PutItem` + `UpdateItem` against the rate-limit table only
 *      (scope-of-least-privilege; the role MUST NOT have wildcard
 *      DynamoDB access).
 *
 * Activation implementation (deferred): conditional writes against a
 * per-key item carrying a `timestamps` list attribute; UpdateExpression
 * prunes entries older than the window inline; ReturnValues=ALL_NEW
 * reads the post-update state for the decision. The DynamoDB-native
 * conditional-write pattern is the canonical multi-Lambda rate-limit
 * implementation; no Redis dependency required.
 *
 * Naming discipline (META-1): "DynamoDB" appears only in this file
 * path + adapter-internal identifiers. The port + factory are
 * vendor-agnostic.
 */

import type { RateLimitDecision, RateLimitPolicy, RateLimiter } from '../ports.js';

export interface DynamoDbAdapterOptions {
  /** AWS region. */
  readonly region: string;
  /** DynamoDB table name (typically `quilty_rate_limit`). */
  readonly tableName: string;
}

export function makeDynamoDbRateLimiter(options: DynamoDbAdapterOptions): RateLimiter {
  const skeletonNote = `DynamoDB rate-limit adapter is a skeleton at M1.5 (region ${options.region}, table ${options.tableName}); table provisioning + Lambda IAM grant required before activation.`;

  return {
    consume: (_key: string, _policy: RateLimitPolicy): Promise<RateLimitDecision> =>
      Promise.reject(new Error(skeletonNote)),
  };
}
