# ADR-0015: Monorepo packaging tooling — `turbo gen` 5-generator suite (META-5)

- **Status:** Accepted
- **Date:** 2026-05-25
- **Last reviewed:** 2026-05-25
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** `docs/research/round_6_foundation_audit/decisions-log.md` § META-5
- **Related decisions:** D75 (modular monolith), D76 (hexagonal-by-boundary), D77 (composition root), D78 (vendor SDK chokepoint), D79 (cross-package barrel rule), META-1 (vendor-agnostic naming), META-5 (5-generator suite)
- **Related ADRs:** [ADR-0001](0001-monorepo-shape.md), [ADR-0008](0008-modular-monolith.md), [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md), [ADR-0014](0014-port-adapter-naming.md)
- **Related research:** `docs/research/round_6_foundation_audit/_raw/15-monorepo-tooling.md` § Plop + Turborepo generator survey; Turborepo 2.x release notes on bundled Plop runner; Nx schematics comparison (rejected as over-engineered for the 8-package scale)
- **Software versions assumed:** Turborepo 2.9, pnpm 10, `@turbo/gen` (bundled with Turborepo 2.2+), Node 24

## Context

The hexagonal-by-boundary architecture (ADR-0009) plus the port-adapter naming discipline (ADR-0014) demand a non-trivial set of files for every new package:

- `package.json` with the canonical `@quilty/<role>` scope, `exports` map for both production + testing barrels, dependency shape matching the rest of the workspace
- `tsconfig.json` extending the workspace base + listing project references
- `src/index.ts` — production barrel
- `src/ports.ts` — port interface(s)
- `src/errors.ts` — typed-error union
- `src/adapters/in-memory.ts` — initial in-memory adapter
- `src/__fakes__/index.ts` — test-only barrel
- `src/__fakes__/<port>.fake.ts` — per-port test fake
- `src/__tests__/<port>.contract.test.ts` — parameterized contract test
- README.md describing the package role

Plus the cross-cutting wiring: Knip workspace entry, dependency-cruiser allowlist regex update, package-level `tsconfig.json` reference from the workspace base, and (for client-shipped packages) a `.size-limit.cjs` budget.

Hand-scaffolding this is error-prone: forget the `__fakes__/index.ts` barrel and the contract test fails with a module-not-found error; forget the `exports` map for `/testing` subpath and consumer test files can't import the fake; forget the dep-cruiser allowlist entry and the cross-package barrel rule blocks the new package; forget the `Service` suffix ban and code review catches it on round 3.

The Round 6 Foundation Audit's Agent 4 (monorepo-tooling deep dive) surfaced a Plop generator suite as the load-bearing pattern at this scale: Stripe's internal monorepo, Plaid's server libraries, and Linear's design-system repo all use a Plop-shaped generator at the early-package-stage (5-15 packages). Above ~30 packages, Nx schematics or Bazel rules become competitive. Quilty's 8-package shape today + ~15-package projected ceiling lands squarely in the Plop sweet spot.

The "do nothing" outcome: each new package is hand-scaffolded; the first 1-2 packages are clean (recent reference), the 3rd onward starts drifting (forgotten `__fakes__/index.ts`, ad-hoc `tsconfig` shape, missing Knip entry). The drift compounds; the chokepoints designed in ADR-0009 + ADR-0014 erode one PR at a time.

## Decision

We will ship a 5-generator suite via `turbo gen` (Plop under the hood). Each generator scaffolds one specific package-related operation; together they cover the full hexagonal-by-boundary surface.

Registration order in `turbo/generators/config.ts` (matches the file): `package`, `utility-package`, `port`, `adapter`, `fake`. Below they're grouped by usage frequency rather than registration order — `package` first because it's the most common entry-point + `utility-package` last because it's the rare case.

### Generator 1: `package`

Creates a new hexagonal workspace package with one initial port + one in-memory adapter + a parameterized contract test.

Prompts: package role name (kebab-case, vendor-agnostic), description, initial port name (PascalCase). Validators reject reserved names (`ui`, `app`, `src`, `lib`, `utils`, `config`), vendor-shaped names, and the `Service` suffix (META-1).

