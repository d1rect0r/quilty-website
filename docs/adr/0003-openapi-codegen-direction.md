# ADR-0003: OpenAPI codegen — Rust `utoipa` emit → `openapi-typescript` → `@quilty/api-types` published via GitHub Packages (no git submodules)

- **Status:** Accepted (direction); execution at M5
- **Date:** 2026-05-17
- **Deciders:** Volodymyr Petrychenko + Round-5 cross-repo coordination agent
- **Related decisions:** D4 (`packages/shared-types`), D5 (BFF talks to Rust over HTTPS), D46 (separate repos), D48 (backend permanently Rust; OpenAPI as cross-language contract)
- **Related ADRs:** [ADR-0001 Monorepo shape](0001-monorepo-shape.md)
- **Related research:** `docs/research/round_5_independent_review/09-cross-repo-coordination.md`

## Context

The Rust auth backend (`quilty-aws/lambdas/rust/`) exposes ~30 endpoints
across `auth-public`, `auth-user`, `auth-admin` crates. The website is the
only TypeScript consumer; the mobile app (Flutter) is the Dart consumer.
Cross-language contract sharing requires a single source of truth.

Forces:

- **Git submodules are universally regretted** for cross-repo type sharing
  per the Round-3/Round-4 strategy research. CLAUDE.md explicitly forbids
  them.
- **utoipa** (Rust derive-macro-based OpenAPI emitter) is the canonical 2026
  pick for Rust services that publish OpenAPI; the Rust backend's auth-public
  crate already wires it. `auth-user` + `auth-admin` are pending (pre-M5 work
  in `quilty-aws`).
- **openapi-typescript** (TS type-only generator) and **@hey-api/openapi-ts**
  (full SDK + Zod + TanStack Query) are the two leading 2026 options. We
  prefer types-only for the BFF layer: the BFF is a thin proxy + UI shell, so
  we want the contract surface (request/response types) without the runtime
  SDK bloat.
- **Where to publish:** options are (a) commit generated TS into
  `packages/shared-types/` directly, (b) publish to a private GitHub Packages
  npm registry, (c) publish to a public npm registry. GitHub Packages is the
  right choice for HIPAA-aligned private contracts (private by default,
  integrates with Renovate auto-update, no public exposure).
- **Update cadence:** Rust backend ships behind a `CI-OpenAPI` workflow that
  runs `oasdiff` to gate breaking changes. Website-side: Renovate auto-bumps
  the `@quilty/api-types` dependency; `tsc --noEmit` fails CI if the new
  shape breaks consumers.

What happens if we don't decide: scaffold an empty `packages/shared-types/`
and write the types by hand in the BFF (drifts from backend within weeks),
OR git-submodule the Rust repo's `openapi.yaml` (the universally-regretted
path), OR copy-paste types from the Swagger UI page (worst possible).

## Decision

We will publish Rust-emitted OpenAPI as a private TypeScript package and
consume it via dependency, not via submodule:

1. **Source:** Rust backend's `quilty-openapi-emitter` crate (in
   `quilty-aws/lambdas/rust/crates/`) runs at CI time and writes
   `docs/auth/openapi.yaml` to the `quilty-aws` repo. M5 work: extend
   coverage to `auth-user` + `auth-admin` (currently only `auth-public`).
2. **Codegen:** A new GitHub Actions workflow `publish-shared-types.yml` in
   the `quilty-aws` repo runs `openapi-typescript` on `openapi.yaml` and
   publishes `@quilty/api-types@x.y.z` to **GitHub Packages** (private
   registry) on every push to `main` that touches the spec.
3. **Versioning:** semver. Patch = no shape change (e.g., comment-only).
   Minor = backwards-compat add. Major = breaking — gated by `oasdiff` in
   the Rust repo's CI.
4. **Website consumption:** `packages/shared-types/` is the workspace; its
   `package.json` re-exports `@quilty/api-types` so that the website code
   imports `@quilty/shared-types` consistently regardless of whether the
   underlying spec is bumped to a new major. (Workspace re-export pattern
   keeps the indirection layer in our repo.)
5. **Renovate** auto-bumps `@quilty/api-types` with same `minimumReleaseAge:
4320` (72h) as all other deps; CI catches breaks via `tsc --noEmit`.
6. **No git submodules. Ever.** Reaffirms CLAUDE.md NEVER list.

## Consequences

### Positive

- **Single source of truth** in Rust. Backend changes propagate to the web
  via standard dependency mechanics, not "remember to update the types."
- **Type-checked contract** at compile time on the web side.
- **No runtime SDK bloat** — types-only emit, no clients/hooks/Zod runtime
  in the bundle.
- **Versioned** — locked snapshot per deploy means a website deploy and a
  backend deploy can be reasoned about independently.
- **Renovate-driven update flow** matches every other dependency: a PR
  appears when there's a new contract version, reviewer sees the diff, CI
  validates.
- **Migration to alternative emit tooling is contained** at one workflow
  file in `quilty-aws`; the website doesn't care.

### Negative

