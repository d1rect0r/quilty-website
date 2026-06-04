/**
 * Testing barrel — consumed by `import { … } from '@quilty/guest-state/testing'`.
 * Production code MUST NOT import from this path.
 *
 * A standalone Map-backed fake (deliberately NOT a re-export of the
 * `server-only` in-memory adapter, so the fake is usable from any test
 * environment — jsdom Client-Component tests included — without tripping
 * the `server-only` build seal). It still enforces the non-health
 * write-guard so tests exercise the same zero-PHI contract as production.
 */

import { assertGuestStateNonHealth } from '../domain/assert-non-health';
import type { GuestStateId, GuestStateSnapshot, GuestStateStore } from '../ports';

export function makeFakeGuestStateStore(): GuestStateStore {
  const current = new Map<string, GuestStateSnapshot>();
  return {
    get: async (id: GuestStateId) => current.get(id.guest_id) ?? null,
    set: async (id: GuestStateId, state: GuestStateSnapshot) => {
      assertGuestStateNonHealth(state);
      current.set(id.guest_id, state);
    },
    delete: async (id: GuestStateId) => {
      current.delete(id.guest_id);
    },
  };
}