Outputs the 10 files listed in Context — every package starts life with the canonical shape.

### Generator 2: `port`

Adds a new port to an EXISTING package. Appends to `src/ports.ts` and `src/__fakes__/index.ts` (the barrel exports); adds `src/__fakes__/<port>.fake.ts` and `src/__tests__/<port>.contract.test.ts`.

The barrel-append step is load-bearing: without it, the new fake is unreachable via the `@quilty/<role>/testing` subpath export and the parameterized contract test fails with a module-not-found error. The generator's inline comment in `turbo/generators/config.ts` calls this out for future maintainers.

### Generator 3: `adapter`

Adds a vendor adapter implementation for an EXISTING port. Prompts for package, port name, and vendor name (lowercase + kebab-case). Outputs `packages/<role>/src/adapters/<vendor>.ts` + `packages/<role>/src/adapters/<vendor>.test.ts`.

Vendor-name validator enforces the META-1 rule that vendor names ONLY appear in adapter file paths + adapter factory names.

### Generator 4: `fake`

Adds (or replaces) the in-memory fake adapter for an EXISTING port. Prompts for package + port name. Outputs `packages/<role>/src/adapters/in-memory.ts` with `force: true` (replaces existing — used when iterating on the fake shape).

### Generator 5: `utility-package`

Creates a pure utility workspace package — no ports/adapters subtree, just typed exports. Used for packages like `@quilty/seo`, `@quilty/content`, `@quilty/shared-types` that hold helpers without vendor-swappable behaviour.

Outputs `package.json`, `tsconfig.json`, README, and `src/index.ts`. No `ports.ts`, no `adapters/`, no `__fakes__/`.

### Invocation

```
pnpm exec turbo gen package
pnpm exec turbo gen port
pnpm exec turbo gen adapter
pnpm exec turbo gen fake
pnpm exec turbo gen utility-package
```

The Plop runner prompts interactively for inputs.

## Consequences

### Positive

- **Scaffold-in-30-seconds.** A new package goes from `pnpm exec turbo gen package` to a passing `pnpm test --filter @quilty/<new>` in under 30 seconds. No drift, no missing files, no `Service`-suffix slip past review.
- **Templates ARE the convention.** The `templates/` directory is the source of truth for what a "canonical package" looks like. Updating the template propagates to every future package; the existing-package backfill is a deliberate operation, not silent drift.
- **Generator validators are author-time chokepoints.** Port-name and package-name validators reject banned suffixes + reserved names before the file system is touched. This is the same shift-left posture as the ESLint PHI-in-error rules from ADR-0013.
- **Knip-aware.** `knip.json`'s root workspace entry includes `turbo/generators/config.ts` + `turbo/generators/templates/**` (see `knip.json` line 5), so Knip understands the generator surface and doesn't flag the templates as unused.
- **Plop is bundled.** Turborepo 2.2+ ships `@turbo/gen` (a wrapper around Plop). No separate `pnpm add -D plop` step; no new top-level dependency. The cost of the suite is just the `turbo/generators/config.ts` + `templates/**` files.

### Negative