- **Slight indirection:** website imports `@quilty/shared-types` which
  re-exports `@quilty/api-types`. Two-level lookup vs direct import.
- **Operational overhead:** one more workflow file, one more package, GitHub
  Packages auth tokens to manage in CI (handled by the same `GITHUB_TOKEN`
  scoping that's already in place).
- **Cross-repo failure mode:** if `quilty-aws`'s `publish-shared-types.yml`
  workflow breaks (e.g., openapi-typescript fails on a malformed spec, or
  GitHub Packages auth expires), Renovate will never see a new
  `@quilty/api-types` version on the website side — backend changes ship
  while the website silently runs on stale types. Mitigation: CloudWatch
  alarm on `quilty-aws` workflow failure + manual TS-type regen capability
  documented in the runbook.
- **First-time setup** requires extending the Rust emitter to cover
  `auth-user` + `auth-admin` (M5 prerequisite — captured in roadmap).

### Neutral

- The OpenAPI spec lives in `quilty-aws/docs/auth/openapi.yaml`. If we ever
  want a public-facing API portal (M9+), the same source feeds it.
- Dart codegen for the mobile app uses a parallel pipeline; spec is shared.

## Alternatives considered

### Alternative A: Git submodule of `quilty-aws/docs/auth/`

- **What it is:** Submodule the relevant subdirectory of `quilty-aws` into
  the website repo; codegen runs locally.
- **Why rejected:** Submodules are universally regretted in Quilty's
  experience and across the industry. Three-way merges, detached HEAD
  states, contributors not realizing the submodule needs updating. CLAUDE.md
  forbids.

### Alternative B: Vendor the generated TS files directly into `packages/shared-types/`

- **What it is:** Don't publish a separate npm package. Instead, the
  `quilty-aws` CI commits generated TS files into the website repo via a
  cross-repo PR bot.
- **Why rejected:** Cross-repo write access is permission-overgrant. The
  generated files churn on every spec change — dirty diff history. Versioned
  package is cleaner.

### Alternative C: @hey-api/openapi-ts (full SDK + Zod + TanStack Query)

- **What it is:** Generate not just types but a runtime SDK with React Query
  hooks + Zod parsers.
- **Why rejected:** Runtime SDK bloat. The BFF is a thin proxy — it doesn't
  benefit from a typed client because it forwards requests to API Gateway
  with our own auth headers. Hooks for React Query in the browser would be
  useful if the browser ever called the API directly, but that violates D5
  (BFF pattern, tokens never in browser). Zod parsers we'll add at the BFF
  boundary by hand for the small set of types we actually validate.

### Alternative D: Publish to public npm registry as a public package

- **What it is:** Same shape as decided, but the registry is npmjs.com public.
- **Why rejected:** Quilty's API surface is private; publishing OpenAPI types
  publicly leaks endpoint shapes + parameter names. GitHub Packages private
  scope is the safe + correct choice.

### Alternative E: Skip codegen; hand-write types in BFF

- **What it is:** Read the OpenAPI spec, write `interface User { ... }`
  manually in `apps/web/lib/api/types.ts`.
- **Why rejected:** Drifts from backend within a sprint. Defeats the entire
  point of having an OpenAPI spec.

## Compliance / Verification

- `quilty-aws/.github/workflows/ci-openapi.yml` (already exists) runs
  `oasdiff` against the previous spec on every PR — blocks breaking changes
  unless reviewer explicitly approves.
- `publish-shared-types.yml` (M5 work) runs `openapi-typescript` + publishes
  to GitHub Packages with `npm publish --access restricted`.
- Website CI fails if `pnpm install` cannot resolve `@quilty/api-types`
  (token scoping verified).
- Website CI runs `pnpm typecheck` on every PR — catches breaking changes
  by failing `tsc --noEmit`.
- `packages/shared-types/src/generated/` is gitignored (per existing
  `.gitignore`) — the re-export is the only checked-in file in that
  workspace.

## References

- utoipa (Rust OpenAPI emit): https://github.com/juhaku/utoipa
- openapi-typescript (TS type-only generator): https://openapi-ts.dev/
- @hey-api/openapi-ts (alternative full SDK generator): https://github.com/hey-api/openapi-ts
- GitHub Packages npm-private registry docs: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry
- oasdiff (OpenAPI breaking-change detection): https://github.com/oasdiff/oasdiff

## Revisit triggers

- **Mobile and web grow divergent contract needs** (e.g., mobile needs
  fields web doesn't, or vice versa) — re-evaluate per-consumer spec slices.
- **API call latency overhead from BFF proxy is unacceptable** (probably
  not a 2026 issue) — re-evaluate direct browser-to-API-Gateway calls,
  which would push us toward @hey-api's runtime SDK.
- **Public API offering** (third-party developer access) — extract a public
  subset of the spec to a separate file; publish public types to npmjs.com
  alongside the private `@quilty/api-types`.
- **Rust backend retires utoipa** in favor of another emit tool — swap the
  emitter in `quilty-aws`; website unchanged.
