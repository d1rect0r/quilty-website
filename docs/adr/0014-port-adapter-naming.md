# ADR-0014: Port-adapter naming + vendor-agnostic role discipline (META-1)

- **Status:** Accepted
- **Date:** 2026-05-25
- **Last reviewed:** 2026-05-25
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** `docs/research/round_6_foundation_audit/decisions-log.md` § META-1
- **Related decisions:** D75 (modular monolith), D76 (hexagonal-by-boundary), D77 (composition root), D78 (vendor SDK chokepoint), D79 (cross-package barrel rule), D81 (subsumed into META-1), META-1 (vendor-agnostic naming), META-2 (no workflow-context in source)
- **Related ADRs:** [ADR-0001](0001-monorepo-shape.md), [ADR-0008](0008-modular-monolith.md), [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md), [ADR-0013](0013-phi-scrubber-port.md), [ADR-0015](0015-monorepo-packaging-tooling.md)
- **Related research:** `docs/research/round_6_foundation_audit/_raw/12-enterprise-consumer-app-architecture.md` § Stripe / Plaid / Linear naming conventions; `docs/research/round_6_foundation_audit/_raw/14-typescript-hexagonal-implementation.md` § Port shapes; 8th Light hexagonal-architecture notes (rejected `<Port>UsingVendor` suffix pattern)
- **Software versions assumed:** TypeScript 5.7, ESLint 9, dependency-cruiser 17, Node 24

## Context

The hexagonal-by-boundary architecture (ADR-0009) separates ports (typed interfaces) from adapters (vendor-bound implementations). The composition root (ADR-0010) is the single seam where adapter selection happens. ADR-0013's PHIScrubber port is the most recent example: an `Analytics`-like role with a `makeSentryErrorReporter()` adapter + a `makeInMemoryErrorReporter()` test fake.

Round 6 Foundation Audit Agent 1 surfaced a naming-drift risk that grows linearly with package count: without a single locked convention, future packages would mix `<Vendor><PortName>`, `<PortName>UsingVendor` (8th Light), `<PortName>Impl`, `<PortName>Service`, etc. Each style is internally consistent but the cross-package surface stops being legible.

The Round-6-locked posture (META-1) is to write the convention down once + enforce it at three layers (ESLint vendor-SDK chokepoint + dependency-cruiser barrel rule + Plop generator suite from ADR-0015). The convention has been in tacit use since the first port shipped at Wave 2; this ADR makes it explicit so post-M1.5 contributors have a load-bearing reference.

The "do nothing" outcome: the convention is documented only in code review comments and CLAUDE.md prose; a new package eventually ships with `<PortName>Service` suffix or `<Vendor><PortName>Service`, and the cross-package legibility erodes one PR at a time. This is the same drift mode that hit Stripe's pre-2018 SDK + Plaid's pre-2020 server library before each company locked vendor-agnostic port naming via internal RFCs.

## Decision

The convention has four locked rules. Each rule is enforceable by existing automation; no rule is a convention-only ask.

### Rule 1: Port names are role-shaped, vendor-agnostic, PascalCase nouns

Examples (current state):

| Package                 | Port surface                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `@quilty/email`         | `EmailSender`                                                                           |
| `@quilty/captcha`       | `CaptchaVerifier`                                                                       |
| `@quilty/rate-limit`    | `RateLimiter`                                                                           |
| `@quilty/security`      | `Sanitizer`, `RedirectValidator`                                                        |
| `@quilty/consent`       | `ConsentReader`, `ConsentStore`                                                         |
| `@quilty/observability` | `Analytics`, `ErrorReporter`, `Logger`, `Replay`, `FeatureFlagEvaluator`, `PHIScrubber` |

Banned suffixes:

- `Service` — too generic; doesn't communicate role intent. `EmailSenderService` reads worse than `EmailSender`. Plop generator `port.message` validator rejects names ending in `Service`.
- `Impl` — implementation-leakage in the port name; the port is the contract, not the implementation.
- Vendor names — `AmplitudeAnalytics` as a port shape leaks the vendor into every consumer. Vendor names appear ONLY in adapter file paths.

