# ADR-0017: HTTP client + resilience + RFC 9457 Problem Details

- **Status:** Accepted
- **Date:** 2026-05-26
- **Last reviewed:** 2026-05-26
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** M1.6 Workstream B research (`docs/m1.6_foundation_finishing_plan.md` § B.1 + B.3); 4 user alignment decisions (circuit-breaker / TanStack Query / retry-UX / CFF-set) answered 2026-05-26
- **Related decisions:** D5 (BFF pattern via Next.js Route Handlers), D38 (W3C `traceparent` propagation), D52 (web access-token TTL 5min, refresh 8h), D56 (OpenTelemetry-first via `@vercel/otel`), D67 (PHI sanitizer chokepoint at the wrapper-port boundary), D113 (canonical 8-piece form pattern — Idempotency-Key)
- **Related ADRs:** [ADR-0003](0003-openapi-codegen-direction.md), [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md), [ADR-0011](0011-container-discriminated-union.md), [ADR-0013](0013-phi-scrubber-port.md), [ADR-0014](0014-port-adapter-naming.md), [ADR-0016](0016-dynamodb-data-model-policy.md)
- **Related research:** M1.6 Wave 1 + Wave 3 enterprise-pattern research (synthesised in `/Users/d1rect0r_interneta/.claude/plans/misty-booping-rocket.md` § findings)
- **Software versions assumed:** Next.js 16.2, TypeScript 5.7 strict, Node 24, `openapi-typescript` v8.x, `openapi-fetch` v0.17.x, `@tanstack/react-query` v5.90+, `@opentelemetry/api` v1.9+, `@vercel/otel` 2.1.x, `sonner` 2.0.x, React 19

## Context

Every M5/M6/M7+ feature will talk HTTP to the Rust backend at `quilty-aws/lambdas/rust/`. Without a locked client + resilience policy + error-envelope shape, each feature ships its own ad-hoc fetch wrapper; retry semantics drift; problem details parsing diverges; cold-start cost multiplies; the observability invariants from D38 + D56 + D67 erode at every new call site.

The Rust backend already emits OpenAPI 3.1.0 (`quilty-aws/docs/auth/auth_v2_openapi.yaml` + `quilty-aws/docs/api/openapi.yaml`) and `application/problem+json` (RFC 9457) responses on 4xx/5xx paths. The website tier is the consumer; the codegen + parser shape must land before consumers proliferate.

ADR-0003 locked `openapi-typescript` (types-only emit, zero runtime weight) + `@quilty/api-types` published to GitHub Packages as the cross-language contract spine. The runtime helper, retry policy, circuit-breaker shape, tracing injection, idempotency-key strategy, and Problem Details parser were not yet locked.

The "do nothing" outcome: every feature reaches for raw `fetch()` with bespoke error handling. Every retry is invented locally. Every traceparent is forgotten 90% of the time. Every Problem Details payload gets parsed differently. The observability + correctness + security invariants erode at every new endpoint.

## Decision

We will ship a new workspace package `@quilty/api-client` that lands ONE typed HTTP-client port + ONE retry-policy port + ONE circuit-breaker port + ONE Problem Details parser, composed at the website's server + edge composition roots.

### Decision A — Codegen + runtime helper

- **Codegen tool:** `openapi-typescript` (types-only, ADR-0003 reaffirmed). CLI: `npx openapi-typescript <spec.yaml> -o <out>.ts`.
- **Runtime helper:** `openapi-fetch` v0.17.x — the type-safe `createClient<paths>()` companion by the same maintainer. **GOTCHA: `baseUrl` must NOT end with `/`** (concatenation produces double-slash).
- **Spec sources:** local copy of `quilty-aws/docs/auth/auth_v2_openapi.yaml` + `quilty-aws/docs/api/openapi.yaml` at M1.6; CI-driven publish-shared-types pipeline activates at M5 per ADR-0003.
- **Future-risk acknowledged:** `openapi-fetch` enters maintenance mode Q2 2026; the port shape isolates this — swapping to a successor library is a one-file adapter change.