- **The cross-cutting wiring is NOT fully auto-updated.** The 5 generators emit per-package files cleanly, but workspace-level files (dep-cruiser allowlist regex, Knip workspaces list, root `.size-limit.cjs` per-package budgets) currently require manual updates. The Round-6 plan called for auto-wiring all of these; the M1.5 implementation focused on the high-volume per-package file emission. **Future work:** extend the `package` generator with appended `actions` that update the workspace-level surfaces.
- **`.size-limit.cjs` only carries app-level budgets at M1.5 close** — no per-package budgets. The Plop generator doesn't yet emit per-package size-limit entries. This is intentional: per-package size-limit only matters when a package ships client-side; the current shape (`@quilty/security/client`, `@quilty/seo`, `@quilty/observability` runtime) is small enough that the app-level total budget covers the regression surface. Revisit when a new client-shipped package lands with non-trivial weight.
- **Plop's `force: true` on the `fake` generator overwrites without a diff prompt.** Iterating on a fake shape blows away the previous version. This is the documented Plop default; the alternative (`force: false`) would require manually deleting the existing file first. The faster iteration loop is the right trade-off for the test-fake use case.
- **Template drift risk.** If the templates and the existing packages diverge over time (a manual edit to a package that doesn't backfill to the template), new packages diverge from existing ones. Mitigated by a recommended cadence: when a contributor finds a missing template field, the same PR updates the template + every package that should match.
- **Generator-injection + template-vetting failure mode.** Plop runs arbitrary JS from `turbo/generators/config.ts`; a malicious PR could land a generator that exfiltrates `.env` or writes outside the workspace. Backstage Software Templates spec calls this out (`spec.steps` allowlist). Mitigation in the M1.5 close: CODEOWNERS lock on `turbo/generators/**` once CODEOWNERS lands (per ADR-0014 Rule 7), and a dependency-cruiser rule forbidding `turbo/generators/**` from importing outside the workspace (deferred to the first contributor-facing PR that ships a generator change — until then the founder is the sole author).
- **Validator-bypass via direct file authoring.** The generator's `Service`-suffix rejection is shift-left, but a contributor can still hand-write `EmailSenderService` in `ports.ts`. The Plop validator does not run on existing files. Mitigation (future work): a runtime `scripts/verify-conventions.ts` CI step that greps every `packages/*/src/ports.ts` for banned suffixes (`Service`, `Impl`, vendor names) — the same shape as `scripts/check-no-workflow-context.mjs` (META-2 gate). Tracked as a follow-up; not blocking for M1.5.
- **CI-mode for Plop interactive prompts is not yet wired.** `@turbo/gen` prompts interactively; codemod-style refactors (`pnpm exec turbo gen package --name=foo --port=Bar --description="..."` from a CI script) require all prompts to also accept CLI flags. Plop supports this natively but the current config.ts doesn't enumerate CLI-flag aliases. Mitigation: add CLI-flag aliases when the first CI-driven generator invocation is needed; until then, interactive prompts are the only path and the M1.5-close documentation reflects that.

### Neutral

- **No `gen:*` or `generate:*` scripts in the root `package.json`.** Generators invoke via `pnpm exec turbo gen <name>`. Documented in the config.ts header comment + this ADR. Adding script aliases is a cheap follow-up if discoverability becomes a complaint.
- **`pnpm-workspace.yaml` is the only place that controls workspace membership** (`apps/*` + `packages/*`). The generators emit into these directories; pnpm picks up the new workspace on the next `pnpm install`.
- **The generators emit BOTH the production barrel (`src/index.ts`) AND the test-only barrel (`src/__fakes__/index.ts`).** The two-barrel discipline (ADR-0014 Rule 4 + dep-cruiser allowlist) is structural; generators preserve it. A `package.json` `exports` map entry for the `/testing` subpath is included in the template so consumers can `import { makeInMemory<X> } from '@quilty/<role>/testing'` without reaching into internals.

## Alternatives considered

### Alternative A: Nx schematics

- **What it is:** Nx ships first-class generators (`nx g`) with a richer feature set than Plop (chained generators, executor abstractions, project-graph integration).
- **Why rejected:** Nx assumes the Nx project-graph + executor model; adopting it just for generators is over-engineered at 8 packages. The Round 6 Agent 4 survey set the migration crossover at ~30 packages; we're 22 packages away. Plop is light enough to remove without leaving infrastructure debt if we do migrate to Nx later.

### Alternative B: Hand-rolled bash scripts (`scripts/new-package.sh`)

- **What it is:** Shell scripts that `cp -r` a template directory + `sed` the package name.
- **Why rejected:** Brittle (whitespace handling, cross-platform path issues, no validator hooks at scaffold time). The Plop generator's validator step rejects banned names BEFORE files are written; a bash script would have to validate, then unwind on rejection.

### Alternative C: Yeoman generators

- **What it is:** Yeoman is the long-standing JavaScript generator framework that pre-dates Plop.
- **Why rejected:** Yeoman has been declining since ~2020 (npm-trends shows Plop overtook in 2022); the ecosystem maintenance is uneven; Turborepo doesn't bundle a Yeoman runner. Plop is the lighter-weight successor that Stripe + Plaid + Linear migrated to.

### Alternative D: Just hand-scaffold every package (no generator)

- **What it is:** Each new package is a manual `mkdir` + `pnpm init` + manual file authoring + manual barrel + manual contract test.
- **Why rejected:** The Round 6 ADR-0009 + ADR-0014 + ADR-0013 stack has enough load-bearing per-package boilerplate (10 files at the minimum) that drift is inevitable by package #5. The "do nothing" failure mode in Context above is the explicit rejection rationale.

### Alternative E: GitHub Copilot / Claude Code generates the package on demand

- **What it is:** Use an LLM to scaffold a new package given a free-text description.
- **Why rejected:** LLM-generated packages drift from canon — the LLM may emit `EmailSenderService`, may forget the `__fakes__/index.ts` barrel, may use a vendor name in the package surface. The Plop generator's validators are deterministic chokepoints that an LLM can't bypass. LLM scaffolding is acceptable for one-off helper files; package scaffolding wants determinism.

### Alternative F: Backstage Software Templates

- **What it is:** Spotify's open-source generator framework (`@backstage/plugin-scaffolder`); declarative `template.yaml` files describing scaffolding steps via an allowlisted step library (`fetch:template`, `publish:github`, etc.).
- **Why rejected:** Backstage Software Templates are designed to run inside a Backstage portal (catalog + scaffolder backend + auth provider — the standard deployment), which is operational overhead the M1.5 close cannot justify. A standalone mode via `@backstage/create-app` + an in-process SQLite backend is technically possible but still requires the scaffolder backend to be running to consume templates. The value-add is centralized template governance across teams; Quilty Inc. is a single-engineer monorepo today. Backstage becomes worth it at the ~50-team-shared-monorepo scale where centralized governance is load-bearing. Revisit if Quilty Inc. grows to that scale.

### Alternative G: Cookiecutter (Python-canonical)

- **What it is:** Python-ecosystem generator framework using Jinja2 templates + `cookiecutter.json` prompt definitions.
- **Why rejected:** Python tooling cost (the website tier is TypeScript-native; adding a Python interpreter requirement for scaffolding violates the "the website monorepo is a TypeScript-only toolchain" invariant). Plop / `@turbo/gen` provides the same shape with zero ecosystem mismatch.

## Compliance / Verification

The generator suite is verified by use: every package created post-M1.5 should run through `pnpm exec turbo gen package`. Verification checks:

- The new package passes `pnpm typecheck`, `pnpm lint`, `pnpm test` immediately after generation (with one stub assertion in the contract test).
- The new package's `src/__fakes__/index.ts` exports through the `/testing` subpath export and is consumable from another package's test file.
- The new package's port name passes the META-1 validator (no `Service` suffix, no vendor name).
- The new package's `package.json` name matches `@quilty/<kebab-case>` and is NOT a reserved name.

The Round-6 audit's verification surface:

- `turbo/generators/config.ts` exists and exports exactly 5 generators.
- `turbo/generators/templates/` contains 5 subdirectories matching the generator names.
- `knip.json` workspace `.` entry's `entry` array includes `turbo/generators/config.ts` (otherwise Knip flags the templates as unused).
- `package.json` does NOT add a top-level `plop` dependency (Plop is bundled with `@turbo/gen`).

## Revisit triggers

- **Package count crosses ~30.** At that scale, Nx schematics' project-graph integration becomes worth the migration cost. Revisit the Plop vs Nx choice.
- **A new generator is needed** (e.g., `generator: ADR`, `generator: runbook`, `generator: route-handler`). Adding generators is a 30-line config.ts edit + a template directory; revisit if the count exceeds ~10 generators (at which point the config file gets unwieldy and a generator-of-generators is the next step).
- **Workspace-level auto-wiring is requested.** The current generators emit per-package files only. If the dep-cruiser allowlist or Knip workspaces list becomes a frequent friction point, extend the `package` generator with append-style actions on the workspace-level files.
- **A Turborepo major release changes the `@turbo/gen` API.** Plop is bundled via Turborepo's wrapper; an upstream API break would surface here.
- **A contributor proposes a `Service`-suffix port name + the Plop validator rejects it.** Capture the rationale exchange — confirms the validator is doing its job + provides a teaching moment.
