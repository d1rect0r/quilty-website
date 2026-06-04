import { describe, expect, it } from 'vitest';
import { assertGuestStateNonHealth } from '../domain/assert-non-health';
import { makeInMemoryGuestStateStore } from '../adapters/in-memory';
import type { GuestStateId, GuestStateSnapshot, GuestStateStore } from '../ports';

/**
 * Parameterized contract test for the `GuestStateStore` port. The same
 * matrix runs against every adapter — at the scaffold stage only the
 * in-memory adapter is real (the DynamoDB adapter throws NotImplementedError
 * and is excluded until the table ships). When it activates, add:
 *   ['dynamodb', () => makeDynamoDBGuestStateStore({ tableName: '…' })]
 */
const adapters: readonly (readonly [string, () => GuestStateStore])[] = [
  ['in-memory', () => makeInMemoryGuestStateStore()],
];

const ID: GuestStateId = { guest_id: 'Zm9vLWJhci1iYXo' };
const OTHER: GuestStateId = { guest_id: 'b3RoZXItZ3Vlc3Q' };

function snapshot(overrides: Partial<GuestStateSnapshot> = {}): GuestStateSnapshot {
  return {
    quiz_step: 2,
    selections: { plan: 'annual' },
    attribution: { source: 'newsletter', medium: 'email', campaign: 'launch' },
    created_at: '2026-06-04T00:00:00.000Z',
    updated_at: '2026-06-04T00:00:00.000Z',
    ...overrides,
  };
}

describe.each(adapters)('GuestStateStore contract — %s', (_name, make) => {
  it('returns null for an unknown id', async () => {
    const store = make();
    expect(await store.get(ID)).toBeNull();
  });

  it('round-trips set → get', async () => {
    const store = make();
    const snap = snapshot();
    await store.set(ID, snap);
    expect(await store.get(ID)).toEqual(snap);
  });

  it('isolates records by guest id', async () => {
    const store = make();
    await store.set(ID, snapshot({ quiz_step: 1 }));
    await store.set(OTHER, snapshot({ quiz_step: 9 }));
    expect((await store.get(ID))?.quiz_step).toBe(1);
    expect((await store.get(OTHER))?.quiz_step).toBe(9);
  });

  it('overwrites on a second set', async () => {
    const store = make();
    await store.set(ID, snapshot({ quiz_step: 1 }));
    await store.set(ID, snapshot({ quiz_step: 5 }));
    expect((await store.get(ID))?.quiz_step).toBe(5);
  });

  it('delete removes the record', async () => {
    const store = make();
    await store.set(ID, snapshot());
    await store.delete(ID);
    expect(await store.get(ID)).toBeNull();
  });

  it('delete on a missing id is a no-op', async () => {
    const store = make();
    await expect(store.delete(ID)).resolves.toBeUndefined();
  });

  describe('zero-PHI write contract', () => {
    it('rejects a health-shaped TOP-LEVEL field', async () => {
      const store = make();
      const bad = { ...snapshot(), diagnosis: 'asthma' } as unknown as GuestStateSnapshot;
      await expect(store.set(ID, bad)).rejects.toThrow(/health-shaped field/i);
      expect(await store.get(ID)).toBeNull(); // not persisted
    });

    it('rejects a health-shaped key NESTED in selections', async () => {
      const store = make();
      const bad = snapshot({
        selections: { condition: 'copd' } as Readonly<Record<string, string>>,
      });
      await expect(store.set(ID, bad)).rejects.toThrow(/health-shaped field/i);
    });

    it('rejects a health-shaped key nested in attribution', async () => {
      const store = make();
      const bad = {
        ...snapshot(),
        attribution: { source: 'x', medication: 'nicotine' },
      } as unknown as GuestStateSnapshot;
      await expect(store.set(ID, bad)).rejects.toThrow(/health-shaped field/i);
    });
  });
});

describe('assertGuestStateNonHealth', () => {
  it('passes a clean non-health snapshot', () => {
    expect(() => assertGuestStateNonHealth(snapshot())).not.toThrow();
  });

  it('lists the offending path in the error', () => {
    const bad = {
      ...snapshot(),
      selections: { email: 'a@b.com' },
    } as unknown as GuestStateSnapshot;
    expect(() => assertGuestStateNonHealth(bad)).toThrow(/selections\.email/);
  });

  it('walks into array values and reports the indexed path', () => {
    const bad = {
      ...snapshot(),
      items: [{ ok: 'fine' }, { diagnosis: 'asthma' }],
    } as unknown as GuestStateSnapshot;
    expect(() => assertGuestStateNonHealth(bad)).toThrow(/items\[1\]\.diagnosis/);
  });
});
