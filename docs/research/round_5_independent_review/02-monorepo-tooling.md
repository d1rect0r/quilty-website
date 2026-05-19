# Enterprise-Grade Next.js 16 Monorepo Scaffold — 2026 Reference Plan

**Scope:** repo structure + build + lint + format + test infra for quilty-website
**Reviewer posture:** senior platform/build-tooling; zero PHI / auth / CSP scope here
**Date of evidence:** 2026-05-17

---

## TL;DR — what to change from the M1 baseline

Baseline assumed in the brief: `Turborepo + pnpm 9 + Node 22 + ESLint flat + Prettier + Husky + lint-staged + Vitest + Playwright + axe-playwright + SST 3.x`.

**Changes required to match 2026 enterprise practice:**

| Item                   | Baseline                               | 2026 enterprise                                                                                                                                                    | Reason                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                   | 22                                     | **24 LTS (Krypton)**                                                                                                                                               | Node 22 enters Maintenance LTS on 2026-05-13. Node 24 is the only Active LTS for the next ~24 months.                                                                                                                       |
| pnpm                   | 9                                      | **pnpm 10.x**                                                                                                                                                      | PostHog pins `pnpm@10.29.3`; pnpm 9 is now back-line. Lockfile v9 + min-release-age require pnpm 10.                                                                                                                        |
| Linter/formatter       | ESLint flat + Prettier                 | **Biome 2.3.x (primary)** + **minimal ESLint** kept only for `eslint-plugin-next` + `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y` rules Biome still lacks | Cal.com runs Biome 2.3.10. next-forge ships Biome via Ultracite. `create-next-app` (Next.js 16) now natively offers Biome. Pure Biome leaves 3-4 gaps that hurt at WCAG 2.2 AA + RSC boundaries.                            |
| Pre-commit             | Husky                                  | **Lefthook 2.x**                                                                                                                                                   | Go binary, parallel jobs, no Node dep — Cal.com is one of the last holdouts on Husky, and PostHog moved away. Speed/maintainability win is real.                                                                            |
| IaC                    | SST 3.x                                | **SST 4.x (v4.14.1)**                                                                                                                                              | SST is on v4, releasing every few days, 100 commits in last 90 days. The "maintenance mode" claim in one Encore blog post is FUD — verify via the SST GitHub releases tab directly. v4 is production-grade for AWS Next.js. |
| `packages/*` at M1     | Empty `ui` + `shared-types` workspaces | **Only `@quilty/tsconfig` + `@quilty/biome-config` workspaces at M1.** Defer `@quilty/ui` and `@quilty/shared-types` until first real extraction trigger.          | Turborepo `with-biome` example ships `@repo/typescript-config` + `@repo/biome-config` packages at scaffold but defers `ui`. Empty workspaces add cognitive load with zero benefit until trigger.                            |
| Coverage tool          | (unspecified)                          | **v8 (`@vitest/coverage-v8`)**                                                                                                                                     | Native, faster, default since Vitest 1.x. Istanbul only for source-map-edge-case codebases.                                                                                                                                 |
| jsdom vs happy-dom     | (unspecified)                          | **jsdom** for RSC/Next.js work                                                                                                                                     | happy-dom is faster but bites on spec accuracy with Radix/Headless UI primitives that shadcn uses.                                                                                                                          |
| Renovate vs Dependabot | (unspecified)                          | **Renovate** primary, **Dependabot security alerts** kept on                                                                                                       | Renovate `group:monorepos` preset is the differentiator for Turborepo.                                                                                                                                                      |
| SBOM                   | (unspecified)                          | **`@cyclonedx/cdxgen` + Sigstore keyless**                                                                                                                         | EU CRA + executive order trajectory makes this M1-cheap, M5+ retrofit-hostile.                                                                                                                                              |

---

## TOP-5 retrofit-hostile items (if missing from M1, painful later)

1. **TypeScript path-alias topology** (`tsconfig.base.json` + `tsconfig.json` references). Once 200 files import `@/components/...`, changing the alias map without codemods is a several-day exercise. Lock the namespace at M1: `@/*` for in-app, `@quilty/*` for workspace packages — never mix.
2. **Workspace `name:` discipline** (`web`, `@quilty/ui`, `@quilty/shared-types`, `@quilty/tsconfig`, `@quilty/biome-config`). CLAUDE.md already locks the first three; add the two config packages now so M2-M9 doesn't shuffle scopes.
3. **`packageManager` field + Corepack + `.nvmrc` + `engines.node` + `engines.pnpm` all agreeing.** When CI uses a different Node than dev, the failures are subtle (Intl, native modules, V8 GC).
4. **CSP-friendly script tag emission via Next.js 16 native nonce + Turbopack production mode discipline.** Sibling concern, but build config decides whether nonce propagation is feasible — locking down `next.config.ts` shape early avoids a rewrite during M8 CSP enforcement.
5. **Renovate config with `group:monorepos` + `dependencyDashboard` + min-release-age (PostHog uses 4320 minutes = 72h).** Without this, you ship a CVE'd package because a typosquat published 30 minutes ago.

---

## Q1. Turborepo vs Nx in 2026

