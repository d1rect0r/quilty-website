# `apps/web/lib/api/` — Rust backend HTTP client

Reserved location for the BFF→Rust HTTP client. Empty until the OpenAPI-codegen pipeline activates at the OpenAPI integration milestone (D48 + ADR-0003).

## Shape (when populated)

```
api/
├── README.md            (this file)
├── client.ts            base fetch wrapper — auth header injection, timeout, retry policy, error mapping
├── errors.ts            typed errors at the BFF↔Rust boundary (BackendUnavailableError, BackendAuthError, ...)
├── auth.ts              auth-endpoint client functions (consumed by app/api/auth/* Route Handlers)
├── account.ts           account-endpoint client functions
├── subscription.ts      subscription-endpoint client functions (consumed by app/api/webhooks/stripe at M7)
└── ... (one file per Rust endpoint group)
```

Types come from `@quilty/shared-types` (OpenAPI codegen output). The functions in `api/` are the thin transport wrappers; type-safety is enforced by the schema package.

## Discipline

- **`import 'server-only'`** at the top of every file — the BFF→Rust calls never reach the client bundle.
- **One file per endpoint group**, matching the Rust workspace crate boundaries (`auth-public`, `auth-user`, `auth-admin`, etc.).
- **No business logic** in this directory. The HTTP client is a transport layer; business decisions (when to call, how to handle errors at the user-facing level) belong in `app/api/<feature>/route.ts` or `actions/<feature>/<verb>.ts`.
- **Auth header injection** centralized in `client.ts` — never hand-rolled per call.
- **Timeout + retry policy** also centralized; default `AbortSignal.timeout(10000)` + no retry for state-changing requests + exponential backoff for read-only requests.

## References

- ADR-0003 (OpenAPI codegen direction)
- D48 (Rust backend permanently in `quilty-aws/lambdas/rust/`)
- The R4 Wave-1-close research finding: HTTP client primitives stay in `apps/web/lib/` until a second app/runtime consumes them (extraction is consumer-driven, not aesthetic-driven).
