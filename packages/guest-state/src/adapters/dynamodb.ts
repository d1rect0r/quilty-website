import 'server-only';

/**
 * DynamoDB `GuestStateStore` adapter — RESERVED.
 *
 * Activates when the `guest-state` table ships in
 * `quilty-aws/website-baseline/`:
 *
 *   - `guest-state` (PK `guest_id`, attributes flatten the
 *     `GuestStateSnapshot` shape) — TTL attribute drives automatic
 *     expiry of abandoned anonymous sessions (privacy-lean: guest state
 *     is short-lived by default). KMS-CMK at rest; PITR per the
 *     website-baseline TF posture.
 *
 * The adapter currently throws `NotImplementedError` for every method —
 * the composition root wires the in-memory adapter at the scaffold stage.
 * When the table ships, this module imports `@aws-sdk/client-dynamodb`
 * (Node-only); the Edge-runtime composition root continues using the
 * in-memory adapter or a fetch-based Edge-compat adapter.
 *
 * `import 'server-only'` is the build-time seal — a Client Component that
 * tries to import this file fails at build time, not at runtime.
 */

import type { GuestStateId, GuestStateSnapshot, GuestStateStore } from '../ports';

export interface DynamoDBGuestStateStoreInput {
  /**
   * Logical name of the `guest-state` DynamoDB table. Resolved by the
   * composition root + passed in at construction — keeps this module
   * Edge-runtime-compatible by not reading env directly.
   */
  readonly tableName: string;
}

class NotImplementedError extends Error {
  constructor(method: string) {
    super(
      `DynamoDB GuestStateStore.${method} not implemented — the guest-state table lands when the website-baseline Terraform layer provisions it.`,
    );
    this.name = 'NotImplementedError';
  }
}

export function makeDynamoDBGuestStateStore(_input: DynamoDBGuestStateStoreInput): GuestStateStore {
  // Parameters captured for interface compatibility; the real
  // implementation will close over them.
  return {
    get: async (_id: GuestStateId): Promise<GuestStateSnapshot | null> => {
      throw new NotImplementedError('get');
    },
    set: async (_id: GuestStateId, _state: GuestStateSnapshot): Promise<void> => {
      throw new NotImplementedError('set');
    },
    delete: async (_id: GuestStateId): Promise<void> => {
      throw new NotImplementedError('delete');
    },
  };
}
