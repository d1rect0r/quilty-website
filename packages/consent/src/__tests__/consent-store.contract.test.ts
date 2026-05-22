import { describe, expect, it } from 'vitest';
import { makeInMemoryConsentStore } from '../adapters/in-memory';
import { TAXONOMY_VERSION } from '../domain/cookie-taxonomy';
import type { ConsentIdentifier, ConsentSnapshot, ConsentStore } from '../ports';

/**
 * Parameterized contract test for the `ConsentStore` port. The same
 * test matrix runs against every adapter — at the scaffold stage,
 * only the in-memory adapter is real (the DynamoDB adapter throws
 * NotImplementedError + is excluded from this contract until the
 * table provisioning ships).
 *
 * When the DynamoDB adapter activates, register it via:
 *
 *   registerAdapter('dynamodb', () => makeDynamoDBConsentStore({...}));
 *
 * and the entire contract suite re-runs against the new wiring.
 */

const adapters: readonly (readonly [string, () => ConsentStore])[] = [
  ['in-memory', () => makeInMemoryConsentStore()],
];

const COOKIE_ID: ConsentIdentifier = {
  type: 'cookie',
  cookie_id: 'aGVsbG8td29ybGQ=',
};
const USER_ID: ConsentIdentifier = {
  type: 'user',
  user_id_hash: 'sha256:abcdef0123456789',
};

function granted(overrides: Partial<ConsentSnapshot> = {}): ConsentSnapshot {
  return {
    essential: true,
    functional: true,
    analytics: true,
    marketing: true,
    personalization: true,
    gpc_detected: false,
    gpc_honored: false,
    version: TAXONOMY_VERSION,
    updated_at: '2026-05-22T12:00:00Z',
    ...overrides,
  };
}

function denied(overrides: Partial<ConsentSnapshot> = {}): ConsentSnapshot {
  return {
    essential: true,
    functional: false,
    analytics: false,
    marketing: false,
    personalization: false,
    gpc_detected: false,
    gpc_honored: false,
    version: TAXONOMY_VERSION,
    updated_at: '2026-05-22T11:00:00Z',
    ...overrides,
  };
}

for (const [name, factory] of adapters) {
  describe(`ConsentStore adapter contract (${name})`, () => {
    it('get() returns null for an unknown identifier', async () => {
      const store = factory();
      expect(await store.get(COOKIE_ID)).toBeNull();
    });

    it('set() then get() round-trips the snapshot', async () => {
      const store = factory();
      const state = granted();
      await store.set(COOKIE_ID, state);
      expect(await store.get(COOKIE_ID)).toEqual(state);
    });

    it('set() overwrites a prior record at the same identifier', async () => {
      const store = factory();
      await store.set(COOKIE_ID, granted());
      await store.set(COOKIE_ID, denied());
      const out = await store.get(COOKIE_ID);
      expect(out?.analytics).toBe(false);
      expect(out?.marketing).toBe(false);
    });

    it('delete() removes the current record', async () => {
      const store = factory();
      await store.set(COOKIE_ID, granted());
      await store.delete(COOKIE_ID);
      expect(await store.get(COOKIE_ID)).toBeNull();
    });

    it('isolates records by identifier type (cookie + user records do not collide)', async () => {
      const store = factory();
      await store.set(COOKIE_ID, granted());
      await store.set(USER_ID, denied());
      expect((await store.get(COOKIE_ID))?.analytics).toBe(true);
      expect((await store.get(USER_ID))?.analytics).toBe(false);
    });

    describe('migrate(from, to)', () => {
      it('no-ops when the source record does not exist', async () => {
        const store = factory();
        await store.migrate(COOKIE_ID, USER_ID);
        expect(await store.get(USER_ID)).toBeNull();
      });

      it('copies the source snapshot to the destination when the destination is empty', async () => {
        const store = factory();
        await store.set(COOKIE_ID, granted());
        await store.migrate(COOKIE_ID, USER_ID);
        const out = await store.get(USER_ID);
        expect(out?.analytics).toBe(true);
      });

      it('GPC honored on either side always wins on merge', async () => {
        const store = factory();
        await store.set(COOKIE_ID, granted({ gpc_honored: true }));
        await store.set(USER_ID, granted());
        await store.migrate(COOKIE_ID, USER_ID);
        const out = await store.get(USER_ID);
        expect(out?.gpc_honored).toBe(true);
        expect(out?.analytics).toBe(false);
        expect(out?.marketing).toBe(false);
        expect(out?.personalization).toBe(false);
      });

      it('explicit grant in the source beats default-deny in the destination', async () => {
        const store = factory();
        await store.set(COOKIE_ID, granted());
        await store.set(USER_ID, denied());
        await store.migrate(COOKIE_ID, USER_ID);
        const out = await store.get(USER_ID);
        expect(out?.analytics).toBe(true);
        expect(out?.marketing).toBe(true);
        expect(out?.personalization).toBe(true);
      });

      it('most-recent updated_at wins on the merged record', async () => {
        const store = factory();
        await store.set(COOKIE_ID, granted({ updated_at: '2026-05-22T12:00:00Z' }));
        await store.set(USER_ID, granted({ updated_at: '2026-05-21T00:00:00Z' }));
        await store.migrate(COOKIE_ID, USER_ID);
        expect((await store.get(USER_ID))?.updated_at).toBe('2026-05-22T12:00:00Z');
      });

      it('source record is retained after migrate (cookie-tier read path continues to work)', async () => {
        const store = factory();
        const state = granted();
        await store.set(COOKIE_ID, state);
        await store.migrate(COOKIE_ID, USER_ID);
        expect(await store.get(COOKIE_ID)).toEqual(state);
      });

      it('merged snapshot stamps gpc_detected: false (the live signal must be re-read per request)', async () => {
        const store = factory();
        await store.set(COOKIE_ID, granted({ gpc_detected: true }));
        await store.migrate(COOKIE_ID, USER_ID);
        expect((await store.get(USER_ID))?.gpc_detected).toBe(false);
      });
    });
  });
}
