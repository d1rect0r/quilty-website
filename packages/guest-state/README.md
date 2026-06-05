# `@quilty/guest-state` — thin anonymous guest-state carrier

An opaque guest-session id (the `__Host-quilty_sid_guest` cookie, minted in
`apps/web/proxy.ts`) keys a server-side store of **non-health** UI/navigation
state, so a not-yet-signed-in visitor's progress (quiz step, generic UI
selections, first-touch UTM/referrer) survives across requests without a
round-trip to the authenticated backend. See **ADR-0029 Decision F**.

## Hard boundaries

- **Zero-PHI (D31).** The carrier holds only non-health state. `set()` runs
  `assertGuestStateNonHealth` and throws — in **every** environment — on any
  health/PHI-shaped key (top level or nested), using the shared
  `isSensitiveKey` denylist from `@quilty/security`. The cookie value itself
  is an opaque id and carries no state.
- **No promotion bridge.** The port is `get` / `set` / `delete` only — there
  is intentionally **no `migrate()`**. Promoting anonymous → authenticated
  state is deferred to the auth-integration milestone (ADR-0029 F) so a
  half-built bridge can't leak guest state into an authenticated identity.

## Surfaces

| Import                        | Contents                                                                                           | Runtime                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------- |
| `@quilty/guest-state`         | port types + `assertGuestStateNonHealth`                                                           | any                           |
| `@quilty/guest-state/server`  | `makeInMemoryGuestStateStore` (production now) + `makeDynamoDBGuestStateStore` (reserved skeleton) | server + edge (`server-only`) |
| `@quilty/guest-state/testing` | `makeFakeGuestStateStore`                                                                          | tests                         |

## Activation

The in-memory adapter is the production wiring at the scaffold stage; the
composition roots guard it fail-closed (ADR-0030) so it cannot silently ship
to production. The DynamoDB adapter activates when the `guest-state` table
ships in `quilty-aws/website-baseline/`.
