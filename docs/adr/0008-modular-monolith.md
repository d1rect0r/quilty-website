# ADR-0008: Modular monolith with hexagonal-by-boundary workspace packages

- **Status:** Accepted
- **Date:** 2026-05-21
- **Last reviewed:** 2026-05-21
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** `docs/research/round_6_foundation_audit/m1.5-sprint-plan.md` + sprint-close research synthesis (Wave-1-close enterprise-architecture audit, 6-agent sweep)
- **Related decisions:** D67 (PHI sanitizer chokepoint), D69 (drop empty `packages/ui` until extraction trigger), D77 (composition-root pattern), D78 (vendor-SDK chokepoint), D79 (cross-package barrel rule)
- **Related ADRs:** [ADR-0001](0001-monorepo-shape.md), [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md), [ADR-0011](0011-container-discriminated-union.md)
- **Related research:** `docs/research/round_6_foundation_audit/_raw/14-typescript-hexagonal-implementation.md`; 3-agent reference-repo + conventions + post-mortems synthesis (Wave-1 close)
- **Software versions assumed:** Next.js 16.2, TypeScript 5.7, pnpm 10, Turborepo 2.9, Node 24

## Context

The repository ships one Next.js 16 product surface (`apps/web`) backed by a Rust API on AWS. The product surface has multiple distinct concerns — observability, consent, security primitives, transactional email, CAPTCHA, rate-limiting, content schemas, SEO builders — each with different vendor coupling, runtime constraints, and test-fixture needs. Co-locating all of these inside `apps/web/lib/` would produce three structural failure modes:

1. **Chokepoint erosion**: any module under `apps/web/lib/` is reachable from any other under the `@/` alias. The PHI sanitizer (D67) + the default-deny consent gate (D35) + the vendor-SDK adapter chokepoint (D67 / D78) all rely on a single composition point. With every module addressable, every refactor risks a bypass.
2. **Test-fixture coupling**: the in-memory fakes for analytics / email / rate-limit would either live next to production code (bleeding into bundles) or in `apps/web/tests/` (preventing reuse across the workspace).
3. **Vendor-swap cost**: when PostHog activates (D42b), when SES sandbox-lift completes (M7-adjacent), when Turnstile BAA negotiation closes — each swap is a multi-file find-and-replace if vendor names litter the codebase. Naming discipline (META-1) requires vendor identifiers to appear only in adapter files.

The "do nothing" outcome: every cross-cutting concern lives in `apps/web/lib/`, vendor SDKs spread across the import graph, and the Cerebral-lesson chokepoints become a convention rather than a graph-enforced seal. The Cerebral $7M FTC order was a configuration failure, not an intent failure; convention-level discipline is the documented failure mode.

The "go to microservices" outcome is rejected per the team-size + traffic-volume thresholds documented in Kamil Grzybek's modular-monolith primer and Sam Newman's "Monolith to Microservices" preconditions. We are below every threshold.

## Decision

We will ship a **modular monolith** with a single Next.js app (`apps/web`) consuming **workspace packages** (`packages/*`) organized by **bounded context**:

- Each package owns a single bounded context (security primitives, observability spine, consent surface, transactional email, CAPTCHA, rate-limiting, SEO builders, typed content).
- Cross-package consumption goes through the **public barrel** (`src/index.ts`) or **subpath exports** (`./server`, `./testing`) only. Deep imports are forbidden by dep-cruiser + ESLint.
- Vendor SDKs are confined to **adapter files** (`packages/<role>/src/adapters/<vendor>.ts`). The barrel exposes ports + factories; consumers never reach the vendor surface directly.
- The `Container` discriminated union (ADR-0011) is the single composition seam. Composition happens once per Next.js runtime (server / client / edge) in `apps/web/composition.{server,client,edge}.ts`.

Packages today (M1.5 close):

| Package                 | Bounded context                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `@quilty/security`      | PHI sanitizer, CSP/headers builders, redirect validator, forms primitives (CSRF/honeypot/time-trap stubs) |
| `@quilty/observability` | Analytics + ErrorReporter + Logger + Replay + FeatureFlagEvaluator + factory wrappers                     |
| `@quilty/consent`       | Cookie taxonomy + GPC detector + ConsentReader port + GpcHonoredIndicator + Banner stub                   |
| `@quilty/email`         | EmailSender port + in-memory + SES adapter skeleton                                                       |
| `@quilty/captcha`       | CaptchaVerifier port + in-memory + Turnstile adapter skeleton                                             |
| `@quilty/rate-limit`    | Sliding-window RateLimiter port + in-memory + DynamoDB adapter skeleton                                   |
| `@quilty/seo`           | JSON-LD builders + OpenGraph + icon metadata + `<JsonLd>` component                                       |
| `@quilty/content`       | Zod block schemas + 7 React block components + Velite config                                              |
| `@quilty/shared-types`  | OpenAPI-emitted types from the Rust backend (empty until M5)                                              |

## Consequences

### Positive

