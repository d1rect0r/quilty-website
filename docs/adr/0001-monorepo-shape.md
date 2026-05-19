# ADR-0001: Turborepo + pnpm monorepo with `apps/web` + `packages/shared-types` at M1; no `packages/ui` until extraction trigger

- **Status:** Accepted
- **Date:** 2026-05-17 (locked via Round-5 audit + D69 override)
- **Deciders:** Volodymyr Petrychenko + Round-5 monorepo-tooling research agent
- **Related decisions:** D4 (monorepo shape), D49 (deferred restructuring), D69 (drop empty `packages/ui` at M1)
- **Related ADRs:** none yet
- **Related research:** `docs/research/round_5_independent_review/02-monorepo-tooling.md`

## Context

The website is the first product surface for Quilty's web tier; the mobile app
lives in a sibling repo (`quilty`) and the Rust backend lives in `quilty-aws`.
At Phase 0 (pre-revenue, 1 engineer), there is no second consumer for a
shared-UI workspace. There IS a near-term consumer for a shared-types workspace
— the OpenAPI codegen from the Rust backend (`@quilty/api-types`) will be
imported at M5.

Forces:

- **The "scaffold empty workspace per JIC" pattern is a smell.** Empty
  workspaces bloat `pnpm install` graphs, send signals of "intended work that
  may never materialize," and frequently fall out of sync with the real
  layout when the actual extraction trigger fires. Cal.com (the canonical
  Next.js 16 monorepo gold-reference) does not scaffold empty workspaces.
- **D49 (locked Round 4) defaulted to "scaffold empty packages/ui + shared-types".**
  The Round-5 monorepo agent re-evaluated and found this was wrong for
  `packages/ui` specifically: no concrete near-term consumer, no extraction
  trigger before D49's "second product surface in monorepo" signal fires.
- **Turborepo vs Nx in 2026 for a 1→10-eng team:** Turborepo is the consensus
  pick. Nx's affected-graph precision is overkill at this scale and migration
  cost (~2.5 hours per Nx case study) is reversible.
- **Bazel and Pants are correctly excluded** at this scale (build-graph
  precision wins below 100 eng; their setup tax is too high).
- The Cognito + Rust auth backend already publishes a Rust-emitted OpenAPI
  spec (via `utoipa`) — but only for `auth-public` (11 endpoints) as of
  2026-05-17. `auth-user` + `auth-admin` will follow pre-M5. The website's
  `@quilty/shared-types` consumes the published OpenAPI as TS types via
  `openapi-typescript`.

What happens if we don't decide: scaffold both workspaces empty, accept the
`pnpm install` graph bloat + phantom-work signal + future sync drift, and
spend a half-day at the eventual extraction time relocating files anyway. The
"saved time" of pre-scaffolding is illusory.

## Decision

**At M1 we scaffold a Turborepo + pnpm monorepo with exactly two workspaces:**