### Rule 2: Adapter factories use `make<Vendor><PortName>()` naming

The factory function name encodes BOTH the vendor and the port. This is the only place in the codebase where vendor names appear in identifiers.

Examples (current state — 21 factories across 5 of the 6 port packages; `@quilty/security` is a domain-policy port with zero vendor adapters):

| Package                 | Adapter factories                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@quilty/email`         | `makeInMemoryEmailSender()`, `makeSesEmailSender()`                                                                                                                                                                                                                                                                           |
| `@quilty/captcha`       | `makeInMemoryCaptchaVerifier()`, `makeTurnstileCaptchaVerifier()`                                                                                                                                                                                                                                                             |
| `@quilty/rate-limit`    | `makeInMemoryRateLimiter()`, `makeDynamoDbRateLimiter()`                                                                                                                                                                                                                                                                      |
| `@quilty/observability` | `makeAmplitudeAnalytics()`, `makeInMemoryAnalytics()`, `makeSentryErrorReporter()`, `makeInMemoryErrorReporter()`, `makeCloudWatchLogger()`, `makeBrowserLogger()`, `makeInMemoryLogger()`, `makeEnvFlagEvaluator()`, `makeInMemoryFeatureFlagEvaluator()`, `makeSentryReplay()`, `makeInMemoryReplay()`, `makePhiScrubber()` |
| `@quilty/consent`       | `makeInMemoryConsentStore()`, `makeDynamoDBConsentStore()`, `makeDefaultDenyConsentReader()`                                                                                                                                                                                                                                  |
| `@quilty/security`      | _(no vendor adapters; `Sanitizer` + `RedirectValidator` are domain-policy ports — implementation in `packages/security/src/domain/*.ts`, consumed directly by the composition root)_                                                                                                                                          |

Note: the `DynamoDB` vs `DynamoDb` casing inconsistency (`makeDynamoDBConsentStore` vs `makeDynamoDbRateLimiter`) is a real codebase-level inconsistency that this ADR faithfully reflects but does not endorse. Going forward, Handlebars `pascalCase` on the Plop `adapter` generator's `dynamodb` vendor input produces `DynamoDb`; the next vendor-adapter PR touching DynamoDB should codemod `makeDynamoDBConsentStore` → `makeDynamoDbConsentStore` for consistency.

Two exceptions to `make<Vendor><PortName>`:

- `makePhiScrubber()` — no vendor prefix because the PHI scrubber is project-canonical (no vendor-native alternative; the implementation IS the only adapter). ADR-0013 documents this.
- `makeDefaultDenyConsentReader()` — domain-layer policy adapter, not a vendor adapter. The "vendor" slot is replaced by the policy posture (`DefaultDeny`).

Banned forms:

- `<Vendor><PortName>()` without the `make` prefix — collides with class-name-shaped reads at call sites; loses the "this is a factory" semantic.
- `create<Vendor><PortName>()` — `create` is reserved for value-constructors in TypeScript canon (`createMyType()` returns a `MyType` value); adapter factories return an object that satisfies an interface, not a value.
- `<PortName>UsingVendor` (8th Light pattern) — inverts call-site readability. `EmailSenderUsingSes` reads worse than `makeSesEmailSender` at the composition root.

### Rule 3: Package npm-scoped names are `@quilty/<kebab-case-role>`

Vendor names NEVER appear in package surfaces. Current state:

```
@quilty/captcha          @quilty/observability    @quilty/security
@quilty/consent          @quilty/rate-limit       @quilty/seo
@quilty/content          @quilty/shared-types
@quilty/email
```

Plop generator `package.name` validator rejects vendor-shaped names + reserved names (`ui`, `app`, `src`, `lib`, `utils`, `config`).

### Rule 4: Test fakes use `make<In-Memory|Default<Posture>><PortName>()` naming

In-memory fakes follow `makeInMemory<PortName>()` exclusively. Policy-shaped fakes (rare) use `make<Posture><PortName>()` where `<Posture>` documents the policy (e.g., `DefaultDeny`).

Test fakes live at `packages/<role>/src/adapters/in-memory.ts` (the adapter file) AND are re-exported through `packages/<role>/src/__fakes__/index.ts` (the test-only barrel). The two-barrel discipline is enforced by dependency-cruiser allowlist regex: cross-package consumers can ONLY import from `<role>/src/index.ts` or `<role>/src/__fakes__/index.ts`. Deep-imports into adapter files from other packages fail the build.

### Rule 5: Adapter boundary translates ALL vendor errors into the port's typed-error union

Every adapter MUST translate vendor-thrown errors into the port's `packages/<role>/src/errors.ts` typed-error union before they cross the adapter boundary. A vendor error type (`AmplitudeError`, `SesV2ServiceException`, etc.) MUST NEVER escape the adapter. This is the most-cited hexagonal-architecture footgun in 2024-2025 retros (Plaid's 2024 adapter-contract RFC; Stripe's internal port-discipline writeup): a leaking `AmplitudeError` defeats the vendor-swap invariant because the next vendor adapter throws a different shape, and every consumer's catch-block now has to know about both.

Mechanically: each adapter wraps its vendor SDK calls in a try/catch that maps the vendor error class to one of the port's typed-error union members. The `makeSesEmailSender()` adapter (wrapping AWS SDK v3 `SESv2Client` calls — translates `SesV2ServiceException` shapes into the `@quilty/email/src/errors.ts` typed union) and the `makeTurnstileCaptchaVerifier()` adapter (wrapping the Turnstile siteverify HTTP endpoint — translates network + non-200 + invalid-payload shapes into the `@quilty/captcha/src/errors.ts` typed union) are the exemplars. PHI-scrubber-shaped domain adapters (e.g., `makePhiScrubber()`) have no vendor SDK calls and therefore no vendor errors to translate; Rule 5 applies to vendor-bound adapters specifically.

### Rule 6: Port evolution follows SemVer with a deprecation window

Workspace packages today share a `0.1.x` major and roll together (D75 modular-monolith pivot). When the first package is extracted to a separate publication cadence:

- **Breaking port changes** (added required field, removed method, type-narrowing return) → major-bump + 90-day `@deprecated` JSDoc window on the previous shape.
- **Additive port changes** (new optional field, new method, type-widening return) → minor-bump.
- **Adapter-internal changes** (vendor SDK version pin, perf improvement, fix) → patch-bump.

Until extraction, the discipline is encoded in PR review: a port-shape change without a `@deprecated`-marked legacy alternative is a red flag for cross-package consumers. The Plop `port` generator does not yet emit deprecation scaffolding; revisit when the first port-breaking PR lands.

### Rule 7: Package ownership via CODEOWNERS

When a second engineer joins (the on-call trigger from `docs/runbook/oncall-trigger.md`), every workspace package declares an owner in `.github/CODEOWNERS`:

```
/packages/email/        @founder @on-call-rotation
/packages/observability/ @founder
```

Until then, the founder is the de facto owner of every package; this Rule is the documented future-state, not the M1.5 close-pass state. The `package` generator's Plop config should emit a CODEOWNERS append step at the 2nd-engineer milestone.

## Consequences

### Positive

- **Vendor swap is a single-file change.** Replacing Amplitude with PostHog (D42b Round-5 lock) is a `packages/observability/src/adapters/posthog.ts` add + an `apps/web/composition.server.ts` line swap — the port shape doesn't move, no consumer changes.
- **Cross-package legibility.** A reader can scan `apps/web/composition.server.ts` and learn the entire adapter selection in one screen of `make*` calls.
- **Author-time chokepoint.** Plop generators reject vendor-shaped port names + banned suffixes at scaffold time; the `<Vendor>Service` failure mode never reaches review.
- **ESLint + dep-cruiser sealed.** `no-restricted-imports` confines vendor SDK imports to `packages/*/src/adapters/**/*.ts` (eslint.config.mjs); dep-cruiser's `no-direct-vendor-sdk-outside-adapter-chokepoint` rule catches the bypass-via-relative-import shape.
- **Test discipline.** The `__fakes__` barrel makes test wiring explicit at the import site; a test importing `@quilty/email` (production barrel) is suspect, importing `@quilty/email/testing` (fake barrel) is the expected shape.

### Negative

- **`make` prefix is a soft convention nobody can enforce mechanically.** A future contributor could name a factory `buildSesEmailSender()` and pass review. Mitigated by: Plop generator emits `make*` names by default + code review pattern + this ADR's binding documentation.
- **Two-barrel discipline adds boilerplate.** Each package maintains `src/index.ts` AND `src/__fakes__/index.ts`. The Plop `port` + `fake` generators auto-append to both barrels; manual edits remain possible but discouraged.
- **The `<Vendor><PortName>` pattern doesn't compose neatly for multi-vendor adapters.** If a future port needs an adapter spanning two vendors (e.g., "AWS + Datadog" combined logger), the naming is awkward (`makeAwsDatadogLogger()`). The 3×3 trigger from ADR-0010 (3 packages × 3 ports each before adopting a DI container) is the earliest practical point to revisit this; multi-vendor adapters are unlikely before then.

### Neutral

- **The `Sanitizer` port is a domain-policy port, not a vendor-port.** It has zero vendor adapters today — the implementation lives in `packages/security/src/domain/sanitizer.ts` and the composition root wraps consumers in it directly. This is acceptable: not every port needs a vendor variant. Domain-only ports are still ports; ADR-0009's hexagonal-by-boundary discipline applies.
- **The 9-value `AccountDeleteReason` discriminated union (D137 expansion, Wave 6 Commit 33) is NOT a port** — it's a domain type. The port-adapter rules apply to interfaces with vendor-swappable implementations, not closed-set value types.

## Alternatives considered

### Alternative A: `<PortName>UsingVendor` suffix (8th Light)

- **What it is:** `EmailSenderUsingSes`, `AnalyticsUsingAmplitude`. Names the port first, the binding second.
- **Why rejected:** Reads worse at call sites where the action verb wants to come first (`makeSesEmailSender()` reads as "make an SES email sender" — natural language). The 8th Light pattern reads as a sentence with the verb second (`EmailSenderUsingSes` — "an email sender that uses SES" — passive voice). Round 6 Agent 2 surfaced this pattern as the most-cited alternative; the rejection is on call-site ergonomics.

### Alternative B: `<Vendor><PortName>` without `make` prefix

- **What it is:** `SesEmailSender()`, `AmplitudeAnalytics()`.
- **Why rejected:** Without the `make` prefix the factory looks like a class constructor at the call site; readers reach for `new` even though the factories return plain objects. The `make` prefix is the locked TypeScript-canon factory-function convention (referenced in Effective TypeScript Item 30 + the React community style guide).

### Alternative C: `<PortName>Impl` suffix

- **What it is:** `EmailSenderImpl`, `EmailSenderSesImpl`, etc.
- **Why rejected:** `Impl` is a Java-canon leakage (the JVM lacks first-class interface/struct discrimination, so `*Impl` is the conventional disambiguator). TypeScript expresses the port/adapter split structurally; `Impl` adds noise without disambiguation. Reviewers from a Java background sometimes default to this; the ADR is the rejection record.

### Alternative D: vendor-named packages (`@quilty/sentry`, `@quilty/amplitude`)

- **What it is:** Each vendor adapter ships as its own package.
- **Why rejected:** Forces every consumer to know which vendor is "currently selected" at import time. The role-shaped `@quilty/observability` package + composition-root selection inverts this — consumers import the role, the composition root picks the vendor. D42b's Amplitude → PostHog vendor swap is a single composition-root edit; if Amplitude had been the package name, it'd be a rename + import-rewrite across every consumer.

### Alternative E: `create<Vendor><PortName>` (TypeScript community-norm factory prefix)

- **What it is:** A common TypeScript community convention is `create*` for any factory function returning a typed value, regardless of whether the return is a class instance or an object literal. The React community style guide (`useStore = create((set) => ...)`) and the Effect.ts ecosystem both favour `create*` broadly.
- **Why we landed on `make*`:** The codebase's existing convention (chosen at the first port shipped in Wave 2) was `make<Vendor><PortName>`. The semantic split between `create*` (value-constructor returning the type the function name implies — `createUser({ ... }): User`) and `make*` (object-literal factory satisfying an interface — `makeSesEmailSender(): EmailSender`) is a soft-but-useful disambiguation in this codebase: a reader sees `make*` and knows "this is an interface-satisfying factory, not a value-constructor." The community norm `create*` works fine but loses that disambiguation. Both are defensible; consistency with the rest of the codebase wins.

## Compliance / Verification

Three automation layers enforce the rules:

1. **ESLint `no-restricted-imports`** (`eslint.config.mjs` lines 32-58, allowlist at lines 348-357). Restricts `@sentry/nextjs`, `@amplitude/analytics-browser`, `@amplitude/analytics-node`, `posthog-js`, `posthog-node` to `packages/*/src/adapters/**/*.ts`, `apps/web/sentry.*.config.ts`, `apps/web/instrumentation.ts`. The legacy entries shrink as adapters migrate to `@quilty/observability`.
2. **dependency-cruiser** `no-direct-vendor-sdk-outside-adapter-chokepoint` rule (`.dependency-cruiser.cjs` lines 43-61). Catches the bypass-via-relative-import shape (`import '@amplitude/...'` from a file outside the allowlist).
3. **Plop generator** validators in `turbo/generators/config.ts` (the `port` + `package` + `adapter` generators). Reject banned port-name suffixes (`Service`) + reserved package names + non-PascalCase port names + non-kebab-case package/vendor names.

The Round-6 audit's verification surface is: `find packages -name "ports.ts"` lists 6 files; each port file's named exports are PascalCase nouns without `Service`, `Impl`, or vendor names. `find packages -path "*/adapters/*"` lists adapter files; each adapter exports at least one `make*` factory whose name matches `make<Vendor><PortName>` or `makeInMemory<PortName>` or `make<Posture><PortName>`. These greps form the verification baseline; future audits can re-run them as regression checks.

## Revisit triggers

- The first multi-vendor adapter request (e.g., a logger that fans out to BOTH CloudWatch AND Datadog through a single interface). Revisit the naming to handle the 2-vendor case.
- The first `Service`-suffix request from a contributor with a sustained Java background. Confirm the rationale still holds + document the rejection record.
- When the 3×3 DI-container trigger from ADR-0010 fires. A DI container library (`@evyweb/ioctopus`, `tsyringe`) may change the registration shape — confirm the `make<Vendor><PortName>` factory naming survives the migration or define a successor convention before adoption.
- When a contributor proposes a new vendor adapter for an existing port. Use the PR as a verification point that the convention still scales.
- The first port with hot-path performance sensitivity (likely `RateLimiter` or `Logger` at production scale). Add a `performance budget` field to the port's parameterized contract test asserting an upper bound on p99 latency for both the in-memory fake and the production adapter; Discord's internal port contracts use this shape to catch the in-memory-50µs vs DynamoDB-80ms cliff before production traffic exposes it.
- When the 2nd engineer is hired and the on-call trigger fires (`docs/runbook/oncall-trigger.md`). Activate Rule 7 (CODEOWNERS) at that milestone + extend the Plop `package` generator to append CODEOWNERS lines.