### Decision B — HTTP layer

- **Native `fetch()`** + thin Quilty-owned wrapper at `packages/api-client/src/adapters/fetch.ts`. Universal in Node 24 + Next.js 16 Edge + browser. No `ky`, no `ofetch`, no `undici`-direct (per Wave 1 Vercel/Discord/Stripe canon).

### Decision C — Retry policy

- **Exponential backoff with full jitter** per AWS Architecture Blog canon: `delay = random(0, min(maxDelayMs, baseDelayMs * 2^attempt))`.
- **Idempotent-only retry rules**: GET / HEAD / DELETE / PUT always retry on transient errors. POST retries ONLY if an `Idempotency-Key` header is present (Stripe rule — prevents accidental double-mutation).
- **Default budget**: 3 attempts max; baseDelayMs 100; maxDelayMs 5000.
- **Retry triggers**: HTTP 408 / 429 / 500 / 502 / 503 / 504, plus Node-side `ECONNREFUSED` / `ETIMEDOUT` / `ENOTFOUND` / `ECONNRESET`.
- **Custom retry library rejected.** Implementation is ~50 lines + 8 tests; `p-retry` / `async-retry` are unnecessary deps for a project of this scale.

### Decision D — Circuit breaker (port now, adapter at trigger)

- **`CircuitBreaker` port** lands at M1.6 with a `makeNoOpCircuitBreaker()` always-closed adapter (zero overhead; structurally consistent with the rest of the hexagonal seams).
- **`makeOpossumCircuitBreaker()` adapter** is documented as a future activation at the M4 trigger condition (SLA dashboards show ≥3 cascading-failure events within a 30-day window). The opossum dependency is NOT installed at M1.6 — adding it is a one-line `pnpm add opossum` + a one-file adapter wire-up.
- **Rationale:** User-locked posture — scaffold port, no runtime adapter cost. Maintains hexagonal architecture consistency without paying for Hystrix-shape state-machine operations at single-backend zero-traffic scale.

### Decision E — Idempotency-Key shape

- **Generator:** UUIDv7 (IETF RFC 9562) via the `uuid` npm package's `v7()` export. Sortable, timestamp-bearing, 122-bit entropy. Replaces ULID.
- **Header name:** `Idempotency-Key` (IETF draft-ietf-httpapi-idempotency-key-header standard form).
- **Generated at the BFF**, propagated to the Rust backend in the `Idempotency-Key` request header.
- **Storage at the Rust backend side** is per the Rust backend's existing convention (declared on 3 mutation endpoints in `auth_v2_openapi.yaml` with 16-256 char constraint).
- **BFF-side cache** at `apps/web/lib/idempotency.ts` is a SEPARATE concern (per-BFF form-submission de-dup; 10-min TTL; ADR-0016 § 3.1). The two layers are orthogonal: BFF cache prevents re-submission within the same Lambda warm cycle; backend cache prevents re-mutation across all retries.

### Decision F — Tracing injection

- **W3C `traceparent` + `baggage`** auto-injected on every outbound HTTP call via openapi-fetch middleware (`.use({ onRequest })`).
- **Source:** `trace.getActiveSpan()?.spanContext()` from `@opentelemetry/api` — `@vercel/otel` 2.1.x configures W3C-canonical propagators by default per D56.
- **Composition:** `traceparent: 00-{traceId}-{spanId}-{traceFlags}` per W3C-trace-context spec (`traceFlags` is the lowest bit of `ctx.traceFlags` — `01` if recording, `00` if not).
- **Baggage** is OPTIONAL per Wave 1 + Wave 2 research; current scope ships traceparent only. Baggage injection lands at the M3+ identity-context propagation trigger (tenant_id / experiment cohort).

### Decision G — RFC 9457 Problem Details parser

