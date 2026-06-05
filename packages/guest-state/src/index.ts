/**
 * Public barrel for @quilty/guest-state.
 *
 * Three consumer surfaces:
 *   1. `@quilty/guest-state`         — universal exports (port types +
 *      the non-health write-guard). Safe in any runtime.
 *   2. `@quilty/guest-state/server`  — the store adapters (in-memory +
 *      DynamoDB skeleton). They carry `import 'server-only'`, so importing
 *      this subpath from a Client Component is a build error.
 *   3. `@quilty/guest-state/testing` — in-memory fake for unit tests.
 *
 * The GuestStateStore + GuestStateSnapshot contracts are OWNED by this
 * package (port-owned-by-provider). See ADR-0029 Decision F for the
 * carrier rationale + the deliberately-omitted promotion bridge.
 */

export type { GuestStateStore, GuestStateSnapshot, GuestStateId, GuestAttribution } from './ports';

export { assertGuestStateNonHealth } from './domain/assert-non-health';