- `apps/web/` — the Next.js 16 App Router product surface (workspace name
  `"web"`; required by the project's `typecheck-affected.sh` hook).
- `packages/shared-types/` — empty target directory at M1 (workspace name
  `"@quilty/shared-types"`). The workspace **consumes** `@quilty/api-types`
  via npm dependency (published from `quilty-aws` to GitHub Packages — see
  [ADR-0003](0003-openapi-codegen-direction.md)) and re-exports it for
  consistent in-app imports. The website never publishes anything itself.
  Populated post-M5 when the upstream package first publishes.

**We do NOT scaffold `packages/ui/` at M1.** It will be created at the first
real extraction trigger: a second product surface joining the monorepo, OR a
shared primitive that needs to cross the apps/packages boundary (the strategy
doc's D69 explicitly locks both triggers). At that point we reserve workspace
name `"@quilty/ui"`.

Tooling:

- **Turborepo** for cache + pipeline orchestration (`turbo.json`).
- **pnpm 10** (current major as of 2026-05) pinned via `packageManager` field
  in root `package.json` (exact pin) + `.nvmrc` (Node 24 LTS).
- **TypeScript strict** via root `tsconfig.base.json` extended by each
  workspace.

## Consequences

### Positive

- `pnpm install` graph is clean — only consumers that need a workspace exist.
- No phantom-work signal for new contributors ("why is there an empty
  `packages/ui` — should I be putting something there?").
- When `packages/ui` is finally created, it happens at the moment of an
  actual extraction need — sizing + naming + dependencies are informed by
  reality, not speculation.
- `packages/shared-types` has a concrete near-term consumer (OpenAPI codegen
  at M5), so its empty-at-M1 state is defensible.

### Negative

- Project's CLAUDE.md previously locked workspace name `"@quilty/ui"` as a
  hook-dependent invariant; we've updated `guard-write.sh` and
  `typecheck-affected.sh` references (the hooks themselves require manual
  human edit — listed in `docs/runbook/m1_post_scaffold_checklist.md`).
- When `packages/ui` does land, we re-introduce the workspace-creation
  ceremony then (writing `package.json` + `tsconfig.json` + linking into
  Turborepo cache). Cost: ~1 hour at trigger time.

### Neutral

- Future second product surface (e.g., the marketing site splitting from the
  portal, per D3's optional split trigger) lands cleanly as `apps/portal/`
  alongside `apps/web/` regardless of `packages/ui` state.

## Alternatives considered

### Alternative A: Scaffold both `packages/ui` + `packages/shared-types` empty per D49 default

- **What it is:** Ship both workspaces empty at M1, with placeholder
  `package.json` files declaring the workspace names. Land actual content at
  D49's stated trigger ("Second product surface in monorepo" for `packages/ui`;
  "OpenAPI codegen lands" for `shared-types`).
- **Why rejected:** Empty `packages/ui` is a phantom-work signal that doesn't
  pull its weight. No concrete near-term consumer means the workspace will
  rot (out-of-sync `package.json` field conventions, unused-by-default lint
  rules, etc.) by the time the trigger actually fires.

### Alternative B: Nx workspace + plugins

- **What it is:** Use Nx for build-graph precision + executor abstraction
  (Cal.com, Nrwl reference implementations).
- **Why rejected:** Overbuilt for 1-10 eng team. Turborepo gives 80% of the
  build-graph benefit at 20% of the setup tax. Migration to Nx is well-
  documented if the team grows past ~10 eng with parallel-CI needs.

### Alternative C: Single-app no-monorepo (`apps/web/` as the only repo content)

- **What it is:** Ship just the Next.js app at the repo root, no
  `apps/` or `packages/` layout.
- **Why rejected:** Premature simplification. We have a known near-term
  consumer for `packages/shared-types` (OpenAPI codegen at M5). Adding a
  workspace later requires moving every import path through the codebase —
  cheap to defer one workspace, expensive to defer the monorepo seam itself.

### Alternative D: Bun workspaces (or yarn 4 / npm workspaces)

- **What it is:** Replace pnpm with Bun (faster install, modern runtime) or
  yarn 4 (Cal.com's actual pick) or npm workspaces (zero-config).
- **Why rejected:** pnpm 10 has the best disk-efficient install (hardlinks),
  strict peer-deps by default, and is the dominant choice across our research
  reference set (PostHog, T3, Vercel marketing repos). Bun runtime is younger;
  yarn 4 + plug'n'play imposes resolution semantics that conflict with some
  Next.js plugins. npm workspaces lack the speed + strict-resolution we want.

## Compliance / Verification

- `pnpm-workspace.yaml` declares only `apps/*` and `packages/*` — both
  globbed, but at M1 only `apps/web` and `packages/shared-types` exist.
- Root `package.json` `engines` block pins Node `>=24 <25` and pnpm
  `>=10 <11`; CI enforces via `pnpm install --frozen-lockfile`.
- `typecheck-affected.sh` hook hard-codes the workspace-name → filter map.
  Adding `packages/ui` later requires updating this hook (user manual
  action — Claude cannot edit `.claude/hooks/`).
- ESLint rule prevents accidental cross-workspace imports without explicit
  `package.json` dependency (via `eslint-plugin-import` with
  `import/no-extraneous-dependencies`).

## References

- Turborepo docs: https://turborepo.com/docs
- pnpm 10 release notes: https://pnpm.io/blog/2025/01/15/v10
- Node.js LTS schedule (Node 22 → Maintenance LTS 2026-05-13; Node 24 → Active LTS): https://nodejs.org/en/about/previous-releases
- Cal.com monorepo (App Router gold reference): https://github.com/calcom/cal.com
- PostHog open-source monorepo: https://github.com/PostHog/posthog
- Vercel Turborepo example monorepos: https://github.com/vercel/turborepo/tree/main/examples
- T3 stack (canonical Next.js + tRPC + Prisma starter, Turborepo example): https://github.com/t3-oss/create-t3-app

## Revisit triggers

- **Engineer #2 joins + parallel work on different surfaces** — re-evaluate
  Nx for affected-graph speed.
- **Second product surface (mobile-web hybrid, marketing-separate, B2B
  portal)** — create `packages/ui` and extract shared primitives.
- **First component shared between mobile (Flutter) + web (React)** — this
  doesn't extend `packages/ui` (different runtime) but DOES trigger Style
  Dictionary + `@quilty/tokens` workspace.
- **Bundle size of `apps/web/components/` blows past ~100 components** —
  re-evaluate Storybook + extraction of a real component library.
- **OpenAPI codegen pipeline lands (M5)** — populate `packages/shared-types`;
  re-evaluate whether `@quilty/api-types` should be in-repo or remain
  externally published.
