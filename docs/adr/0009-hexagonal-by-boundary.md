# ADR-0009: Hexagonal-by-boundary — ports + adapters + fakes + factory wrappers

- **Status:** Accepted
- **Date:** 2026-05-21
- **Last reviewed:** 2026-05-21
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** `docs/research/round_6_foundation_audit/m1.5-sprint-plan.md` + Wave-1-close research synthesis (reference repos + conventions + post-mortems)
- **Related decisions:** D67 (PHI sanitizer chokepoint), D77, D78
- **Related ADRs:** [ADR-0008](0008-modular-monolith.md), [ADR-0010](0010-composition-root.md), [ADR-0011](0011-container-discriminated-union.md)
- **Related research:** Wave-1-close synthesis (Mastra + Trigger.dev + Cal.com + NestJS reference reads; Mark Seemann composition-root + Pure DI articles; Kamil Grzybek modular-monolith primer)
- **Software versions assumed:** TypeScript 5.7, Next.js 16.2

## Context

Each workspace package (ADR-0008) needs an internal shape that satisfies three conflicting goals:

1. **Vendor swap-ability** — Amplitude → PostHog, SES → SendGrid, Turnstile → hCaptcha must be one-file changes inside the package, not consumer-API breakage.
2. **Test isolation** — package consumers (other packages + `apps/web`) need in-memory fakes that satisfy the same port contract as the production adapter.
3. **Architectural seal** — vendor identifiers must appear only at the adapter file path (META-1); the package public API must be vendor-agnostic.

Textbook hexagonal architecture (Alistair Cockburn) prescribes ports (interfaces) + adapters (vendor implementations) + an inbound/outbound split (driving vs driven ports). The Wave-1-close research-agent reference reads showed that production teams diverge from textbook in two ways:

