/**
 * In-memory `ConsentStore` adapter.
 *
 * Production wiring at the scaffold stage — the DynamoDB adapter
 * activates once the D63 two-table layout (`consent-current` +
 * `consent-audit`) ships in `quilty-aws/website-baseline/`.
 *
 * The adapter retains an append-only history Map per identifier so
 * the audit-log semantics (HIPAA §164.530(j) + GDPR Art 7(1)
 * demonstrable-consent) survive across the get/set cycle even though
 * the canonical audit table doesn't exist yet. Adapter-internal data
 * structure only — the audit history is not exposed via the
 * `ConsentStore` port to keep test fakes simple.
 *
 * Edge-runtime safe: uses only the `Map` Web API + plain JS objects.
 * No Node-only `Buffer` / `fs` / etc.
 */

import { mergeConsentSnapshots } from '../domain/migrate';
import type { ConsentIdentifier, ConsentSnapshot, ConsentStore } from '../ports';

/**
 * Stable string key for the identifier discriminated union. The
 * `:` separator is reserved for the type tag; the value side cannot
 * legally contain `:` per the cookie + user-id-hash shapes (cookie
 * value is base64; user_id_hash is hex), so the form is unambiguous.
 */
function keyOf(id: ConsentIdentifier): string {
  return id.type === 'cookie' ? `cookie:${id.cookie_id}` : `user:${id.user_id_hash}`;
}

export interface InMemoryConsentStore extends ConsentStore {
  /**
   * Test-only: returns the append-only history for the given
   * identifier (every `set` + `migrate` write is recorded). Not part
   * of the public port contract — production stores write history to
   * a separate persistence layer (D63 consent-audit table).
   */
  readonly __history: (id: ConsentIdentifier) => readonly ConsentSnapshot[];
}

export function makeInMemoryConsentStore(): InMemoryConsentStore {
  const current = new Map<string, ConsentSnapshot>();
  const history = new Map<string, ConsentSnapshot[]>();

  function appendHistory(key: string, state: ConsentSnapshot): void {
    const existing = history.get(key) ?? [];
    history.set(key, [...existing, state]);
  }

  return {
    get: async (id) => {
      return current.get(keyOf(id)) ?? null;
    },
    set: async (id, state) => {
      const key = keyOf(id);
      current.set(key, state);
      appendHistory(key, state);
    },
    delete: async (id) => {
      const key = keyOf(id);
      current.delete(key);
      // Audit history retained per HIPAA §164.530(j) 6-year requirement
      // — the consent-current record is gone but the trail of writes
      // that led there stays for the auditor. Production DynamoDB
      // adapter mirrors this discipline against the consent-audit table.
    },
    migrate: async (from, to) => {
      const fromKey = keyOf(from);
      const toKey = keyOf(to);
      const fromState = current.get(fromKey);
      if (fromState === undefined) {
        // No source record — nothing to migrate. The destination keeps
        // whatever state it had (typically null / default-deny).
        return;
      }
      const toState = current.get(toKey);
      // Destination empty: copy source but stamp `gpc_detected: false`
      // to honor the post-merge contract (the live header is re-read
      // per request; persisted records never carry a stale signal).
      // Destination present: delegate to mergeConsentSnapshots which
      // already stamps `gpc_detected: false`.
      const merged =
        toState === undefined
          ? { ...fromState, gpc_detected: false }
          : mergeConsentSnapshots(fromState, toState);
      current.set(toKey, merged);
      appendHistory(toKey, merged);
      // Source record retained — the cookie-tier record continues to
      // exist until the cookie itself is rotated (180 days). Clearing
      // the source here would create a window where a not-yet-deleted
      // cookie still gates analytics but the store has no record to
      // back it (fail-closed via default-deny, but operationally noisy).
    },
    __history: (id) => history.get(keyOf(id)) ?? [],
  };
}
