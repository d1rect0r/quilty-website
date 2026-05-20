# 17 — Composition Root and Test Patterns

> **Round 6 — D76 evidence.** Assuming hexagonal architecture per package lands (D76 pending lock), this document recommends two concrete implementation patterns: (1) how concrete adapters are wired to ports at app startup ("composition root"), and (2) how consumer-package tests inject fake adapters and verify both real and fake satisfy the same port contract.
>
> Quilty stack: Next.js 16 + TS strict + Vitest + Playwright + Turborepo + pnpm workspaces. Solo team pre-launch. ~10 packages expected. Mobile precedent (`quilty_auth`): 33 ports + 27 fakes + Tier-A wire-pin smoke tests against production endpoint.
>
> Read-only. Goal: select patterns we can put in `turbo gen` generators on day one and live with through M9.

---

## 1. Executive summary

**Composition root — recommended: manual `composition.ts` per app surface, anchored on `globalThis` for cross-chunk safety in Next.js, with a `makeContainer()` factory available for request-scoped or test-scoped overrides.** A typed DI container (`tsyringe`, `awilix`) buys very little for a ~10-package solo codebase and costs decorator metadata + an extra runtime; Effect-TS Layer is the technically superior answer but is a paradigm-level commitment we are not ready to make at M1. A two-page manual composition file is sufficient through M9+ and trivially upgrades to `awilix` later if request-scoped sub-graphs proliferate. Cite: [Mark Seemann's original Composition Root post](https://blog.ploeh.dk/2011/07/28/CompositionRoot/), [Sentry DevRel's `nextjs-clean-architecture`](https://github.com/nikolovlazar/nextjs-clean-architecture) (uses `ioctopus`, the smallest possible container).

**Test patterns — recommended: in-memory fake adapters live next to the port in `src/__fakes__/`, exported from a `./testing` subpath, and contract tests use Vitest `describe.each` to run the same suite against real + fake.** This is the "Fake, Don't Mock" school adapted for monorepos — Shai Yallin's canonical formulation, validated by Sentry's `TestClient`/`TestTransport` pattern in `sentry-javascript`, and matches the mobile `quilty_auth` `Fakes/` convention 1:1. We use `vi.mock()` only at the route-handler edge where SDK shape is irreducible.

---

## 2. Composition root: four patterns surveyed

### 2.1 Manual `composition.ts`

**What it is.** A hand-written TypeScript file at the app boundary (`apps/web/src/composition.ts`) that imports ports, imports concrete adapters, instantiates them in dependency order, and exports the assembled object graph. No framework, no decorators, no metadata reflection. The composition file is the only place in the codebase that knows about every concrete adapter — every other file imports interfaces only.

**When it fits.** Default choice for small-to-medium codebases (≤20 packages), solo teams, and any codebase where the dependency graph is mostly static (vendors picked once, environment-flagged). Mark Seemann's [2011 Composition Root post](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) accepts the "knows about every module" coupling as the price of avoiding container ceremony. Critically: it's the only pattern that works in Next.js without fighting webpack's chunk-duplication of module-level state — you anchor singletons on `globalThis` explicitly. [Hawu Wang's "Global Singleton and the Runtime Hell in Next.js" (2024)](https://www.hawu.me/dev/6268) documents the failure mode: a module-level `new Logger()` instantiates twice (once from `next-server.js`, once from `webpack-runtime.js`) even in production builds. The fix is the `globalThis` anchor — trivial in a manual composition file, more work in a DI container.

**Example.**

```ts
// packages/account/src/ports/session-store.ts
export interface SessionStore {
  get(id: string): Promise<Session | null>;
  put(s: Session): Promise<void>;
  revoke(id: string): Promise<void>;
}

// packages/account/src/adapters/dynamo-session-store.ts
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { SessionStore } from '../ports/session-store';
export class DynamoSessionStore implements SessionStore {
  /* ... */
}

// apps/web/src/composition.ts
import { DynamoSessionStore } from '@quilty/account/adapters/dynamo-session-store';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

type Container = {
  sessionStore: SessionStore;
  // ... ~10 other ports
};

const g = globalThis as typeof globalThis & { __quiltyContainer?: Container };

export function getContainer(): Container {
  if (g.__quiltyContainer) return g.__quiltyContainer;
  const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
  g.__quiltyContainer = {
    sessionStore: new DynamoSessionStore(ddb, process.env.SESSIONS_TABLE!),
    // ...
  };
  return g.__quiltyContainer;
}

// For tests / request-scoped overrides
export function makeContainer(overrides: Partial<Container>): Container {
  return { ...getContainer(), ...overrides };
}
```

### 2.2 `tsyringe`

**What it is.** Microsoft's lightweight DI container — decorator-based registration (`@injectable()`, `@inject(TOKEN)`), `container.register()` for binding tokens to implementations, `container.resolve()` for retrieval. Requires `reflect-metadata` and `experimentalDecorators` + `emitDecoratorMetadata` in `tsconfig`. ~1.5 kB runtime, well-maintained but conspicuously silent on Next.js / RSC / edge runtime in its README ([github.com/microsoft/tsyringe](https://github.com/microsoft/tsyringe)).

**When it fits.** Large codebases with many constructor-injected services where listing parameters in a composition file becomes tedious. Heavy Angular shops moving to standalone Node services tend to choose it because the decorator vocabulary is familiar. Documented child-container pattern exists for "per-request containers that use common stateless services from the root container," but the README has no Next.js or edge integration guidance.

**Caveats for Quilty.** Three real costs: (1) `experimentalDecorators` + `reflect-metadata` pollute every consumer's `tsconfig` and add ~50 kB to the runtime bundle on edge — significant for marketing routes targeting LCP. (2) Decorators interact poorly with Next.js 16 + React Server Components — RSC modules cannot rely on `reflect-metadata` initialization order. (3) The metadata reflection trick the container uses for "auto-wire" cannot survive aggressive bundler minification without explicit token strings everywhere, at which point you've reinvented manual wiring.

### 2.3 `awilix`

**What it is.** A "battle-tested" DI container by Jeff Hansen — `createContainer()`, `register({ key: asClass(Impl) })`, `container.resolve("key")` or via cradle proxy. Explicit lifetime semantics: `SINGLETON` / `SCOPED` / `TRANSIENT`. No decorators (a major win — works fine with strict TS without `experimentalDecorators`). Battle-proven in Node.js/Express + Fastify shops, with a documented per-request `createScope()` middleware pattern.

**When it fits.** Codebases with genuine request-scoped state (per-request user identity, transaction context, tenant resolution) that propagate through 5+ services per request. The scoped-container pattern is the cleanest answer to "how do I pass `currentUser` into seven services without thread-locals?" Express/Fastify shops with 50+ services routinely use it.

**Example.**

```ts
import { createContainer, asClass, asValue, InjectionMode } from 'awilix';
const container = createContainer({ injectionMode: InjectionMode.PROXY });
container.register({
  sessionStore: asClass(DynamoSessionStore).singleton(),
  dynamoClient: asValue(new DynamoDBClient({ region: process.env.AWS_REGION })),
});

// Per-request override:
export function middleware(req: NextRequest) {
  const scope = container.createScope();
  scope.register({ currentUser: asValue(extractUser(req)) });
  // hand scope to route handler
}
```

**Caveats for Quilty.** awilix is the right choice if we hit a real request-scoped need (we don't currently — sessions are looked up explicitly per route, not threaded). At ~10 packages and pre-launch, the scope-creation ceremony on every request is overhead with no payback. The migration path _from_ manual composition _to_ awilix is straightforward later (the public type `Container` stays stable; only the factory implementation changes), so we are not painting ourselves into a corner by starting manual.

### 2.4 Effect-TS `Layer`

**What it is.** A fundamentally different paradigm — services as `Context.Tag` values, implementations as `Layer<Out, Err, In>` blueprints, composition via `Layer.merge` (parallel) and `Layer.provide` (sequential). Effects are tagged with their requirements at the type level, so the compiler refuses to run a program until every required service has a layer ([effect.website/docs/requirements-management/layers](https://effect.website/docs/requirements-management/layers/)). Test implementations are first-class — `Layer.succeed(Database, { query: () => Effect.succeed("test") })` is the canonical pattern.

**When it fits.** Codebases where the team has committed to Effect end-to-end — Effect for control flow, Effect for error channels, Effect for concurrency. The Layer system is incoherent if half your codebase is `async/await` promise-based and the other half is `Effect.gen`. When you go all-in, Layer is arguably the best DI story in any TypeScript ecosystem — type-checked dependency graphs, free test injection, and zero ceremony for service wiring.

**Example.**

```ts
class SessionStore extends Context.Tag("SessionStore")<
  SessionStore, { get(id: string): Effect.Effect<Session | null> }
>() {}

const SessionStoreLive = Layer.effect(SessionStore, Effect.gen(function* () {
  const ddb = yield* DynamoClient;
  return { get: (id) => Effect.tryPromise(() => ddb.getItem(...)) };
}));

const SessionStoreTest = Layer.succeed(SessionStore, {
  get: (id) => Effect.succeed(id === "valid" ? mockSession : null),
});

const AppLive = Layer.provide(SessionStoreLive, DynamoClientLive);
program.pipe(Effect.provide(AppLive));
```

**Caveats for Quilty.** Effect is a paradigm commitment, not a library swap. Onboarding cost is real — `Effect.gen`, generators, tagged error channels, fiber semantics all need to be internalized before the team is productive. For a solo developer at M1 with mobile precedent in plain async-await Dart, mid-flight conversion to Effect-TS is a strict no. Reserve as a possible Round-7+ trigger if the codebase grows past ~25 packages with heavy concurrency requirements (we don't anticipate this).

### 2.5 Recommendation: manual `composition.ts` with `globalThis` anchor + `makeContainer()` escape hatch

Pick manual composition. Rationale:

1. **Next.js correctness.** The `globalThis` singleton anchor is the only pattern that survives webpack chunk duplication ([vercel/next.js#65350](https://github.com/vercel/next.js/issues/65350), [#68572](https://github.com/vercel/next.js/discussions/68572)). DI containers either fight this or paper over it with extra ceremony.
2. **Sentry validation.** Sentry's own [nextjs-clean-architecture reference](https://github.com/nikolovlazar/nextjs-clean-architecture) (by Lazar Nikolov, Sentry DevRel) deliberately uses `ioctopus` — the smallest possible container, ~50 LoC — because the author found Inversify "painful in serverless/Edge runtimes." This is direct evidence that even authors arguing _for_ DI containers in Next.js are pulling toward minimalism.
3. **Scale fit.** ~10 packages × ~3 ports each = ~30 wirings. That is a 60-line composition file. No container helps below ~100 ports.
4. **Upgrade path.** The `Container` type and `getContainer()`/`makeContainer()` interface stay stable when we swap the body to `awilix` or `ioctopus` later. Migration is a one-day refactor, gated on a real trigger (request-scoped state, or composition file >300 LoC).

For request-scoped concerns we have today (Cognito session lookup, CSRF token validation), the route handler explicitly fetches what it needs from `getContainer()` — no implicit propagation required.

---

## 3. Test patterns: four conventions surveyed

### 3.1 Inline `vi.mock()` per test file

**What it is.** The default Vitest pattern — `vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({ ... }))` at the top of a test file. The mock is hoisted above all imports, the entire module is replaced for the duration of the test file.

**When it fits.** Tests of a single function with one or two external dependencies. Smoke-level coverage where the assertion is "this route returns 200." Fine for testing route handlers in isolation, painful for testing domain logic that touches multiple ports.

**Failure mode.** Mock objects drift from real SDK shape silently; a Cognito API response shape change ships green tests + broken production. This is the documented "test theater" risk in [Yallin 2024](https://www.shaiyallin.com/post/fake-don-t-mock) and [Rainsberger's "Integrated Tests Are a Scam"](https://blog.thecodewhisperer.com/permalink/integrated-tests-are-a-scam) — exactly what file 16 §2.3 warned about for Quilty's mobile-precedent risk of 33 ports diverging from real Cognito behavior.

### 3.2 Inline fakes (in-file class definitions)

**What it is.** Each test file defines a small `class FakeXyz implements Xyz { ... }` near the top, populates it with whatever state the test needs, instantiates it, passes it to the system under test.

**When it fits.** One-shot fakes that need very little state. Tests of a single behavior that won't be reused.

**Failure mode.** Fake bodies duplicate across 8+ test files when the port has 8+ consumers. When the port grows a method, all 8 fakes need updating. This is the convergence point where shops migrate to a shared fakes location.

### 3.3 Shared fakes in `__fakes__/` (or `fakes/`) subdirectory

**What it is.** The fake lives next to its port, in a `src/__fakes__/in-memory-session-store.ts` or `src/fakes/` directory inside the package. Exported via a `./testing` subpath in the package's `exports` map (`"./testing": "./dist/testing.js"`). Consumer packages import `import { InMemorySessionStore } from "@quilty/account/testing"`. The fake is a complete, internally coherent implementation — `put()` followed by `get(id)` returns the stored session, exactly like the real adapter.

**When it fits.** Default choice for any port with ≥2 consumer tests. This is what Sentry's `sentry-javascript` does — the `TestClient` in `packages/core/test/mocks/client.ts` is a full client subclass with state, not a `vi.fn()` mock. It is what `quilty_auth` does on mobile (27 fakes for 33 ports — fakes only where the port has consumer-test demand). It is the explicit recommendation in [Yallin's "Fake, Don't Mock"](https://www.shaiyallin.com/post/fake-don-t-mock).

**Example.**

```ts
// packages/account/src/__fakes__/in-memory-session-store.ts
import type { Session, SessionStore } from "../ports/session-store";

export class InMemorySessionStore implements SessionStore {
  private store = new Map<string, Session>();
  async get(id: string) { return this.store.get(id) ?? null; }
  async put(s: Session) { this.store.set(s.id, s); }
  async revoke(id: string) { this.store.delete(id); }
}

// packages/account/package.json
{
  "exports": {
    ".": "./dist/index.js",
    "./testing": "./dist/testing.js"
  }
}

// packages/account/src/testing.ts
export { InMemorySessionStore } from "./__fakes__/in-memory-session-store";
```

**The "testing" subpath vs separate `@quilty/account-testing` package.** Either works. Subpath wins on simplicity (one package, one version, one CI build). Separate package wins on tree-shake guarantees (the `testing` code provably never ships to production). For Quilty's solo-team scale, **subpath** is the right default — separate-package can be triggered later if a fake imports a dev-only dependency (e.g., `@faker-js/faker`) that we want banned from prod bundles.

### 3.4 Parameterized contract tests via Vitest `describe.each` / `describe.for`

**What it is.** A single test suite is parameterized over `[real-adapter-factory, fake-adapter-factory]` and asserts the same behaviors against both. If the fake diverges from the real adapter on any contract assertion, the test fails. This is what [Yallin's article](https://www.shaiyallin.com/post/fake-don-t-mock) calls "contract tests," and what Vitest's `describe.each` (Jest-compat) or the newer `describe.for` (with fixture context) is built for.

**Where it lives.** In the port's package, next to the port definition. A shared `runSessionStoreContract(makeStore)` function is exported, and both `dynamo-session-store.test.ts` and `in-memory-session-store.test.ts` call it.

**Example.**

```ts
// packages/account/src/ports/session-store.contract.ts
import { describe, it, expect } from 'vitest';
import type { SessionStore } from './session-store';

export function runSessionStoreContract(
  name: string,
  make: () => Promise<{ store: SessionStore; cleanup?: () => Promise<void> }>,
) {
  describe(`SessionStore contract: ${name}`, () => {
    it('returns null for unknown id', async () => {
      const { store, cleanup } = await make();
      expect(await store.get('nope')).toBeNull();
      await cleanup?.();
    });
    it('get after put returns the same session', async () => {
      const { store, cleanup } = await make();
      const s = { id: 'abc', userId: 'u1', expiresAt: Date.now() + 60_000 };
      await store.put(s);
      expect(await store.get('abc')).toEqual(s);
      await cleanup?.();
    });
    it('revoke removes the session', async () => {
      const { store, cleanup } = await make();
      const s = { id: 'abc', userId: 'u1', expiresAt: Date.now() + 60_000 };
      await store.put(s);
      await store.revoke('abc');
      expect(await store.get('abc')).toBeNull();
      await cleanup?.();
    });
  });
}

// packages/account/src/__fakes__/in-memory-session-store.test.ts
import { runSessionStoreContract } from '../ports/session-store.contract';
import { InMemorySessionStore } from './in-memory-session-store';
runSessionStoreContract('in-memory', async () => ({ store: new InMemorySessionStore() }));

// packages/account/src/adapters/dynamo-session-store.test.ts (Tier-A — gated on AWS env)
import { runSessionStoreContract } from '../ports/session-store.contract';
import { DynamoSessionStore } from './dynamo-session-store';
// Tier-A: only runs in CI with AWS creds, against a real dev-account DynamoDB table.
const RUN_LIVE = process.env.QUILTY_LIVE_CONTRACT === '1';
(RUN_LIVE ? runSessionStoreContract : (runSessionStoreContract.skip ?? (() => {})))(
  'dynamodb-live',
  async () => {
    /* create ephemeral table, return cleanup */
  },
);
```

### 3.5 Recommendation: shared fakes in `__fakes__/` + parameterized contract tests via `describe.each`

Concrete rules:

1. **Default to fakes, not mocks.** `vi.mock()` is reserved for two cases: (a) third-party SDKs we never want to integrate against (e.g., mocking `fetch` for Resend API in a unit test), (b) Next.js framework module shapes (`next/headers`, `next/navigation`) that have no port-and-adapter wrapper.
2. **Fakes live in `src/__fakes__/`** in the same package as the port. Folder name follows Jest/Vitest convention so IDE search ignores them as test scaffolding.
3. **Exported via `./testing` subpath**, not a separate package. Trigger to split into `@quilty/<pkg>-testing` is "fake imports dev-only dep we don't want in prod tree-shaking analysis."
4. **Contract tests are first-class.** Every port that has ≥1 consumer outside its own package gets a `<port-name>.contract.ts` file exporting a `runFooContract(name, make)` function. Both the production adapter test and the fake's own test call this function.
5. **Tier-A wire-pin (mobile precedent).** The real-adapter contract test, by default, runs only when `QUILTY_LIVE_CONTRACT=1` is set, with credentials for the development AWS account. CI runs Tier-A nightly on `main`, not on every PR. This matches mobile's "Tier-A wire-pin against prod endpoint" cadence and protects against silent SDK-shape drift.

---

## 4. Mobile precedent applicability

The mobile package `quilty_auth` is a strong precedent and maps cleanly onto the web recommendations:

| Mobile pattern                                    | Web mapping                                                  | Notes                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 33 ports in `lib/<feature>/ports/`                | `src/ports/<port-name>.ts` per package                       | Direct map.                                                                                                                     |
| 27 fakes in `lib/<feature>/fakes/`                | `src/__fakes__/<fake-name>.ts`                               | Folder rename only (`__fakes__` matches Vitest convention; mobile uses `fakes/` — no functional difference).                    |
| Composition root in `app.dart`                    | `apps/web/src/composition.ts`                                | Direct map. Mobile uses `get_it` for service-locator; web is manual factory — both are "framework-light, hand-wired" in spirit. |
| Tier-A wire-pin smoke tests against prod endpoint | Tier-A live contract tests against dev-account AWS resources | Direct map with one caveat (see below).                                                                                         |
| Fake-to-port ratio ~80% (27/33)                   | Expect ~80% for web                                          | Some ports won't justify a fake — e.g., a logger port with one no-op fake doesn't need extraction.                              |

**One caveat on Tier-A wire-pinning.** Mobile pins against the _production_ Cognito endpoint because the read paths are safe (token introspection, JWKS fetch, well-known config). For web we should pin against the **dev account** Cognito user pool, _not_ production, because (a) web's contract tests include write paths (session put, session revoke) that mutate state, (b) running write tests against prod risks log pollution + rate-limit interference with real traffic + a HIPAA-boundary blur. Mobile-style "live wire-pin" is correct; "live wire-pin against prod" is not appropriate for web's broader test surface.

**Where the precedent does NOT apply.** Mobile uses Riverpod for in-app state propagation and `get_it` for service location. Both are framework-level concerns that don't have a useful web equivalent — Next.js solves the routing/state question with its own primitives (Server Components for state, route handlers for service entry points). The composition layer is the only place where we explicitly mirror mobile.

---

## 5. META-5 generator implications

The `turbo gen` generators we will define (per separate D74 / META-5 trigger) need to emit consistent file shapes. Specifically:

### 5.1 `turbo gen port` should emit

```
packages/<pkg>/src/ports/<port-name>.ts          # interface + types
packages/<pkg>/src/ports/<port-name>.contract.ts # runXyzContract(name, make) export
packages/<pkg>/src/ports/index.ts (update)       # re-export
```

The contract file is generated stub-only (one `describe.skip("contract: TODO", () => {})` block) so the discipline is "you cannot commit a port without a contract file" — empty contract is fine; missing contract fails lint via a `pnpm lint:ports` script that asserts every `<name>.ts` in `ports/` has a sibling `<name>.contract.ts`.

### 5.2 `turbo gen adapter` should emit

```
packages/<pkg>/src/adapters/<adapter-name>.ts        # concrete impl
packages/<pkg>/src/adapters/<adapter-name>.test.ts   # imports runXyzContract(name, makeAdapter)
```

The adapter's test file is generated with the contract import already wired up — the developer fills in `make()` (typically: instantiate adapter against a real or in-test resource). If the adapter is wire-pinned (Tier-A), the generator prompts: "Is this a live adapter? (y/N) — if y, wraps the test in `QUILTY_LIVE_CONTRACT=1` gate."

### 5.3 `turbo gen fake` should emit

```
packages/<pkg>/src/__fakes__/<fake-name>.ts        # in-memory impl
packages/<pkg>/src/__fakes__/<fake-name>.test.ts   # imports runXyzContract("in-memory", () => ...)
packages/<pkg>/src/testing.ts (update or create)   # re-export the fake
packages/<pkg>/package.json (update)               # ensure "./testing" subpath exists in exports
```

If `src/testing.ts` does not exist, the generator creates it and adds the `"./testing": "./dist/testing.js"` entry to the package's `exports` map.

### 5.4 Composition-root generator (`turbo gen wire`?)

Defer. The composition file is small enough (~60 lines through M9) that hand-editing it is fine. Generator becomes worth-it only at the trigger point where the file exceeds ~300 LoC or where wiring a new adapter requires updates in 4+ files (currently it requires updates in 1: `apps/web/src/composition.ts`).

### 5.5 Lint rules to ship alongside generators

- **`no-direct-adapter-import-outside-composition`**: ESLint rule that fails if any file other than `apps/web/src/composition.ts` (or future composition roots) imports from `**/adapters/*`. Forces all consumers to depend on ports + container.
- **`port-has-contract`**: lint script that asserts `<port>.ts` and `<port>.contract.ts` are paired.
- **`fake-exported-via-testing-subpath`**: lint script that asserts every file in `__fakes__/` is reachable from `src/testing.ts`.

These three rules collectively enforce the hexagonal discipline mechanically — fail-CI on violation — which is the only realistic way a solo team maintains the pattern's invariants (see file 16 §2.7 on "solo-team overhead").

---

## 6. Open questions and follow-ups

1. **Edge runtime composition.** If marketing routes ever opt into Next.js's Edge runtime (currently we are Node-only per D2), the `composition.ts` `globalThis` anchor still works but the _contents_ matter — `aws-sdk` is too large for edge. Out of scope here; revisit if/when an edge route lands.
2. **Async composition.** Some adapters need async startup (e.g., reading a Parameter Store secret). The recommended pattern is `getContainer()` returns synchronously with lazily-initialized adapters that handle their own first-call await. Avoid `getContainerAsync()` — it forces every consumer into top-level await territory.
3. **Test data builders.** Out of scope for this file. Fakes hold state, but test data (e.g., a valid `Session` object) deserves its own builder pattern — possibly via `@quilty/<pkg>/testing` re-exports. Defer to a M2 fixture-pattern decision.

---

## 7. Sources

**Composition root:**

- [Mark Seemann — Composition Root (2011, foundational)](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)
- [Mark Seemann — Ports and Fat Adapters (April 2025)](https://blog.ploeh.dk/2025/04/01/ports-and-fat-adapters/)
- [Effect-TS — Layer documentation](https://effect.website/docs/requirements-management/layers/)
- [tsyringe — Microsoft GitHub](https://github.com/microsoft/tsyringe)
- [awilix — Jeff Hansen GitHub](https://github.com/jeffijoe/awilix)
- [Hawu Wang — Global Singleton and the Runtime Hell in Next.js (2024)](https://www.hawu.me/dev/6268)
- [vercel/next.js — Canonical approach to instantiating singletons in NextJS (Discussion #68572)](https://github.com/vercel/next.js/discussions/68572)
- [vercel/next.js — Singleton class across multiple requests in route handlers (Discussion #55263)](https://github.com/vercel/next.js/discussions/55263)
- [vercel/next.js — App Router 14.2.3 Inconsistent Singleton (Issue #65350)](https://github.com/vercel/next.js/issues/65350)
- [Lazar Nikolov — nextjs-clean-architecture (Sentry DevRel reference)](https://github.com/nikolovlazar/nextjs-clean-architecture)
- [Redux Toolkit — Setup with Next.js (per-request makeStore factory)](https://redux.js.org/usage/nextjs)

**Test patterns:**

- [Shai Yallin — Fake, Don't Mock](https://www.shaiyallin.com/post/fake-don-t-mock)
- [J.B. Rainsberger — Integrated Tests Are a Scam](https://blog.thecodewhisperer.com/permalink/integrated-tests-are-a-scam)
- [Khalil Stemmler — Repository, DTO, Mapper (TypeScript DDD)](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/)
- [Vitest — describe.each / test.each / it.for (API docs)](https://vitest.dev/api/test)
- [Vitest — Test Context and fixtures](https://vitest.dev/guide/test-context)
- [Tom MacWright — Vitest with async fixtures and it.for/it.each (March 2025)](https://macwright.com/2025/03/06/vitest-async-fixtures-and-for)
- [getsentry/sentry-javascript — `packages/core/test/mocks/client.ts` (TestClient pattern)](https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/test/mocks/client.ts)
- [getsentry/sentry-javascript — `packages/core/test/lib/integration.test.ts` (parameterized contract tests)](https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/test/lib/integration.test.ts)
- [Next.js — Vitest testing guide](https://nextjs.org/docs/app/guides/testing/vitest)
