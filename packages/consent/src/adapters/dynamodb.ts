import 'server-only';

/**
 * DynamoDB `ConsentStore` adapter — RESERVED.
 *
 * Activates when the two-table layout (D63) ships in
 * `quilty-aws/website-baseline/`:
 *
 *   - `consent-current` (PK `<type>:<value>`, attributes flatten the
 *     `ConsentSnapshot` shape) — the high-frequency vendor-gate read
 *     path. KMS-CMK at rest (`AWS_KMS_KEY_ID` env var; provisioned by
 *     the website-baseline TF layer). PITR enabled.
 *
 *   - `consent-audit` (PK `<type>:<value>`, SK `category#<ULID>`) —
 *     append-only history satisfying HIPAA §164.530(j) 6-year
 *     retention + GDPR Art 7(1) demonstrable-consent. Same KMS-CMK
 *     + PITR posture.
 *
 * The adapter currently throws `NotImplementedError` for every method
 * — the composition root wires the in-memory adapter at the scaffold
 * stage. When the table provisioning ships, this module imports
 * `@aws-sdk/client-dynamodb` (Node-only — Edge-runtime composition
 * root will continue using the in-memory adapter or a different
 * Edge-compat adapter that calls DynamoDB via fetch).
 *
 * `import 'server-only'` is the build-time seal — any Client Component
 * that tries to import this file fails at build time, not at runtime.
 */

import type { ConsentIdentifier, ConsentSnapshot, ConsentStore } from '../ports';

export interface DynamoDBConsentStoreInput {
  /**
   * Logical name of the `consent-current` DynamoDB table. Resolved
   * from SSM by the composition root + passed in at construction —
   * keeps this module Edge-runtime-compatible by not reading env
   * directly.
   */
  readonly currentTableName: string;
  /**
   * Logical name of the `consent-audit` DynamoDB table.
   */
  readonly auditTableName: string;
}

class NotImplementedError extends Error {
  constructor(method: string) {
    super(
      `DynamoDB ConsentStore.${method} not implemented — the two-table layout (D63 consent-current + consent-audit) lands when the website-baseline Terraform layer provisions the tables.`,
    );
    this.name = 'NotImplementedError';
  }
}

export function makeDynamoDBConsentStore(_input: DynamoDBConsentStoreInput): ConsentStore {
  // Parameters captured for interface compatibility; the real
  // implementation will close over them.
  return {
    get: async (_id: ConsentIdentifier): Promise<ConsentSnapshot | null> => {
      throw new NotImplementedError('get');
    },
    set: async (_id: ConsentIdentifier, _state: ConsentSnapshot): Promise<void> => {
      throw new NotImplementedError('set');
    },
    delete: async (_id: ConsentIdentifier): Promise<void> => {
      throw new NotImplementedError('delete');
    },
    migrate: async (_from: ConsentIdentifier, _to: ConsentIdentifier): Promise<void> => {
      throw new NotImplementedError('migrate');
    },
  };
}
