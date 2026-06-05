// `server-only` blocks any client-component import path — the state Map is
// a process-scoped singleton + must never instantiate in a client bundle.
// The /server barrel re-export already carries this guard; restating it
// here is defense-in-depth against a future direct-import bypass.
import 'server-only';

/**
 * In-memory `GuestStateStore` adapter.
 *
 * Production wiring at the scaffold stage — the DynamoDB adapter activates
 * once the `guest-state` table ships in `quilty-aws/website-baseline/`.
 *
 * Edge-runtime safe (Map Web API + plain JS only); `server-only` blocks
 * Client-Component imports but allows the server + edge runtimes.
 *
 * `set()` enforces the zero-PHI contract via `assertGuestStateNonHealth`
 * BEFORE persisting, so a health-shaped snapshot is rejected loudly rather
 * than stored.
 */

import { assertGuestStateNonHealth } from '../domain/assert-non-health';
import type { GuestStateId, GuestStateSnapshot, GuestStateStore } from '../ports';

function keyOf(id: GuestStateId): string {
  return id.guest_id;
}

export function makeInMemoryGuestStateStore(): GuestStateStore {
  const current = new Map<string, GuestStateSnapshot>();

  return {
    get: async (id) => {
      return current.get(keyOf(id)) ?? null;
    },
    set: async (id, state) => {
      // Hard zero-PHI contract — reject health-shaped fields before persist.
      assertGuestStateNonHealth(state);
      current.set(keyOf(id), state);
    },
    delete: async (id) => {
      current.delete(keyOf(id));
    },
  };
}