- **Chokepoint discipline is graph-enforced**, not convention. The PHI sanitizer composes into every vendor-bound adapter via factory wrappers; dep-cruiser forbids the bypass; ESLint blocks vendor SDK imports outside `packages/<role>/src/adapters/`.
- **Vendor swaps localize to one file.** When Amplitude → PostHog (D42b), the swap is `packages/observability/src/adapters/amplitude.ts` → `packages/observability/src/adapters/posthog.ts`. The port stays. Consumers don't change.
- **Test fixtures ship with their package.** Each package exports a `./testing` subpath with in-memory fakes; the fixture is the same shape consumers will use in production, validated by the same Vitest contract tests.
- **Runtime isolation by package.** `packages/email`, `packages/captcha`, `packages/rate-limit` carry `import 'server-only'` at their root barrels — accidental client import is a build error, not a runtime crash.
- **Tree-shaking by package boundary.** `sideEffects: false` (or the array form preserving server-only guards) on every package + subpath exports + `optimizePackageImports` + ESLint ban on `export *`.

### Negative

- **Composition root grows with the Container.** ServerContainer is ~8 fields today; by M9 it will be ~20-25. The composition factory will be ~80 lines (matches Mastra's `Mastra` class shape). Acceptable, but each new port requires a factory edit.
- **Cross-package port-ownership requires care.** ConsentReader is owned by `@quilty/consent` (provider); observability depends on consent for the type (ADR-0009). Inverted ownership creates cycles — fixed proactively in OPS-1.
- **Per-package configuration overhead.** Each package needs `package.json` + `tsconfig.json` + `vitest.config.ts` + README. Mitigated by Turborepo generators (Commit 2).

### Neutral

- The modular monolith is **not** a stepping stone to microservices. Per Sam Newman + Kamil Grzybek, the decision to extract a service is independent of the package boundary. Workspace packages can stay in the monolith indefinitely (Mastra has not extracted; Cal.com has not extracted).
- We **do not** publish packages to npm. They are `"private": true` workspace-only consumption.

## Alternatives considered

### Alternative A: Flat `apps/web/lib/` with no workspace packages

- **What it is:** Every cross-cutting concern as a folder under `apps/web/lib/` (`lib/observability/`, `lib/consent/`, `lib/email/`, …). No `packages/*`.
- **Why rejected:** No graph boundary. Every `lib/*` module is reachable from every other under the `@/` alias. The PHI sanitizer chokepoint becomes convention-level discipline. Test fixtures cannot ship with their domain. Vendor swap is a workspace-wide search/replace.

### Alternative B: Microservices from day one

- **What it is:** Auth, billing, observability as separate deployable services with HTTP boundaries between them.
- **Why rejected:** Below every threshold for microservice ROI per Newman's "Monolith to Microservices" preconditions. Adds network-hop latency, distributed-tracing complexity, and deployment-orchestration cost without proportionate benefit. The composition root + workspace packages give the same boundary isolation in-process.

### Alternative C: NestJS-style reflection DI container

- **What it is:** `@Injectable()` decorators + `Reflect.metadata` + a runtime DI graph.
- **Why rejected:** Decorators + `reflect-metadata` are hostile to Next.js Server Components (the runtime doesn't run the decorator metadata) and break under Edge runtime. The composition root pattern (ADR-0010) gives the same wiring discipline with first-class TS functions.

### Alternative D: Single workspace package + flat `apps/web`

- **What it is:** One `packages/shared` workspace package consuming everything, with `apps/web` thin.
- **Why rejected:** `packages/shared` becomes the same flat-`lib/` problem one level removed. No bounded-context isolation. The 8 packages we have are each independently testable + independently swappable; collapsing them defeats both.

## Compliance / Verification

- **Dep-cruiser `cross-package-imports-must-use-barrel` rule** forbids deep imports into `packages/*/src/`. Only `src/index.ts` and one-level subpath barrels (`src/<subpath>/index.ts`) are reachable from `apps/web/`.
- **Dep-cruiser `no-direct-vendor-sdk-outside-adapter-chokepoint`** forbids `@sentry/*`, `@amplitude/*`, `@aws-sdk/*`, `velite` imports outside `packages/<role>/src/adapters/<vendor>.ts` + the Next.js convention files.
- **ESLint `no-restricted-imports`** at the static-import layer for the same allowlist.
- **ESLint `no-restricted-syntax`** bans `export *` (forces named re-exports for tree-shaking).
- **Per-package vitest** runs in isolation with per-package coverage thresholds.
- **Turborepo build cache** + **`pnpm install --frozen-lockfile`** in CI ensure cross-package boundaries hold under cold-cache rebuilds.

## Revisit triggers

- **Engineer count >10**: re-evaluate whether bounded-context packages are too fine-grained or too coarse.
- **Second product surface emerges** (e.g., admin tool, internal CLI): the package boundary should make this cheap; if it isn't, the boundary is wrong.
- **Vendor activation reveals a bypass** of a chokepoint: the dep-cruiser/ESLint rules need extending OR the package boundary needs reshaping.
- **Build time exceeds 5 minutes**: re-evaluate whether per-package vitest + per-package typecheck is the bottleneck.
- **Turborepo or pnpm changes their workspace model**: re-evaluate whether the package-as-bounded-context pattern still maps cleanly to the tooling.
