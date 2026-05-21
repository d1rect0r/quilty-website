# ADR-0010: Composition root with globalThis singleton anchor

- **Status:** Accepted
- **Date:** 2026-05-20
- **Last reviewed:** 2026-05-21
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** `docs/research/round_6_foundation_audit/_raw/17-composition-and-test-patterns.md` § Composition root pattern
- **Related decisions:** D77 (composition root pattern), D78 (vendor SDK chokepoint), D79 (cross-package barrel rule)
- **Related ADRs:** [ADR-0001](0001-monorepo-shape.md). Forward references to `0008-modular-monolith.md` and `0009-hexagonal-by-boundary.md` — both pending; they land in the closing-wave ADR batch alongside the full body of this ADR. Link these once those files exist.
- **Related research:** `docs/research/round_6_foundation_audit/_raw/12-enterprise-consumer-app-architecture.md` § Composition roots in enterprise React apps; `docs/research/round_6_foundation_audit/_raw/14-typescript-hexagonal-implementation.md` § Container shapes
- **Software versions assumed:** Next.js 16.2, TypeScript 5.7, Node 24

## Context

The hexagonal-by-boundary architecture (ADR-0009) separates ports (typed interfaces) from adapters (vendor-bound implementations). Consumers must depend on ports, never adapters; vendor SDK imports must be confined to adapter files. Three enforcement layers protect this invariant:

1. ESLint `no-restricted-imports` with a per-file allowlist (only `packages/<role>/src/adapters/<vendor>.ts` may import vendor SDKs).
2. `.dependency-cruiser.cjs` rule `cross-package-imports-must-use-barrel` forbidding deep imports into a workspace package.
3. The composition root itself, where adapter selection happens once per runtime.

Without a composition root, consumers would either (a) instantiate adapters inline at every call site (multiplying vendor SDK init cost) or (b) reach into other packages' internals (defeating the chokepoint). The composition root is the single place where adapter selection logic lives.

Next.js 16's webpack chunk-splitting introduces a second concern: under specific RSC + client-island layouts, the composition module can load more than once across chunks. Without an anchor, each chunk would call the factory and produce a non-identical container instance — vendor SDKs would initialize twice, the `ConsentStore` reader would diverge, and replay block-class constants would have surprising `!==` identity.

The "do nothing" outcome: adapter instances proliferate, vendor SDKs initialize redundantly, cross-cutting wrappers (PHI sanitizer, consent gate) drift between chunks, and the architectural chokepoint becomes a convention rather than a seal.

## Decision

We will ship a composition root with a `globalThis` singleton anchor:

- One composition file per Next.js runtime: `apps/web/composition.{server,client,edge}.ts`. Each exports a `make<Runtime>Container()` factory.
- A shared accessor at `apps/web/lib/get-container.ts` exporting `getContainer(factory)`. The accessor uses `globalThis.__quiltyContainer ??= factory()` (nullish-coalescing assignment) so the first caller's container wins and subsequent callers receive the same identity.
- The `Container` interface widens as workspace packages land. At M1.5 Commit 3 the interface is empty; each subsequent extraction commit (Commits 4-11) adds its ports.

## Consequences

### Positive

- Adapter selection happens once per runtime, in one file per runtime.
- Cross-cutting wrappers (PHI sanitizer per D67, consent gate per D35, default-deny per D68) compose at the factory layer, not at call sites.
- Webpack chunk-duplication cannot defeat the chokepoint; the `??=` anchor is atomic in single-threaded JavaScript.
- Tests reset the singleton via an explicit `__resetContainerForTesting()` helper, keeping the production API free of test-only hooks.

### Negative

- The empty `Container` interface requires a `/* eslint-disable @typescript-eslint/no-empty-object-type */` comment with rationale, since the widening pattern would be defeated by a sentinel property. The ESLint `no-var` rule does NOT fire on the `declare global { var ... }` ambient declaration — that block is a TS ambient, not a runtime `var` statement.
- Engineers new to the codebase may try to import adapters directly; documentation, ESLint, and dep-cruiser combined make this hard but not impossible.

### Neutral

- Each runtime has its own `globalThis` in Next.js, so the singleton is per-runtime by construction. Server-side `globalThis.__quiltyContainer` is distinct from client-side `globalThis.__quiltyContainer`.