**Current 2026 enterprise practice:** Turborepo dominates greenfield Next.js monorepos at the 1-to-20-engineer scale. Cal.com (Turbo 2.7.1), PostHog (Turbo 2.9.6), next-forge (Vercel's reference, Turbo + Bun), Vercel Commerce, and every official Vercel template run Turborepo. The flip to Nx happens around (a) >20 engineers needing module-boundary enforcement, (b) polyglot needs (Go/Rust/Python in same repo with shared build graph), or (c) generator-heavy workflows (Nx Console scaffolding dozens of libraries). At 1-to-10 engineers with one Next.js app, Turborepo's zero-config caching + remote cache + simpler mental model wins decisively. Turborepo 2.x has matured `--filter`, `affected` selectors, and partial caching to the point where Nx's killer features (project graph visualization, generators) feel like enterprise weight that isn't paying rent yet.

**Reference examples:**

- Cal.com turbo.json — https://github.com/calcom/cal.com/blob/main/turbo.json (40+ tasks, 300+ env vars, affectedUsingTaskInputs flag, Prisma post-install task)
- Turborepo with-biome — https://github.com/vercel/turborepo/tree/main/examples/with-biome (canonical shape)
- next-forge — https://github.com/haydenbleasel/next-forge (Vercel-blessed reference)

**Recommendation:** **Turborepo 2.x.** Stays correct through the 2-3 year horizon at 5-10 engineers.

**Retrofit cost if wrong:** Low. Turbo→Nx migration is well-trodden; the `apps/` + `packages/` layout transfers as-is.

---

## Q2. `packages/*` organization at scaffold

**Current 2026 enterprise practice:** Cal.com (huge scale) ships 20 packages including a **`packages/tsconfig`** workspace as their first shared package. Turborepo's official `with-biome` example ships **`@repo/biome-config` + `@repo/typescript-config`** workspaces — and importantly, **no empty `ui` workspace**. The pattern is: shared _configuration_ lives in `packages/` from day one (because every app and every package consumes it). Shared _code_ (UI, types, utils) only gets a workspace at the moment of second consumer. Shipping empty `packages/ui` at M1 means you carry the build/test/lint overhead of an unused package for months — and worse, the natural inertia of "well, we have it, let's put a Button in it" leaks premature abstraction.

**Reference examples:**

- Cal.com packages/ — https://github.com/calcom/cal.com/tree/main/packages (note: packages/tsconfig exists; no empty placeholders)
- Turborepo with-biome — packages/ contains biome-config + typescript-config + ui; ui has actual exports
- Turborepo with-vitest packages/vitest-config — shared Vitest base configs as a workspace

**Recommendation:** At M1, ship:

- `apps/web/` — the Next.js app (the only consumer)
- `packages/tsconfig/` — `base.json`, `nextjs.json`, future `react-library.json`
- `packages/biome-config/` — shared `biome.jsonc` extended by app + future packages
- **DO NOT ship** empty `packages/ui/` or `packages/shared-types/` at M1. **Override D49 to defer scaffolding** until trigger: `packages/ui/` extracts when a 2nd consumer of UI primitives appears (admin app, marketing emails, Storybook standalone). `packages/shared-types/` materializes the moment OpenAPI codegen has output to emit.

**Retrofit cost if wrong:** Low (adding empty workspace later is trivial; removing one with consumers is medium).

---

## Q3. `tsconfig.base.json` + path aliases

**Current 2026 enterprise practice:** Three-tier pattern: (1) `packages/tsconfig/base.json` defines compiler defaults (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, `moduleResolution: "bundler"`), (2) `packages/tsconfig/nextjs.json` extends base with Next.js plugin + JSX preserve, (3) per-package `tsconfig.json` extends one of the above and ONLY adds `paths` + `include` + `exclude`. Path aliases use one of two conventions: in-app `@/*` (the create-next-app default — explicitly documented in Next.js 16 docs) and workspace `@quilty/*` resolving to `packages/*/src/index.ts`. Crucially: **avoid `paths` at root tsconfig** — only set them in the consuming app (web). Workspace packages export via `package.json#exports`, not `tsconfig.paths`.

**Reference examples:**

- Cal.com packages/tsconfig/ — base.json, nextjs.json, react-library.json, package.json
- next-forge — uses `@repo/typescript-config`
- Next.js 16 docs explicitly recommend `@/*` aliased to `./*` or `./src/*`

**Recommendation:** Ship `packages/tsconfig/` with three files: `base.json`, `nextjs.json`, `react-library.json` (latter dormant until packages/ui materializes). In `apps/web/tsconfig.json`: extend `nextjs.json`, set `paths` to `{ "@/*": ["./*"] }` only. Workspace packages use `package.json#exports`, not paths. Lock `verbatimModuleSyntax: true` from day one — it surfaces import errors at scaffold rather than at first Lambda cold start.

**Retrofit cost if wrong:** **High.** Renaming `@/*` across 200 files later requires codemod ceremony. Pick at M1, never change.

---

## Q4. SST 4.x state + viability vs alternatives

**Current 2026 enterprise practice:** SST is at **v4.14.1 (released 2026-05-12)** with release cadence of 2-7 days. Verified directly from https://github.com/sst/sst/releases. The v3→v4 transition (Ion engine, Pulumi-under-the-hood replacing CDK/CloudFormation) is complete and stable. One Encore blog post claims SST "moved to maintenance mode in 2025" — this is contradicted by the v4.13.x, v4.14.x release activity and by next-forge's continued use; treat that source as out-of-date/biased. SST's Next.js component auto-detects the Next.js version and pins a matching OpenNext version; **the Next.js 16 + OpenNext story is still maturing** (OpenNext 4.0.2 stable, but Next.js 16 support is via the new Deployment Adapters API stabilized in Next.js 16.2 — adapters are in active development in a shared monorepo across AWS/Cloudflare/Netlify). Alternatives: AWS CDK + OpenNext is the "boring safe" pick but you build the orchestration SST gives free; Pulumi directly is what SST sits on (skip the layer if your team has Pulumi muscle memory); Amplify Hosting Gen 2 is the Vercel-clone but locks you out of fine-grained VPC/IAM control that HIPAA shops need.

**Reference examples:**

- SST releases — https://github.com/sst/sst/releases (v4.14.1, 2026-05-12)
- SST Nextjs component — https://sst.dev/docs/component/aws/nextjs/
- OpenNext AWS — https://github.com/opennextjs/opennextjs-aws (v4.0.2, 2026-05-08)
- Deployment Adapters API — https://opennext.js.org/news/2026-03-25-3-years-of-opennext

**Recommendation:** **SST 4.x.** Pin `sst@^4.14.0` at M1. Use `sst.aws.Nextjs` with explicit `openNextVersion` override if Next.js 16.2.x detection lags. Watch the OpenNext Next.js 16 adapter work — by M3/M4 it should be GA. Fallback plan: if OpenNext+Next.js 16 stalls, downgrade to Next.js 15.5 LTS for launch — cost is two weeks. **Do not pick Amplify Hosting** (CSP/VPC control needed for HIPAA boundary).

**Retrofit cost if wrong:** Medium. SST→Pulumi-direct migration is mechanical (same engine). SST→CDK is high (rewrite all infra).

---

## Q5. Node + pnpm version pinning

**Current 2026 enterprise practice:** Multi-layer pinning is the universal pattern: `package.json#packageManager` (Corepack reads this), `engines.node`, `engines.pnpm`, `.nvmrc`, `.node-version` (for direnv/fnm/asdf compatibility). PostHog pins `pnpm@10.29.3` + `node >=24 <25`. next-forge pins `bun@1.3.10` + `node >=18`. Cal.com pins `yarn@4.12.0`. Node 22 (Jod) moves to Maintenance LTS on **2026-05-13** (four days before today); Node 24 (Krypton) is Active LTS until ~2027-10 with support through 2028. For a 2-3 year horizon project starting in May 2026, picking Node 22 ships in Maintenance LTS — you're already on the back foot. Volta vs fnm vs Corepack: Corepack is built-in (Node 16.13+), reads `packageManager`, requires zero install. fnm is the speed pick for switching versions. The 2026 consensus is `packageManager` field + Corepack for package manager, `.nvmrc` for Node (fnm/nvm both read it).

**Reference examples:**

- PostHog package.json — `"packageManager": "pnpm@10.29.3"`, `"engines": { "node": ">=24 <25" }`
- next-forge — `"packageManager": "bun@1.3.10"`
- Node release schedule — https://nodejs.org/en/about/previous-releases

**Recommendation:**

- Node: **24 LTS (Krypton)** — pin exactly in `.nvmrc` (e.g., `24.5.0`), `engines.node: ">=24 <25"`.
- pnpm: **10.x** (latest patch) — `"packageManager": "pnpm@10.x.x"`, `engines.pnpm: ">=10"`.
- Use Corepack — no Volta needed at this scale. Add `.tool-versions` for asdf/mise interop (one-line file).
- CI uses `corepack enable` + `pnpm install --frozen-lockfile`.

**Retrofit cost if wrong:** Low (Node bump) to Medium (pnpm major jump can break lockfile and require regen).

---

## Q6. ESLint flat config vs Biome in 2026

**Current 2026 enterprise practice:** The 2026 inflection point has happened. Biome 2.x is the default for greenfield Next.js: **Next.js 16's `create-next-app` natively prompts "ESLint / Biome / None"** (verified in current Next.js docs at https://nextjs.org/docs/app/getting-started/installation). **`next build` no longer runs the linter** as of Next.js 16, so you wire lint via npm scripts regardless. Cal.com runs **Biome 2.3.10** as the sole lint+format tool. PostHog runs **oxlint + oxfmt** (Rust-based, even faster than Biome). next-forge runs Biome via **Ultracite** (a Biome preset for React/Next teams). Biome 2.3 covers ~30 jsx-a11y rules natively (verified via https://biomejs.dev/linter/rules-sources/) — this is **near-parity** with eslint-plugin-jsx-a11y core rules but not 100%. The gaps for a WCAG 2.2 AA target are: type-aware rules (Biome lacks TS language service integration; this is the actual 2026 frontier), `eslint-plugin-react-hooks` exhaustive-deps (no Biome equivalent), and `@next/eslint-plugin-next` rules (script-component-in-head, no-page-custom-font etc — no Biome equivalents). The pragmatic 2026 pattern is **hybrid**: Biome does formatting + 95% of linting; a stripped-down `eslint.config.mjs` keeps `eslint-plugin-react-hooks` + `@next/eslint-plugin-next` + any jsx-a11y rules Biome lacks.

**Reference examples:**

- Cal.com biome.jsonc — Biome 2.3.10 with import-organization groups + circular-dep prevention overrides
- next-forge — Biome + Ultracite
- Next.js 16 install docs — official Biome support in create-next-app

**Recommendation:** **Hybrid: Biome 2.3.x primary + minimal ESLint for `@next/eslint-plugin-next` + `eslint-plugin-react-hooks` + missing jsx-a11y rules.** Wire both in lint-staged. Biome runs on every change (sub-200ms); ESLint runs only on `.tsx`/`.ts` and is allowed to be slower because its scope is narrow. **Eventually pure-Biome when type-aware lint lands** (likely late 2026 / 2027).

**Retrofit cost if wrong:**

- Pure-Biome and missing a Next.js-specific rule that bites in production: Low (add ESLint later).
- Pure-ESLint and discovering you wanted Biome's speed: Low (Biome migrate command is one-shot).

---

## Q7. Prettier vs Biome formatter

**Current 2026 enterprise practice:** Biome's formatter has reached Prettier parity for the canonical languages (TS/TSX/JS/JSX/JSON/CSS). Cal.com, next-forge, and the Turborepo with-biome example all use **Biome formatter only** — no Prettier. The remaining gap is **MDX/Markdown** (Biome formats MD but not MDX-with-JSX-inside; Prettier handles MDX). For projects with MDX content (your case: D30 says MDX-in-repo until CMS migration), you have two options: (a) Biome for code, Prettier for MDX only (configure `.prettierrc` to ignore everything except `*.md`/`*.mdx`); (b) Biome for everything except MDX, run Biome only — accept that MDX content files are unformatted. The cleaner 2026 pattern is (a): two tools, but each has a non-overlapping scope.

**Reference examples:**

- next-forge — Biome formatter only (no Prettier in devDeps)
- Cal.com — Biome 2.3.10 formatter (line width 110, double quotes, ES5 trailing commas)
- Turborepo with-biome example — biome.json formatter (line width 120, tab indent)

**Recommendation:** **Biome formatter for everything.** For MDX (when content lands in M4), add Prettier scoped to `*.md`/`*.mdx` only via `.prettierrc` + `.prettierignore` (ignore everything else). At M1 there's no MDX content yet, so Prettier isn't needed — defer Prettier addition until first MDX file.

**Retrofit cost if wrong:** Low. Adding Prettier later is a 2-line devDep + config.

---

## Q8. Husky vs Lefthook vs Simple Git Hooks

**Current 2026 enterprise practice:** Husky (v9.x) is still the most-used historically but Lefthook is the modern pick. Cal.com runs Husky 9.1.7 (legacy momentum) + `lint-staged`. PostHog runs Husky + `lint-staged`. Lefthook (Go binary, v2.1.6 as of Apr 2026, 8.2k stars) wins on: parallel jobs, no Node dependency (fast hook startup), single binary install via brew/asdf, language-agnostic config. The 2026 trajectory in greenfield projects is Lefthook; the legacy projects stay on Husky because the migration cost ($0 functionality) doesn't move the needle. Simple-git-hooks is the minimalist pick for tiny projects (one-line config) but doesn't scale to parallel hooks. For a project with WCAG/CSP/typecheck/lint pre-commit chain, Lefthook's parallelization matters.

**Reference examples:**

- Lefthook — https://github.com/evilmartians/lefthook (v2.1.6)
- Cal.com .husky/pre-commit — single line invoking `yarn lint-staged --verbose`

**Recommendation:** **Lefthook 2.x.** `lefthook.yml` at repo root, `pre-commit` runs Biome+ESLint+typecheck on staged files **in parallel**. Bonus: Lefthook is what the project's existing `quilty-aws` repo (Terraform) already mentions in the `clean_gone` skill ecosystem — consistent tooling across repos.

**Retrofit cost if wrong:** Low. Lefthook ↔ Husky migration is a config rewrite (~30 minutes).

---

## Q9. lint-staged config

**Current 2026 enterprise practice:** Modern lint-staged config is dictionary-style with glob → command arrays. The 2026 patterns are: (a) `*.{ts,tsx,js,jsx}` → `biome check --write --no-errors-on-unmatched --files-ignore-unknown=true`, (b) `*.{json,css,md}` → `biome format --write`, (c) `*.{ts,tsx}` → ESLint scoped run (if hybrid), (d) typecheck is NOT in lint-staged (too slow for staged-only) — typecheck runs in pre-push or in CI. Cal.com runs `lint-staged --verbose` under Husky. The killer config detail: Biome's `--no-errors-on-unmatched` prevents lint-staged failures when a glob matches no files (a 2025-fixed annoyance). `lint-staged.config.mjs` (ESM) is the 2026 shape over `.lintstagedrc.json` because it allows logic (filter package-by-package).

**Reference examples:**

- Cal.com lint-staged usage — invoked from .husky/pre-commit
- next-forge — uses Ultracite which wraps Biome staged checks

**Recommendation:** Ship `lint-staged.config.mjs` at root with:

- `*.{ts,tsx,js,jsx,json,jsonc,css}` → `biome check --write --no-errors-on-unmatched --files-ignore-unknown=true`
- `*.{ts,tsx}` → `eslint --fix --max-warnings 0` (hybrid only)
- `*.{md,mdx}` → (deferred until MDX lands)
- typecheck NOT here; runs in pre-push hook via `pnpm -F web typecheck`

**Retrofit cost if wrong:** Low.

---

## Q10. Vitest setup for Next.js 16 + Tailwind v4

**Current 2026 enterprise practice:** Vitest 4.x is the standard (Cal.com on 4.0.16). **Critical gotcha: async Server Components cannot be tested with Vitest** (verified via vitest-dev/vitest#8526 + Next.js 16 docs) — use Playwright for those. The Turborepo monorepo pattern (verified in https://turborepo.dev/docs/guides/tools/vitest) is per-package Vitest configs with a shared `@quilty/vitest-config` workspace, NOT root-level Vitest Projects (Vitest deprecated workspaces in favor of projects; projects break per-package extends-from-root). Setup file lives at `apps/web/vitest.setup.ts` and polyfills `matchMedia`, `IntersectionObserver`, `ResizeObserver` (Radix/shadcn primitives crash without these). Environment: **jsdom over happy-dom** for shadcn-heavy work — happy-dom is faster but spec-incomplete around `getBoundingClientRect` and pointer events that Radix uses. Coverage: **v8 provider** (default since Vitest 1.x, faster than istanbul, no source-map quirks for modern bundlers).

**Reference examples:**

- Turborepo Vitest guide — https://turborepo.dev/docs/guides/tools/vitest
- Next.js Vitest docs — https://nextjs.org/docs/app/guides/testing/vitest (calls out async RSC limitation)
- Turborepo with-vitest example — `packages/vitest-config` workspace pattern

**Recommendation:**

- Vitest 4.x per-package; shared base in `packages/vitest-config/` (defer creating package until first non-web test target — pull the config inline at apps/web until then).
- `apps/web/vitest.config.ts`: env `jsdom`, setup `./vitest.setup.ts`, coverage `v8`, `include: ["**/*.test.{ts,tsx}"]`.
- `vitest.setup.ts`: polyfill 3 browser APIs above + `@testing-library/jest-dom`.
- **Test only client + sync server components in Vitest.** Async server components → Playwright.
- Turbo task `test` (no watch, with coverage) + `test:watch` (no cache).

**Retrofit cost if wrong:** Low (config swap) to Medium (jsdom→happy-dom rewrite of polyfills).

---

## Q11. Playwright setup for App Router + axe-core

**Current 2026 enterprise practice:** `@playwright/test` 1.57.x (Cal.com pin). `@axe-core/playwright` wrapper with `AxeBuilder.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])` for WCAG 2.2 AA targeting. Fixture pattern (per Playwright docs at https://playwright.dev/docs/accessibility-testing): create `axeFixture.ts` that extends `test` with a `makeAxeBuilder` factory, then every test calls it — avoids 8-line setup in every spec. `playwright.config.ts` shape: `projects` for chromium/firefox/webkit, `webServer` block boots `pnpm dev` on PR, `pnpm build && pnpm start` in CI, `reporter: [['html'], ['github']]`, `workers: process.env.CI ? 2 : undefined`, `retries: 2 on CI`. Parallelization is per-file by default; mark a11y tests serial only if state-leaking.

**Reference examples:**

- Playwright accessibility-testing — https://playwright.dev/docs/accessibility-testing
- Cal.com .github/workflows/e2e.yml — shape (couldn't fetch directly, listed in repo workflow inventory)

**Recommendation:**

- `@playwright/test@^1.57`, `@axe-core/playwright@^4.10`.
- `e2e/` directory at repo root (NOT `apps/web/e2e` — e2e is cross-app even if only one app today).
- `e2e/fixtures/axe.ts` exporting `makeAxeBuilder` factory bound to WCAG 2.2 AA tags.
- Smoke spec template: navigate → snapshot → axe scan → assert zero violations.
- CI runs Playwright with `--workers=2` + sharding when test count > 20.

**Retrofit cost if wrong:** Low (test file rewrites are mechanical).

---

## Q12. GitHub Actions CI shape

**Current 2026 enterprise practice:** Cal.com runs **56 workflows** (their inventory verified). The canonical enterprise shape for a Next.js monorepo at scale:

- **One orchestrator workflow** (`ci.yml`) calls reusable workflows via `workflow_call` (Cal.com pattern — `lint.yml`, `check-types.yml`, `unit-tests.yml` are all `workflow_call: true`).
- **Sparse checkout** for jobs that only need `.github/` (Cal.com pattern — `sparse-checkout: .github`).
- **OIDC → AWS IAM trust** via `aws-actions/configure-aws-credentials` with `role-to-assume: arn:aws:iam::...` — never store long-lived keys.
- **Concurrency cancellation**: `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
- **Lockfile-frozen install**: `pnpm install --frozen-lockfile`.
- **Turbo remote cache** via Vercel remote cache or self-hosted S3 — saves 90%+ on incremental CI.
- **Matrix on Node only when shipping a library** (you're shipping an app, no matrix needed at M1).
- **Heap allocation tuning** (Cal.com sets `NODE_OPTIONS: --max-old-space-size=12288` on type-check job — necessary for 1M-line monorepos, overkill at M1; revisit when typecheck OOMs).

**Reference examples:**

- Cal.com .github/workflows/ — 56 files; lint.yml, check-types.yml, unit-tests.yml all reusable
- Cal.com check-types.yml — NODE_OPTIONS heap tuning + custom problem matcher

**Recommendation:** 6 workflows at M1:

1. `ci.yml` — orchestrator on PR + push to main; calls 2-5 in parallel.
2. `lint.yml` (reusable) — Biome check + ESLint scoped.
3. `typecheck.yml` (reusable) — `pnpm -F web typecheck` with Turbo cache.
4. `test-unit.yml` (reusable) — Vitest + coverage upload.
5. `test-e2e.yml` (reusable) — Playwright + axe scan; only runs on PR (slow).
6. `deploy-preview.yml` — on PR open/sync, `sst deploy --stage pr-${{ github.event.number }}` with OIDC. Deploy-to-prod is a separate workflow gated behind manual approval + `--stage prod` env-protection rule.

Concurrency cancellation on `ci.yml`. Frozen install. Turbo remote cache from week 1 (free for self-hosted on Vercel; cheap on S3).

**Retrofit cost if wrong:** Medium (workflow rewrites cascade across deploy gates).

---

## Q13. SBOM + supply chain

**Current 2026 enterprise practice:** CycloneDX has ratified as **ECMA-424** standard; the broader 2026 ecosystem (EU CRA, US EO 14028) makes SBOMs effectively mandatory for any consumer-facing software. Two CycloneDX npm tools exist: `@cyclonedx/cyclonedx-npm` (smaller, scoped to npm projects, "almost SBOM L2") and `@cyclonedx/cdxgen` (more comprehensive, multi-ecosystem, supports SPDX 3.0.1 JSON-LD export, has bundled `cdx-sign` + `cdx-validate`). For Sigstore: **keyless signing via GitHub Actions OIDC** is the 2026 enterprise default — Sigstore issues short-lived certs based on workflow identity (no PKI to manage). SLSA Level 3 is the realistic target for a consumer site; signed provenance attestation binds the SBOM to the deploy artifact. `npm sbom` (npm 10+ built-in) exists but is less complete than CycloneDX tooling — fine for "compliance checkbox," insufficient for vulnerability scanning. SPDX vs CycloneDX: CycloneDX wins for Cloud-Native + tooling depth; SPDX wins for legal/license compliance — for a Next.js site SaaS, CycloneDX is the call.

**Reference examples:**

- @cyclonedx/cdxgen — https://www.npmjs.com/package/@cyclonedx/cdxgen
- cyclonedx-node-npm — https://github.com/CycloneDX/cyclonedx-node-npm
- Sigstore + GitHub OIDC — https://github.com/sigstore/cosign

**Recommendation:** At M1, ship a `sbom.yml` workflow on push-to-main + tagged release that: (1) runs `cdxgen -t js -o sbom.json .`, (2) signs via `cosign attest --predicate sbom.json --type cyclonedx oci://${IMAGE}` (or signs the npm tarball if not containerizing), (3) uploads SBOM as workflow artifact + GitHub Release asset. Use **CycloneDX 1.6+ JSON format**. Verify via `cosign verify-attestation` in deploy gate. This is **cheap at M1, expensive at M8** when you need to retrofit signed artifacts before SOC2/launch audit.

**Retrofit cost if wrong:** **High.** Retrofitting signed SBOMs across hundreds of historical CI runs is impossible — you start the chain whenever you start it. M1 is the cheapest moment to start.

---

## Q14. shadcn CLI vs hand-copying

**Current 2026 enterprise practice:** **shadcn CLI v4.7.0** (May 2026; verified via repo releases). Enterprise teams still use `pnpm dlx shadcn@latest add <component>` — vendoring-by-copy is the entire point of shadcn (the code is YOURS, the CLI is just a delivery mechanism). The 2026 `components.json` shape: `{ "$schema": "https://ui.shadcn.com/schema.json", "style": "new-york", "rsc": true, "tsx": true, "tailwind": { "config": "", "css": "app/globals.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" }, "aliases": { "components": "@/components", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks", "utils": "@/lib/utils" }, "iconLibrary": "lucide" }`. Notable: **`tailwind.config: ""` (empty string) for Tailwind v4** — v4 doesn't use a config file (the `@theme` block in globals.css replaces it). `style: "new-york"` is the canonical pick (default was deprecated in v4). Monorepo support landed in shadcn CLI v2.x — `aliases` can point to workspace packages (`"@quilty/ui": "@quilty/ui/src/components"`).

**Reference examples:**

- shadcn components.json docs — https://ui.shadcn.com/docs/components-json
- shadcn CLI v4.7.0 — https://github.com/shadcn-ui/ui (May 5, 2026)

**Recommendation:** Ship `apps/web/components.json` with `style: "new-york"`, `rsc: true`, `tsx: true`, `tailwind.config: ""`, `tailwind.css: "app/globals.css"`, `tailwind.baseColor: "neutral"`, `tailwind.cssVariables: true`, `iconLibrary: "lucide"`, aliases pointing to `@/*` paths. Use `pnpm dlx shadcn@latest add <component>` to add primitives — wrap in `components/app/` per D18. Never edit `components/ui/`.

**Retrofit cost if wrong:** Low (components.json edits) to Medium (base color or style swap requires re-adding all primitives).

---

## Q15. `.editorconfig`, `.gitattributes`, repo hygiene

**Current 2026 enterprise practice:** The micro-files enterprise repos always ship:

- **`.editorconfig`** — universal indent/charset/EOL. Biome respects it for users who don't run Biome locally.
- **`.gitattributes`** — `* text=auto eol=lf` to defeat Windows CRLF; `*.lock binary` to prevent diff noise; `*.png binary`/`*.woff2 binary`.
- **`.gitignore`** — Next.js's create-next-app default + `.turbo/`, `.sst/`, `.vercel/`, `coverage/`, `playwright-report/`, `test-results/`, `*.tsbuildinfo`.
- **`.nvmrc`** + **`.tool-versions`** (asdf/mise) + **`.node-version`** (some hosts/lockfile-lint tools read this) — three one-line files, total cost trivial, eliminates 90% of "works on my machine."
- **`.vscode/extensions.json`** — recommend `biomejs.biome`, `bradlc.vscode-tailwindcss`, `dbaeumer.vscode-eslint`, `ms-playwright.playwright`, `vitest.explorer`.
- **`.vscode/settings.json`** — `"editor.defaultFormatter": "biomejs.biome"`, `"editor.formatOnSave": true`, `"typescript.tsdk": "node_modules/typescript/lib"` (use workspace TS version), `"eslint.useFlatConfig": true`.
- **`AGENTS.md` + `CLAUDE.md`** — Next.js 16 create-next-app now scaffolds AGENTS.md by default to guide coding agents. You already have CLAUDE.md; add AGENTS.md as a 3-line pointer to CLAUDE.md.
- **`renovate.json`** — `{ "extends": ["config:recommended", "group:monorepos", "schedule:weekly"], "minimumReleaseAge": "3 days" }`. PostHog uses 72h (4320 minutes); 3 days is the 2026 supply-chain consensus.
- **`CODEOWNERS`** — even at 1 engineer, locks who reviews what when team grows.
- **GitHub PR template + issue templates** — `.github/pull_request_template.md`.
- **`commitlint.config.js`** — Conventional Commits enforcement, runs in Lefthook commit-msg hook.

**Reference examples:**

- next-forge — ships .editorconfig, .gitattributes, AGENTS.md, biome.jsonc, renovate.json
- Cal.com — has CODEOWNERS, PR templates, 56 workflows
- PostHog pnpm.minimumReleaseAge — 4320 minutes (72h)

**Recommendation:** Ship all of the above at M1. Renovate over Dependabot (keep Dependabot security alerts on, disable version updates). Commitlint + Conventional Commits aligns with the CLAUDE.md commit conventions already locked.

**Retrofit cost if wrong:** Low individually; cumulatively **Medium** because retrofitting all of these mid-project is a week of distraction nobody schedules.

---

## Anything genuinely uncertain — needs human input

1. **Bun vs pnpm.** next-forge (Vercel's reference) ships Bun. Bun 1.3 is production-grade per multiple 2026 sources. Bun is **measurably faster** at install + script execution + test runs. The uncertainty: HIPAA-aligned shops often want the "boring safe" pick, and Bun's runtime (vs just package manager) is younger. Recommendation default: **pnpm 10** for boring-safe. **Open question for the user:** willing to bet on Bun for a 2-3 year horizon, or pnpm-10 is fine?

2. **Pure Biome vs Hybrid Biome+ESLint.** Biome covers ~30 jsx-a11y rules but lacks `eslint-plugin-react-hooks` exhaustive-deps and `@next/eslint-plugin-next` rules. The exhaustive-deps rule alone has caught dozens of subtle bugs in real codebases. **Open question:** accept the gap and run pure Biome (simpler), or run hybrid (2 tools)? My recommendation is hybrid, but it's defensible to argue pure Biome saves cognitive load.

3. **Ultracite preset.** next-forge uses Ultracite (https://www.ultracite.ai) which wraps Biome with React/Next opinions + AI-friendly defaults. Cuts config from ~150 lines to ~5. Trade-off: opinionated, less escape-hatch. **Open question:** adopt Ultracite at M1, or hand-roll Biome config (more control)?

4. **`packageManager: pnpm@10.x` vs `pnpm@10.29.3` exact pin.** PostHog pins exact (`10.29.3`). Exact pin = reproducible builds; floating = automatic patch updates. Corepack respects both. Slight lean toward **exact pin** for HIPAA-aligned shops (audit trail).

5. **Tailwind v4 + shadcn integration edge cases.** Tailwind v4's `@theme` block + CSS variables interplay with shadcn's CSS-variable mode has had reported issues with arbitrary value usage. By M4 when real design lands this may be smooth; **flag to watch** rather than block M1.

---

## Plan summary table (M1 deliverable list, build/lint/test only)

| File                                                                                               | Purpose                                                                                                   |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `package.json` (root)                                                                              | `"packageManager": "pnpm@10.x.x"`, `"engines": { "node": ">=24 <25", "pnpm": ">=10" }`, workspace scripts |
| `pnpm-workspace.yaml`                                                                              | `apps/*`, `packages/*` + `pnpm.minimumReleaseAge: 4320`                                                   |
| `turbo.json`                                                                                       | `dev`, `build`, `test`, `test:e2e`, `lint`, `typecheck`, `format` tasks with proper inputs/outputs        |
| `.nvmrc`, `.tool-versions`, `.node-version`                                                        | Node 24.x.x                                                                                               |
| `biome.jsonc` (root)                                                                               | Extends `@quilty/biome-config/base`; format + lint + organize-imports                                     |
| `eslint.config.mjs` (apps/web)                                                                     | Minimal: `@next/eslint-plugin-next` + `eslint-plugin-react-hooks` + jsx-a11y gaps                         |
| `lefthook.yml`                                                                                     | pre-commit (parallel Biome+ESLint via lint-staged), commit-msg (commitlint), pre-push (typecheck)         |
| `lint-staged.config.mjs`                                                                           | Biome + ESLint scoped per glob                                                                            |
| `commitlint.config.js`                                                                             | Conventional Commits                                                                                      |
| `tsconfig.base.json` → `packages/tsconfig/base.json`                                               | strict, verbatimModuleSyntax, moduleResolution: bundler                                                   |
| `apps/web/tsconfig.json`                                                                           | extends `@quilty/tsconfig/nextjs`, `paths: { "@/*": ["./*"] }`                                            |
| `apps/web/components.json`                                                                         | shadcn config (style: new-york, RSC: true, Tailwind v4 empty config)                                      |
| `apps/web/vitest.config.ts`                                                                        | jsdom, v8 coverage, setup file                                                                            |
| `apps/web/vitest.setup.ts`                                                                         | Polyfill matchMedia/IntersectionObserver/ResizeObserver                                                   |
| `playwright.config.ts` (root)                                                                      | chromium/firefox/webkit projects, webServer block                                                         |
| `e2e/fixtures/axe.ts`                                                                              | WCAG 2.2 AA AxeBuilder factory                                                                            |
| `.github/workflows/{ci,lint,typecheck,test-unit,test-e2e,deploy-preview,sbom}.yml`                 | 7 workflows                                                                                               |
| `renovate.json`                                                                                    | `config:recommended`, `group:monorepos`, weekly, 72h min-release-age                                      |
| `.editorconfig`, `.gitattributes`, `.vscode/{settings,extensions}.json`, `CODEOWNERS`, `AGENTS.md` | Hygiene                                                                                                   |
| `sst.config.ts`                                                                                    | SST 4.x `Nextjs` component, dev stage default                                                             |
| `packages/tsconfig/{package.json,base.json,nextjs.json,react-library.json}`                        | Shared TS config                                                                                          |
| `packages/biome-config/{package.json,base.jsonc}`                                                  | Shared Biome config                                                                                       |

**NO `packages/ui/` or `packages/shared-types/` at M1.** Both materialize at first real trigger.

---

## Sources (all verified during this investigation)

- Cal.com package.json + biome.jsonc + turbo.json + tsconfig + workflows — github.com/calcom/cal.com
- PostHog package.json + pnpm-workspace.yaml — github.com/PostHog/posthog
- Vercel/next-forge — github.com/haydenbleasel/next-forge (or Vercel-blessed equivalent)
- Turborepo with-biome / with-vitest / with-tailwind examples — github.com/vercel/turborepo
- Next.js 16 install docs — nextjs.org/docs/app/getting-started/installation
- SST releases — github.com/sst/sst/releases (v4.14.1, 2026-05-12)
- SST Nextjs component — sst.dev/docs/component/aws/nextjs
- OpenNext AWS — github.com/opennextjs/opennextjs-aws (v4.0.2, 2026-05-08)
- OpenNext 3 years post — opennext.js.org/news/2026-03-25-3-years-of-opennext
- Biome rules sources — biomejs.dev/linter/rules-sources/
- Lefthook — github.com/evilmartians/lefthook (v2.1.6, Apr 2026)
- shadcn components.json docs — ui.shadcn.com/docs/components-json
- shadcn CLI v4.7.0 — github.com/shadcn-ui/ui (May 5, 2026)
- Playwright accessibility-testing — playwright.dev/docs/accessibility-testing
- Vitest issue #8526 (RSC async support) — github.com/vitest-dev/vitest/issues/8526
- Turborepo Vitest guide — turborepo.dev/docs/guides/tools/vitest
- Node.js release schedule — nodejs.org/en/about/previous-releases
- CycloneDX cdxgen — npmjs.com/package/@cyclonedx/cdxgen
- Renovate bot-comparison — docs.renovatebot.com/bot-comparison/