- **No top-level `ports/` + `adapters/` + `__fakes__/` directories at the package root.** Mastra co-locates by feature (`storage/domains/memory/{base,inmemory}.ts`); Trigger.dev does the same. The textbook split is for packages with 20+ feature units; below that threshold the flat shape is cleaner.
- **No driving/driven port split.** Every port in the @quilty/_ packages is driven (the package calls out to a vendor; vendors don't call into the package). Inbound HTTP handlers live in `apps/web/app/api/_` and are not abstracted behind a port.

Mark Seemann's composition-root + Pure-DI articles + Dan Abramov's "Wet Codebase" talk converge on the same rule for TypeScript: **collapse abstractions that don't earn their complexity**. A factory function over a stateless free function is over-engineering; a factory over a stateful wrapper that composes cross-cutting concerns is the load-bearing seam.

The "do nothing" outcome: each package picks its own shape (some use `ports.ts`, some use sibling files; some use `adapters/`, some use `domain/`). Consumer onboarding requires reading each package's README to understand the same conceptual surface in different file layouts.

## Decision

We will ship a **hexagonal-by-boundary** package shape with these conventions:

### Package internal structure

```
packages/<role>/
├── package.json         # exports: ".", "./server"?, "./testing"
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── src/
    ├── index.ts         # public barrel — ports, factories, type exports
    ├── ports.ts         # role-shaped interfaces (driven ports only)
    ├── errors.ts        # domain-specific error types (optional)
    ├── domain/          # business logic + factory wrappers (cross-cutting composition)
    │   ├── wrap-<port>.ts        # factory wrappers (sanitizer + consent gate + …)
    │   └── <pure-function>.ts    # stateless domain helpers
    ├── adapters/        # vendor-bound implementations — META-1 isolation point
    │   ├── <vendor>.ts           # one file per vendor; vendor identifier in filename ONLY
    │   └── in-memory.ts          # production wiring at scaffold; test fake afterward
    ├── server/          # optional — server-only entry points (uses next/headers, etc.)
    │   ├── index.ts
    │   └── <module>.ts           # carries `import 'server-only'`
    ├── components/      # optional — React components owned by this package
    │   └── <Component>.tsx
    ├── testing/         # in-memory fakes for cross-package consumer tests
    │   └── index.ts
    └── __tests__/       # colocated unit tests
        └── <module>.test.ts
```

### Ports

- Role-shaped interface names (`EmailSender`, not `SesEmailSender`). Vendor identifiers never on the port.
- **Driven ports only.** No package defines driving ports because inbound HTTP handlers live in `apps/web/app/api/*` and don't go through a port abstraction.
- Cross-package port ownership: **owned by the provider** (the package that ships multiple implementations). Consumers depend on the provider for the type. ConsentReader → owned by `@quilty/consent`; observability's wrapAnalytics depends on consent for the type. The inverted "consumer-driven contract" shape is forbidden.

### Adapters

- One file per vendor at `src/adapters/<vendor>.ts`. The vendor identifier appears in the filename + factory function name + internal logic, nowhere else.
- An `in-memory.ts` adapter ships as **production wiring at scaffold time** AND **the canonical test fake**. The dual role is by design — production runs the same code tests run until the vendor activates.
- Vendor adapters that are pre-activation ship as **typed-rejecting skeletons**: `send()` returns `Promise.reject(new Error('<reason>'))`. The reason names the activation gates (e.g., "SES sandbox-lift + BAA execution required"). Loud-fail per call is the contract.
- Skeleton adapters that close over secrets MUST consume the secret at construction time, derive a boolean (e.g., `hasKey = options.secretKey.length > 0`), and not retain the raw value in the closure (heap-snapshot exfiltration discipline).

### Factory wrappers (composition of cross-cutting concerns)

- A factory function (`wrapEmailSender`, `wrapAnalytics`, `wrapLogger`, …) earns its shape **only if it closes over real state** — sanitizer composition, consent gate, replay floor enforcement, allowlist policy.
- Stateless functions stay as direct exports. `makeCspBuilder` and `makeHeadersBuilder` were collapsed in OPS-1 because they wrapped stateless functions with no closed-over state.
- The composition root MUST consume the wrapper, never the raw adapter. Dep-cruiser + ESLint enforce the boundary.

### Fakes

- Live at `src/testing/` (not `__fakes__/` — the latter is community-coined, not Jest-official; Apollo, tRPC, TanStack use `testing/`).
- Exported via the `./testing` subpath in `package.json`.
- The `in-memory` adapter is the canonical fake. Production code that needs a fake imports `from '@quilty/<role>/testing'`.

### Public barrel discipline

- `src/index.ts` re-exports ports + factory wrappers + adapter constructors + domain constants.
- **No `export *`** (banned by ESLint `no-restricted-syntax`). All re-exports are named (`export { foo } from './path.js'`).
- Subpath barrels (`src/server/index.ts`, `src/testing/index.ts`) follow the same discipline.
- Deep imports past a barrel are forbidden by dep-cruiser `cross-package-imports-must-use-barrel`.

## Consequences

### Positive

- **Shape consistency across 8 packages.** A developer who has read one package can navigate the others without re-orientation.
- **Vendor swap is a one-file change** at the adapter layer. Port + factory + barrel unchanged.
- **Fake = in-memory adapter** means tests exercise the production-shape code path, not a parallel hand-rolled mock.
- **Skeleton adapters fail loudly** in production via `Promise.reject` + NODE_ENV guards on the in-memory adapters (email + captcha) — accidental activation surfaces immediately.
- **META-1 (vendor-agnostic naming) is graph-enforced.** Vendor names appear only in adapter files; dep-cruiser + ESLint forbid bypass.

### Negative

- **Pre-activation skeleton adapters are inert weight.** SES + Turnstile + DynamoDB rate-limit adapters ship code that does nothing useful at M1.5. Acceptable trade-off: the wiring stays correct, the type-shape doesn't drift, and activation is a body-swap with no consumer breakage.
- **Cross-package port-ownership requires explicit dependency arrows.** Provider-owned ports mean the consumer must depend on the provider package. We accept the dependency arrow + dep-cruiser enforcement.
- **Comment discipline (META-2): no audit / sprint / agent / milestone references in source files** is harder to enforce mechanically. Cleanup passes are needed (FND-3 + future M2.5 cleanups).

### Neutral

- **In/out port split is skipped.** Cockburn + Grzybek prescribe it; our packages have only driven ports so the split is vacuous. We document the absence rather than force the empty subdirs.
- **Top-level `ports.ts` + `adapters/` directories** diverge from what Mastra + Trigger.dev ship (they use co-located feature folders) but the textbook shape is the right scale for our 2-3 adapters per package. The decision is explicitly scale-bound; revisit if any package grows past ~6 adapters.

## Alternatives considered

### Alternative A: Co-located feature folders (Mastra / Trigger.dev shape)

- **What it is:** `packages/consent/src/consent/{base,inmemory,dynamodb,types}.ts` — feature folder with sibling files, no top-level `ports/`/`adapters/`.
- **Why rejected:** Earns its shape at 20+ feature units (Mastra's `storage/domains/` has 20+). Our packages have 2-3 adapters each. The textbook split is the simpler shape at this scale.

### Alternative B: Driving + driven port split

- **What it is:** `ports/in/` (driving — inbound HTTP handlers) + `ports/out/` (driven — vendor SDKs).
- **Why rejected:** We have only driven ports. Inbound HTTP handlers live in `apps/web/app/api/*` and are not abstracted behind a port (Next.js Route Handler is the framework-provided abstraction). The split would be vacuous.

### Alternative C: Factory wrappers over every port (consistency for consistency's sake)

- **What it is:** `makeCspBuilder()`, `makeHeadersBuilder()`, `makeJsonLdBuilder()` — every export wrapped in a factory.
- **Why rejected:** Stateless functions don't earn the factory shape. Collapsed in OPS-1 per the Wave-1-close research (Bespoyasov + Fukuda + Abramov's "Wet Codebase" all converge: collapse abstractions that don't close over real state).

### Alternative D: `__fakes__/` directory (some community usage)

- **What it is:** Use `__fakes__/` (matching `__mocks__/` and `__tests__/` conventions).
- **Why rejected:** Renamed to `testing/` in OPS-2. Apollo, tRPC, TanStack all use `testing/`. Jest never had `__fakes__/` as official.

## Compliance / Verification

- **Dep-cruiser `cross-package-imports-must-use-barrel`** forbids deep imports into `packages/*/src/`.
- **Dep-cruiser `no-direct-vendor-sdk-outside-adapter-chokepoint`** enforces META-1 (vendor identifiers in adapter files only).
- **ESLint `no-restricted-imports`** with per-vendor allowlist for the same boundary at the static-import layer.
- **ESLint `no-restricted-syntax`** bans `export *`.
- **Per-package vitest** with ≥85% coverage on adapter + domain code; ≥95% on auth-adjacent load-bearing paths (META-3, e.g., `@quilty/rate-limit`).

## Revisit triggers

- **Any package grows past ~6 adapters**: reshape that package to co-located feature folders (Mastra pattern).
- **An inbound port emerges** (e.g., a domain-internal HTTP handler that doesn't fit the Next.js Route Handler shape): add the driving/driven split for that package.
- **Cross-package port ownership creates a cycle** that the workaround pattern (inlining test fakes in the consumer's testing barrel) cannot resolve: extract the port type to a smallest-common-denominator package (`@quilty/shared-types` or a new `@quilty/contracts`).
- **A factory wrapper accumulates >3 levels of composition** (sanitizer + consent + replay + …): consider whether the wrapper has become a god-function and should be decomposed.