## Alternatives considered

### Alternative A: dependency-injection container library (`tsyringe`, `inversify`, `awilix`)

- **What it is:** A library-driven DI container with decorator-based registration or fluent API.
- **Why rejected:** Adds runtime weight and a foreign mental model. The 3×3 trigger rule (defer DI container adoption until at least 3 packages × 3 ports each are in production) is not yet met. A manual composition root keeps the import graph legible and the cost low.

### Alternative B: per-call-site adapter instantiation (no composition root)

- **What it is:** Each caller instantiates its adapter inline.
- **Why rejected:** Vendor SDKs initialize redundantly, cross-cutting wrappers must be re-applied at every call site, the chokepoint becomes convention-only.

### Alternative C: React Context for adapter injection

- **What it is:** Provider-based injection through `React.Context`.
- **Why rejected:** Doesn't reach server-side composition (proxy.ts, Route Handlers, server actions). Limits cross-cutting wrappers to the React tree.

## Compliance / Verification

- Unit test `apps/web/lib/__tests__/get-container.test.ts` asserts identity stability across three successive `getContainer(factory)` calls and that a second factory passed after the singleton is anchored is ignored.
- The dep-cruiser rule `cross-package-imports-must-use-barrel` blocks the failure mode where a consumer deep-imports an adapter, bypassing the composition root.
- The ESLint vendor-SDK allowlist (Commit 1) restricts vendor SDK imports to `packages/*/src/adapters/**/*.ts` plus the legacy adapter surfaces under `apps/web/lib/observability/` and `apps/web/sentry.*.config.ts`. The legacy entries shrink as Commits 4-5 migrate to `@quilty/security` and `@quilty/observability`.

### Cross-cutting wrapper invariants (the load-bearing rules)

When a port is added to the `Container` interface, the composition factory body in `composition.{server,client,edge}.ts` MUST wrap the raw adapter before returning it. Direct exposure of an unwrapped vendor adapter on the `Container` is the failure mode the chokepoint exists to prevent.

The mandatory wrappers, by port category:

- **Analytics / experiments / replay / marketing** (any port that emits user signals): wrap with a `ConsentStore.get(id)`-gated wrapper before returning. If `state.analytics !== true` (or `state.marketing !== true` for marketing ports), the wrapper must no-op. This is the D35 Cerebral-lesson default-deny posture; failing to apply it at the composition factory is the same exfiltration shape the FTC settled against Cerebral for $7M.
- **Logging / error reporting / email** (any port whose adapter forwards user-typed strings to an external service): wrap with `@quilty/security`'s `Sanitizer.scrub()` (D67 PHI chokepoint). The sanitizer recurses to depth 16 against a 52-key denylist; the wrapped port is the only `Container` property exposed.
- **Replay (Sentry)**: the wrapper applies the `block`-class floor for clinical controls + sets `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0` per D68. Amplitude Session Replay is rejected outright; no wrapper makes it safe.

The raw SDK instance must never appear as a `Container` property. Reviewers of Commits 4-11 verify each addition against this rule. The default-deny contract test added in Commit 5 (`packages/observability/src/__tests__/track.contract.test.ts`) asserts that calling `track()` on the wrapped port returns silently when consent is null — and that a raw-adapter-bypass attempt is blocked by the ESLint rule from Commit 1.

## Revisit triggers

- The 3×3 trigger: when at least 3 packages each expose 3 or more ports AND the manual composition factory exceeds ~150 lines, evaluate a DI container library. `@evyweb/ioctopus` is the leading candidate (referenced in `_raw/17-composition-and-test-patterns.md`).
- If Next.js publishes an official RSC composition primitive that subsumes this pattern.
- If `globalThis` singleton races appear in production (Sentry breadcrumb traces showing duplicate container init) — investigate before adopting another mechanism.

_Full ADR body — including the deeper rationale, the empirical chunk-duplication reproduction notes, and the Cal.com / Stripe / Linear precedent comparison — lands in the M1.5 closing-wave ADR batch (Commit 37 of the sprint plan). This stub captures the load-bearing surface so the implementation at Commit 3 has a permanent reference point._
