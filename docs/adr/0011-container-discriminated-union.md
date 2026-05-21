# ADR-0011: Container as discriminated union per runtime

- **Status:** Accepted
- **Date:** 2026-05-21
- **Last reviewed:** 2026-05-21
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** Wave-1-close 3-agent research synthesis (reference repos + conventions + post-mortems)
- **Related decisions:** D77 (composition-root pattern)
- **Related ADRs:** [ADR-0008](0008-modular-monolith.md), [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md)
- **Related research:** Optique 1.0 "From five optional fields to a discriminated union" (Stanza); Total TypeScript Essentials — Unions, Literals, Narrowing; Wave-1-close research synthesis
- **Software versions assumed:** TypeScript 5.7, Next.js 16.2

## Context

The composition root (ADR-0010) returns a typed `Container` to consumers (Server Components, Route Handlers, Client Components, Edge proxy handler). The initial shape of `Container` was a single interface with optional fields gated by JSDoc convention:

```ts
interface Container {
  readonly sanitizer: Sanitizer;
  readonly logger: Logger;
  // ... shared ports ...
  /** Server-only — client code MUST NOT call. */
  readonly emailSender?: EmailSender;
  readonly captchaVerifier?: CaptchaVerifier;
  readonly rateLimiter?: RateLimiter;
}
```

The optional-fields shape carried three structural problems documented by the Wave-1-close research:

1. **JSDoc-level discipline is not graph-enforced.** A Client Component that called `container.emailSender?.send(...)` would silently no-op on the client (because the field is undefined there) — indistinguishable at the type level from a correctly-never-called path. The optional chain is the failure-mode shape.

2. **God-object shape compounds with port count.** At 8 ports today, the shape is manageable. By M9 (auth + billing + content-CMS + cross-cutting clock/http/idempotency primitives) the Container will carry ~20-25 fields. Every consumer must narrow per call to access server-only ports. Optique 1.0's "five optional fields to a discriminated union" writeup documents the exact failure mode: narrowing happens at every call site, late refactors mean touching dozens of files per call.

3. **Server-only field instantiation in the client composition wastes bundle.** When `composition.client.ts` was forced to satisfy the same interface as the server, it instantiated stateless factories (`makeCspBuilder()`, `makeHeadersBuilder()`) for type-shape consistency, dragging ~3-5 KB of dead client-side code per cold load.

The "do nothing" outcome: as the port count grows from 8 to ~25, the optional-fields shape compounds — every Route Handler narrows per server-only port at the call site, the composition factory accumulates dead client-side instantiation, and the JSDoc-level discipline becomes the only barrier between client code and server-only ports.

## Decision

We will ship the `Container` as a **discriminated union of three runtime-specific shapes**, tagged by the `runtime` literal:

```ts
interface BaseContainer {
  readonly sanitizer: Sanitizer;
  readonly logger: Logger;
  readonly errorReporter: ErrorReporter;
  readonly analytics: Analytics;
  readonly featureFlags: FeatureFlagEvaluator;
}

export interface ServerContainer extends BaseContainer {
  readonly runtime: 'server';
  readonly emailSender: EmailSender; // required, not optional
  readonly captchaVerifier: CaptchaVerifier;
  readonly rateLimiter: RateLimiter;
}

export interface ClientContainer extends BaseContainer {
  readonly runtime: 'client';
  // narrow surface — no server-only ports reachable at the type level
}

export interface EdgeContainer extends BaseContainer {
  readonly runtime: 'edge';
  // narrow surface — no Node-only adapters
}

export type Container = ServerContainer | ClientContainer | EdgeContainer;
```

Per-runtime `globalThis` slots + per-runtime accessors make the slot-to-type alignment sound by construction (no cast required):

```ts
declare global {
  var __quiltyServerContainer: ServerContainer | undefined;
  var __quiltyClientContainer: ClientContainer | undefined;
  var __quiltyEdgeContainer: EdgeContainer | undefined;
}

export function getServerContainer(factory: () => ServerContainer): ServerContainer { ... }
export function getClientContainer(factory: () => ClientContainer): ClientContainer { ... }
export function getEdgeContainer(factory: () => EdgeContainer): EdgeContainer { ... }
```

CSP + Security-Headers helpers were collapsed from port-shaped factories (`makeCspBuilder`/`makeHeadersBuilder`) into direct function exports because they're stateless and don't earn the abstraction (per ADR-0009 + the OPS-1 evidence-driven refactor). Proxy + Edge Route Handlers import them as plain functions from `@quilty/security`.

## Consequences

### Positive

