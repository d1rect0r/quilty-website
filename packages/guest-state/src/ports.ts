/**
 * @quilty/guest-state ports.
 *
 * The thin anonymous guest-state carrier (ADR-0029 Decision F). An opaque
 * guest-session id (the `__Host-quilty_sid_guest` cookie value, minted in
 * `proxy.ts`) keys a server-side store of NON-health UI/navigation state so
 * a not-yet-signed-in visitor's progress survives across requests without a
 * round-trip to the authenticated backend.
 *
 * Hard boundaries (D31 zero-PHI extended to the guest tier):
 *   - The carrier holds ONLY non-health UI/nav state. Health-shaped fields
 *     are forbidden — `set()` runs `assertGuestStateNonHealth` and throws on
 *     any sensitive key (enforced ALWAYS, not just in dev). The cookie value
 *     itself is an opaque id and carries no state.
 *   - There is NO `migrate()` method. Promoting anonymous → authenticated
 *     state (the "promotion bridge") is deliberately deferred to the
 *     auth-integration milestone (ADR-0029 Decision F); the port stays
 *     get/set/delete so a half-built bridge can't leak guest state into an
 *     authenticated identity prematurely.
 */

/**
 * Identity of a guest-state record: the opaque guest-session id (the
 * `__Host-quilty_sid_guest` cookie value — base64url, no PII). A small
 * wrapper rather than a bare string so a future second identifier (e.g. a
 * device id) is an additive change, and so call sites read intentionally.
 */
export interface GuestStateId {
  readonly guest_id: string;
}

/**
 * Generic, NON-health UTM/referrer attribution captured at first touch.
 * Marketing attribution only — never anything health-implying.
 */
export interface GuestAttribution {
  readonly source?: string;
  readonly medium?: string;
  readonly campaign?: string;
  readonly content?: string;
  readonly term?: string;
  readonly referrer?: string;
}

/**
 * Snapshot of an anonymous visitor's NON-health UI/nav state.
 *
 * The shape is intentionally CLOSED to non-health concepts. `selections`
 * is a generic string→string map for UI choices (e.g. a chosen plan card,
 * a toggled preference) — it is contract-forbidden from holding health
 * data, enforced at write time by `assertGuestStateNonHealth` (which deep-
 * walks keys + values against the shared sensitive-key denylist). Adding a
 * field here that could carry health state is a contract violation.
 */
export interface GuestStateSnapshot {
  /** Generic onboarding/quiz step index — progress only, NOT answers. */
  readonly quiz_step?: number;
  /** Generic non-health UI selections (plan card, toggles, etc.). */
  readonly selections?: Readonly<Record<string, string>>;
  /** First-touch marketing attribution (non-health). */
  readonly attribution?: GuestAttribution;
  /** ISO 8601 creation timestamp. */
  readonly created_at: string;
  /** ISO 8601 last-write timestamp. */
  readonly updated_at: string;
}

/**
 * Persistence port for the guest-state carrier. get/set/delete only — NO
 * migrate (see the module docblock). Fail-closed: a thrown read returns
 * `null` at the adapter; a thrown write (incl. the health-field guard)
 * propagates so the caller surfaces it.
 *
 * The in-memory adapter is the production wiring at the scaffold stage; the
 * DynamoDB adapter is a reserved skeleton that activates when the
 * `guest-state` table ships in `quilty-aws/website-baseline/`.
 */
export interface GuestStateStore {
  readonly get: (id: GuestStateId) => Promise<GuestStateSnapshot | null>;
  readonly set: (id: GuestStateId, state: GuestStateSnapshot) => Promise<void>;
  readonly delete: (id: GuestStateId) => Promise<void>;
}