- **Canonical 11-type registry** at `packages/api-client/src/domain/problem-types.ts` with URIs `https://my-quilty.com/problems/v1/<slug>` for the slugs: `validation`, `csrf`, `rate-limit`, `auth-required`, `consent-required`, `session-expired`, `step-up-required`, `not-found`, `service-unavailable`, `idempotency-key-conflict`, `precondition-failed`.
- **Parser** handles two shapes: canonical RFC 9457 (`{ type, title, status, detail, instance, extensions }`) AND the Rust backend's `application/problem+json` content type (which per W3.A8 should match canonical but the parser tolerates wrapper-shape drift).
- **Instance field**: request-id style (`q1m_<crockford-base32>`); minted by `apps/web/lib/correlation-id.ts` (existing).
- **Pre-cache** the type registry as a build-time `apps/web/lib/problems-catalog.json` — no runtime fetch at error time (Wave 2 recommendation).
- **Visible request-id** ALWAYS in the error toast footer ("Support ref: q1m_xyz") — UX lock from M1.6 alignment decision.

### Decision H — Client-side data fetching

- **TanStack Query v5** (`@tanstack/react-query` v5.90+) for client-side caches + mutations + optimistic UI. ~13KB gz; React 19 compatible.
- **Server Components + Server Actions** remain the default for server-side data fetching; TanStack Query is the client-side complement.
- **Canonical Next.js 16 hydration pattern**: `cache()`-wrapped `getQueryClient()` server-side + `<HydrationBoundary state={dehydrate(qc)}>` + client `<QueryClientProvider>`.
- **Server Action invalidation**: `revalidateTag('<key>')` from Server Action; TanStack Query's `useQuery` with the same tag re-fetches on next render.

### Decision I — Retry visibility (UX-locked)

- **Silent first retry** (no UI notification).
- **Sonner toast on retry attempt ≥ 2** — message: "Reconnecting…" with `toast.info()`. Duration 3000ms.
- Sonner integrated via `pnpm exec shadcn@latest add sonner`; toast surface wrapped at `apps/web/lib/toast.ts` per the hexagonal "wrap don't edit" rule (D18) — the shadcn primitive at `apps/web/components/ui/sonner.tsx` is the unedited canonical; the app-tier wrapper is the typed surface.

## Consequences

### Positive

- Every M5/M6/M7+ HTTP call inherits typed routes + retry + tracing + idempotency + problem-details parsing for free.
- Vendor-swap optionality preserved: openapi-fetch → successor library, opossum → alternative circuit-breaker, sonner → alternative toast library — each is a one-file adapter change.
- Observability invariants from D38 + D56 mechanically enforced at every call site (no manual `traceparent` injection at call site = forgotten 90% of the time).
- Problem Details registry pre-built into the bundle — error rendering does NOT require runtime fetch + parse (eliminates a known UX-anti-pattern at error time).
- TanStack Query + Server Actions integration locked to the canonical Next.js 16 pattern — no future migration debt.

### Negative

- New workspace package (12th in the monorepo) adds verify-pipeline scan surface; ~30-40 new test files + ~15 new source files.
- Bundle weight: TanStack Query v5 ~13KB gz to the client bundle; sonner ~5KB gz. Total ~18KB gz on the client side. Within the .size-limit budget per A.4 cleanup.
- The `openapi-fetch` library is pre-1.0 + entering maintenance mode Q2 2026. The port abstraction isolates this risk; explicit follow-up needed if the maintainer abandons.
- The circuit-breaker port-without-adapter is "dead architecture" at M1.6 — consumers wrap their fetches with `noOpCircuitBreaker.protect()` but get no protection. Cost: a few microseconds per call (the no-op wrapper is a single function invocation).

### Neutral

- The Stripe-canon `request_hash` + `status` attributes on the idempotency entity (per ADR-0016 § 3.1) require the Rust backend to support them — at M1.6 the website-side generates them but the backend treats them as ignored extension fields. Wire-up lands at M5+ Rust auth-user / auth-admin coverage extension.
- Sonner pulls a small slice of M3 visual-identity work into M1.6 (default sonner styles). M3 will reskin the toast surface; the wrapper API stays stable.

## Alternatives considered

### Alternative A: `ky` HTTP library