- **Type-system enforcement, not JSDoc.** A Client Component cannot reach `container.emailSender` — the field doesn't exist on `ClientContainer`. The compile-time check replaces the runtime null check.
- **Per-runtime composition factories are minimal.** `composition.client.ts` doesn't instantiate `makeCspBuilder()` for type-shape consistency; it never needed to. ~3-5 KB dead client code removed.
- **Per-runtime global slots prevent cross-runtime confusion.** Three separate slots (`__quiltyServerContainer`, `__quiltyClientContainer`, `__quiltyEdgeContainer`) mean a misconfigured runtime cannot accidentally read another runtime's slot. The slot-to-type alignment is sound by construction.
- **Discriminant tag (`runtime: 'server' | 'client' | 'edge'`) enables narrowing for helpers** that accept any `Container`. A future `assertServerContainer(container)` helper would narrow on the tag.
- **Adding new ports requires a deliberate decision** about which runtime container they belong to. The shape forces "is this server-only or universal?" up-front.

### Negative

- **Three accessors instead of one** (`getServerContainer`, `getClientContainer`, `getEdgeContainer`). Slight ceremony cost at the consumer site.
- **Composition factory grows per-port.** Every new server-only port adds a field to `ServerContainer` + a wiring line in `composition.server.ts`. By M9 the factory will be ~80 lines (matches Mastra's `Mastra` class shape — acceptable scale).
- **`runtime` literal field on every Container instance** consumes a constant amount of memory + serialization weight. Trivial cost; not measurable at our scale.

### Neutral

- **Cross-runtime helpers must narrow on the tag.** A future utility that operates on any `Container` writes `if (container.runtime === 'server') { ... }` — standard TypeScript discriminated-union narrowing.
- **The `Container` union type is the single public surface.** Consumers that want a specific runtime's type import `ServerContainer`/`ClientContainer`/`EdgeContainer` directly.

## Alternatives considered

### Alternative A: Single Container interface with optional fields (status quo before OPS-1)

- **What it is:** One interface with `cspBuilder` required + `emailSender?` optional + JSDoc gating server-only fields.
- **Why rejected:** JSDoc is not graph-enforced. Optional-chain access on a client/edge container is indistinguishable from a correctly-never-called path. Optique 1.0's "five optional fields" writeup documents the exact failure mode at scale.

### Alternative B: Per-runtime container types with no shared base + no `Container` union

- **What it is:** `ServerContainer`, `ClientContainer`, `EdgeContainer` as independent types with no `extends BaseContainer` + no union.
- **Why rejected:** Loses the ability to write cross-runtime helpers (e.g., a logging utility that accepts any container). The `BaseContainer` + discriminated union gives both: per-runtime narrowing AND cross-runtime polymorphism.

### Alternative C: Branded types instead of discriminant tag

- **What it is:** `type ServerContainer = BaseContainer & { __brand: 'server' }`.
- **Why rejected:** Brands work for compile-time-only distinctions but the `runtime` field is also valuable at runtime (logging, debugging, error messages identify which container they came from). A literal-typed field carries both compile-time + runtime semantics.

### Alternative D: One Container, three runtime-specific accessor types

- **What it is:** Single Container interface, but `getServerContainer` returns `Container & { emailSender: EmailSender }` (intersection narrowing).
- **Why rejected:** Intersection narrowing is awkward at scale — every server-only port would need to be intersected in the accessor's return type. The discriminated-union shape is the idiomatic TypeScript pattern; intersections at the accessor layer would invert the natural shape.

## Compliance / Verification

- **`apps/web/lib/__tests__/get-container.test.ts`** — 11 tests covering:
  - Per-runtime accessor returns the correct container shape with the right `runtime` discriminant
  - First-caller-wins identity stability across calls within a runtime
  - Per-runtime slot isolation (server + client + edge containers have distinct identities)
  - `__resetContainerForTesting` clears all three slots
- **TypeScript strict mode** + `exactOptionalPropertyTypes` enforce that consumers cannot pass an incomplete container to a per-runtime accessor.
- **No `getContainer` (untagged) accessor exists** — the three per-runtime accessors are the only public surface.

## Revisit triggers

- **The Container grows past ~25 fields**: re-evaluate whether the god-object shape has compounded; consider extracting feature-specific sub-containers (e.g., `AuthContainer`, `BillingContainer`) that the runtime container composes.
- **A fourth Next.js runtime emerges** (e.g., separate Edge handler tier with different port surface): widen the discriminated union with a new variant + accessor.
- **Cross-runtime helpers proliferate** (>5 utilities that accept any Container): re-evaluate whether the shared `BaseContainer` is the right cross-cutting shape OR whether the helpers belong at a different layer.
- **A consumer pattern emerges where Route Handlers need only a narrow port subset** (e.g., a Stripe webhook handler that needs only `analytics + logger + rateLimiter`): consider function-arg injection instead of full-container access for that consumer pattern.
