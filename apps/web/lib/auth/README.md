# `apps/web/lib/auth/` — authentication + session

Reserved location for the BFF auth surface. Empty until the auth-integration milestone lands.

## Shape (when populated)

Flat modules with concrete functions — **not** ports/adapters. The R1 Wave-1-close research synthesis (Lucia, Auth.js, Cal.com reference reads) converged on the same finding: production teams reject hexagonal port abstraction at the auth layer for in-house BFFs. The textbook session/token/CSRF port surface is library shape, not BFF shape.

Expected files (Lucia-style flat layout):

```
auth/
├── README.md            (this file)
├── session.ts           getCurrentSession() / validateSessionToken() / invalidateSession() / setSessionCookie() / deleteSessionCookie()
├── cognito.ts           OAuth client wrapper — createAuthorizationURL() / validateAuthorizationCode() (the one seam worth keeping)
├── csrf.ts              double-submit token + Origin/Referer check
├── step-up.ts           elevated_until column flip on session row (D54)
├── oauth-state.ts       short-lived OIDC state + nonce + code_verifier cookies (separate from session cookie)
├── rate-limit-helpers.ts auth-adjacent rate-limit key composition
└── errors.ts            domain error types (SessionExpiredError, CsrfMismatchError, StepUpRequiredError)
```

## Discipline

- **`import 'server-only'`** at the top of every file in this directory — auth code must never bundle into a Client Component.
- **No port abstractions.** Exporting concrete functions is the canonical shape. The DDB session store is invoked via plain function calls; tests use `vi.mock('@/lib/auth/session')` at the module boundary, not dependency injection.
- **Cookie writes are direct `cookies().set(...)` calls** — no serializer abstraction. `__Host-quilty_sid` lives as a string constant in one place.
- **Sliding-window session refresh inside `validateSessionToken`** — the validator extends expiry to +30 days if the session is within 15 days of expiring. No separate refresh endpoint for the long-lived session (the Cognito access-token refresh is a separate state machine in `cognito.ts`).
- **OAuth `state` + `nonce` + `code_verifier`** live in three separate short-lived cookies (10-min TTL), never the session cookie.
- **`React.cache(getCurrentSession)`** for per-request memoization across multiple Server Components.

## Route Handlers consuming this directory

Reserved 501-stub Route Handlers at `app/api/auth/{callback,session,refresh,logout,backchannel-logout}/route.ts` import from this directory at activation.

## References

- ADR-0009 (hexagonal-by-boundary) — explicitly excludes the auth surface from the port pattern
- ADR-0010 (composition root) — auth state is per-request, not per-runtime, so it does NOT compose into the Container singleton
- Lucia v3 docs — the canonical Session-as-flat-functions pattern
- Cal.com `packages/features/auth/lib/` — production reference at scale (25 files, no ports)
