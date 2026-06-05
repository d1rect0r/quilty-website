# ADR-0030: Fail-closed configuration + adapter selection

- **Status:** Accepted
- **Date:** 2026-06-04
- **Last reviewed:** 2026-06-04
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** Website Hardening Phase — fail-closed-config work item (centralised env validation + per-adapter production guards), planned in `docs/website_strategy_discussion.md` and ratified during the 2026-06-04 hardening pass.
- **Related decisions:** D31/ADR-0027 (zero-PHI runtime boundary), D35/ADR-0028 (server-side ConsentState), D67 (PHI-sanitizer chokepoint), D63 (in-memory ConsentStore pre-DynamoDB)
- **Related ADRs:** [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md), [ADR-0011](0011-container-discriminated-union.md), [ADR-0017](0017-http-client-and-resilience.md)
- **Related research:** OWASP "fail securely" / secure-by-default; AWS Well-Architected SEC pillar; `@t3-oss/env-nextjs` (T3 env-validation convention); Next.js #79536 (build-time env validation belongs in `next.config`, not `instrumentation.ts`)
- **Software versions assumed:** Next.js 16, `@t3-oss/env-nextjs` 0.13, Zod 3.25, Node 24

## Context

The website composes its dependencies through per-runtime composition roots (ADR-0010/0011). Several ports are wired to **in-memory adapters today** because their real backends are AWS-parked (DynamoDB tables, SES, Turnstile not yet provisioned). Two risks followed from that:

1. **Silent in-memory in production.** Nothing stopped an in-memory adapter — a non-durable rate limiter, a non-persisted ConsentStore — from shipping to a production deploy and _appearing_ to work while silently failing its job (no cross-instance rate limiting; consent state lost on cold start). This is the failure class behind the tracking-pixel/consent enforcement cases the project is explicitly hardening against.
2. **Unvalidated configuration.** Environment variables were read raw via `process.env.*` at many call sites, so a missing or malformed value surfaced as an `undefined` deep in a request path rather than as a fast, legible failure at build/boot.

## Decision

### Decision A — Centralised, boot-time-validated env module

`apps/web/lib/env.ts` defines the typed environment via `@t3-oss/env-nextjs` (`createEnv`, server/client split, `emptyStringAsUndefined: true`). It is imported as a side-effect in `next.config.ts` so a missing/malformed variable **fails the build** with a clear Zod error (Next.js #79536: `next.config` is the reliable build-time hook; `instrumentation.ts` is not).

**Scope boundary (deliberate):** runtime-only **secrets** stay `.optional()` here and keep their own dedicated guards where the value is used — `CSRF_SECRET` (`packages/security` `csrf.ts` + `csrf-edge.ts`, ≥ 32 chars at request time) and `QUILTY_PSEUDONYM_PEPPER` (`sst.config.ts`, at deploy). The CI build job intentionally omits those secrets, so marking them required in the build-time module would wrongly fail the build. Edge-runtime module-init guards in `proxy.ts` (cookie registry, CSRF mint) likewise stay as-is. Migrating the remaining raw `process.env` reads onto `env.*` (and adding a `no-process-env` lint rule outside `lib/env.ts`) is **incremental follow-up work**, not part of this decision — a big-bang migration across edge + node + client call sites is out of scope here.

### Decision B — Fail-closed adapter selection

In **production runtime**, the composition root refuses to silently fall back to an in-memory adapter. The policy is a pure, unit-tested module (`apps/web/lib/fail-closed.ts`) so it is testable apart from the `server-only` composition roots. For a guarded adapter the root must either:

- have the real adapter's **activation env present** (e.g. `QUILTY_RATE_LIMIT_TABLE`, `QUILTY_CONSENT_TABLE`) — in which case still wiring the in-memory adapter is a wiring bug and **throws**; or
- set **`QUILTY_ALLOW_INMEMORY_ADAPTERS=true`** — an explicit, documented opt-in for the AWS-parked interim, **audit-logged once per process**; or
- otherwise, in production runtime, **throw** at container construction (fail-closed).

Outside production runtime (dev, test, and the `next build` static-generation pass) the in-memory adapter is used silently. "Production runtime" is `NODE_ENV==='production' && NEXT_PHASE!=='phase-production-build'` — the `NEXT_PHASE` exclusion prevents the guard from breaking the build while pre-rendering static pages that read the container (e.g. the search page's feature-flag read). The opt-in is resolved from `process.env` (via `resolveInMemoryGuardContext`) so the Node and Edge roots derive it identically; `env.ts` still declares the var so a malformed value fails the build.

### Decision C — Guard scope + the layered flag inventory

The construction-time guard covers the adapters that have **no internal guard**: the **rate-limiter**, the **ConsentStore**, and the **guest-state-store** (each on both the server and edge roots — the edge ConsentStore is consent-state-bearing per D35 and serves real traffic; the guest-state-store, added after this ADR was first written, holds the anonymous NON-health UI/nav carrier keyed by `__Host-quilty_sid_guest` and is governed by `QUILTY_ALLOW_INMEMORY_ADAPTERS` with activation env `QUILTY_GUEST_STATE_TABLE`). The **email** and **captcha** in-memory adapters already **self-guard at call time** with their own flags and are intentionally NOT routed through the construction-time guard, to avoid divergent double-guarding.

An interim production deploy that intends to run on in-memory adapters must therefore set **all** of:

| Flag                                    | Governs                                                         | Enforced at                              | Value  |
| --------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- | ------ |
| `QUILTY_ALLOW_INMEMORY_ADAPTERS`        | rate-limiter + ConsentStore + guest-state-store (server + edge) | container construction (ADR-0030)        | `true` |
| `QUILTY_ALLOW_INMEMORY_EMAIL_IN_PROD`   | in-memory EmailSender                                           | `send()` call time (`@quilty/email`)     | `1`    |
| `QUILTY_ALLOW_INMEMORY_CAPTCHA_IN_PROD` | in-memory CaptchaVerifier                                       | `verify()` call time (`@quilty/captcha`) | `1`    |

These flags belong in the SST `environment` block at the point a deploy is attempted before the real adapters land.

## Consequences

**Positive.** Misconfiguration fails fast and legibly (build for malformed values; cold-start for unsafe production wiring) instead of degrading silently. The zero-PHI/consent posture is enforced in code, not just prose. The policy is pure and unit-tested; the env surface has a single typed source of truth for validation.

**Negative / costs.** Three opt-in flags rather than one (the price of not editing the email/captcha packages' existing call-time guards in this pass; the inventory above is the mitigation). The env module is currently validation-first: most call sites still read `process.env` raw, so the "single accessor" benefit is partial until the incremental migration lands. The `NEXT_PHASE`-based runtime detection depends on a Next.js-set signal; if a future Next.js release changes that signal the build-vs-runtime split must be revisited.

**Follow-up (tracked, not deferred work for this item).** Migrate raw `process.env` reads onto `env.*` and add a scoped `no-process-env` lint rule; consider promoting the rate-limiter + ConsentStore to call-time self-guards for symmetry with email/captcha when their DynamoDB adapters land.