- **What it is:** Sindre Sorhus's popular fetch wrapper with retry, hooks, timeout built in.
- **Why rejected:** Adds a dependency layer where the work is small enough to own. Wrapping native `fetch()` in our own ~50-line shim gives us full control + zero runtime version drift. Vercel + Discord + Stripe all use native fetch + custom wrapper at the BFF tier.

### Alternative B: `@hey-api/openapi-ts` (full SDK codegen)

- **What it is:** Generates a full typed SDK with built-in client + retry + auth helpers from OpenAPI.
- **Why rejected:** ADR-0003 evaluated + rejected this — generates runtime SDK bloat where types-only is sufficient at the BFF layer.

### Alternative C: Adopt `opossum` circuit-breaker at M1.6 (full activation)

- **What it is:** Install opossum + ship the production adapter at M1.6.
- **Why rejected:** User-locked at the M1.6 alignment session. At single-backend zero-traffic scale the state-machine operational overhead (monitoring open/half-open/closed transitions, threshold tuning) exceeds the resilience benefit. The port-scaffold approach maintains hexagonal architecture consistency without paying the runtime cost.

### Alternative D: SWR instead of TanStack Query

- **What it is:** Vercel's lighter (~4KB gz) data-fetching library.
- **Why rejected:** TanStack Query's mutation handling + fine-grained `staleTime`/`gcTime` control + community + ecosystem all dominate at consumer-app scale. The 9KB gz delta is below the bundle-budget threshold.

### Alternative E: Custom Problem Details shape (not RFC 9457)

- **What it is:** Define our own error envelope (`{ ok: false, reason: '...', ... }` similar to the existing `ContactFormResult`).
- **Why rejected:** Rust backend already emits `application/problem+json` (W3.A8 verified). Adopting RFC 9457 on the website side is the consume-not-invent path. Stripe-canon `request_hash` + `status` extensions are added INSIDE the RFC 9457 `extensions` field — composes cleanly.

### Alternative F: Defer Sonner toast (M3 visual identity locks first)

- **What it is:** Wait for M3 to land toast UI; M1.6 retry would log silently always.
- **Why rejected:** Retry visibility on attempt ≥ 2 is the user-locked UX. Pulling shadcn's default sonner styles into M1.6 is acceptable; M3 reskins the surface, the wrapper API stays stable.

## Compliance / Verification

- `packages/api-client/__tests__/` covers each domain helper (retry / problem-details / idempotency-key / traceparent) + the in-memory adapter contract test.
- `pnpm verify` runs the new package's typecheck + tests + lint as part of `turbo run` recursion. The new workspace count is 12 (was 11 after A.5).
- ESLint `no-restricted-imports` rule extended to allowlist `@tanstack/react-query` + `openapi-fetch` + `sonner` only inside `packages/api-client/src/adapters/<vendor>.ts` + `apps/web/components/app/*` (per ADR-0014 Rule 5).
- Contract test for the circuit-breaker no-op adapter asserts it's always-closed + never opens (smoke test for the future opossum-swap correctness).
- The shadcn-installed `apps/web/components/ui/sonner.tsx` is the unedited primitive (guard-write.sh enforces D18 wrap-don't-edit).

## Revisit triggers

- **`openapi-fetch` maintenance status changes** (e.g., maintainer abandons the library, security CVE) — swap the adapter.
- **3+ cascading failures in a 30-day window** (Sentry dashboard signal) — activate the opossum circuit-breaker adapter.
- **Bundle-budget overrun** at the apps/web `/marketing/*` route — re-evaluate TanStack Query scope (push to portal-only).
- **Retry storm** detected (high p95 latency + concurrent retries fan out) — tighten retry budget or add server-side rate-limit feedback (Retry-After header parsing).
- **Cross-region request latency** becomes the bottleneck (EU MAU + data-residency revenue trigger per ADR-0016 Revisit Triggers) — re-evaluate Idempotency-Key TTL + Problem Details type-registry geo-replication.
- **Rust backend Problem Details shape diverges** from canonical RFC 9457 — extend the parser; do NOT mutate the port surface.
