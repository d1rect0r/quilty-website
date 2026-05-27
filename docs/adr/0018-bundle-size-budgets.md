# ADR-0018: Per-route bundle-size budgets + size-limit CI gate

- **Status:** Accepted
- **Date:** 2026-05-27
- **Last reviewed:** 2026-05-27
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** M1.6 Workstream D.5 research (per `docs/m1.6_foundation_finishing_plan.md` § D.5); 1 user alignment decision (3-tier budgets vs single-tier) answered 2026-05-27
- **Related decisions:** D21 (`next/font` variable font + `next/image` priority/sizes discipline), D32 (per-route CSP nonce/hash budgeting), D59 (two-tier marketing-static / portal-nonce CSP)
- **Related ADRs:** [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0014](0014-port-adapter-naming.md)
- **Related research:** M1.6 Wave 3 enterprise-pattern research (size-limit vs Bundlewatch vs Lighthouse CI 2026 canon)
- **Software versions assumed:** Next.js 16.2, React 19, size-limit 12.1.0, `@size-limit/file` 12.1.0, `andresz1/size-limit-action@v2`

## Context

Next.js 16 deleted per-route build statistics (Vercel admitted the numbers were unreliable). External bundle budgeting is the only mechanism to detect per-route bundle regressions before they ship.

The pre-existing `.size-limit.cjs` carried 4 aggregate entries (total JS gzip + brotli + CSS + shared-runtime) + 1 broad `(marketing) route chunk` glob. This catches global bloat but misses per-route regressions: a 20 KB regression added to `/pricing`'s client-island graph would not trip the aggregate budget until the full chunks directory crossed 260 KB.

The Next.js 16 + React 19 baseline is ~70-90 KB gzipped BEFORE app code (framework + main + webpack-runtime chunks). Per-route 60 KB is realistic for lean marketing pages; legal pages routinely run lighter (~25-30 KB); portal pages with `react-hook-form` + Zod + auth-aware islands need a higher tier (~150 KB).

The "do nothing" outcome: per-route bloat hides inside the aggregate budget. The first measurement that flags it is the launch-week Lighthouse audit — too late to fix without a rushed re-architecture.

## Decision

We will ship a 4-tier per-route bundle budget in `.size-limit.cjs`, with each route gaining BOTH a per-route entry (route chunk in isolation) AND a first-load entry (route chunk + shared framework/main/webpack-runtime chunks combined). CI runs `size-limit` on every build + `andresz1/size-limit-action@v2` on every PR with diff-comment-on-PR.

### Critical caveat — measurement bundler ≠ production bundler

`apps/web` `build` script ships with `next build --webpack` (opt-out of the Next.js 16 default Turbopack production build). Turbopack emits content-hashed FLAT chunks under `.next/static/chunks/` with no per-route subdirectory structure; size-limit's per-route glob pattern (`chunks/app/<group>/<route>/page-*.js`) cannot match anything in that layout. Webpack emits per-route subdirectory chunks, which is the measurement surface this ADR consumes.

The trade-off: the chunk graph the gate measures is NOT identical to the chunk graph Turbopack would ship to production. Turbopack uses module-merging optimisations that produce a tighter overall graph; webpack-built measurements are conservative upper bounds. Bundle-size REGRESSIONS the webpack measurement catches WILL also be regressions under Turbopack — but absolute budget headroom under Turbopack is greater than this gate suggests. ADR-0017-style activation gate condition: re-baseline budgets once Turbopack ships per-route chunk emission OR the team migrates to a bundler-agnostic measurement tool (Codecov Bundle Analysis via Sentry; see watchlist).

`apps/web` `dev` script is unchanged — Turbopack continues to power `next dev` (where bundle-budget gates are irrelevant and Turbopack's iteration speed is the only thing that matters).

The Next.js 16 `--experimental-analyze` flag (bundle-analyzer ergonomics for ad-hoc debugging) is Turbopack-only. Post-switch, the canonical bundle-debugging path is `pnpm size:why` (size-limit's `--why` plugin), already wired in `package.json`.

### Decision A — Four-tier budget taxonomy

| Tier           | Routes                                                                                                                                                       | Per-route gz | First-load gz |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------- |
| Lean marketing | 11 non-legal marketing pages (`/`, `/about`, `/contact`, `/customers`, `/features`, `/for-business`, `/help`, `/pricing`, `/science`, `/security`, `/trust`) | 60 KB        | 180 KB        |
| Content legal  | 7 legal pages (`/legal/{privacy, consumer-health-data-privacy, terms, subprocessors, accessibility, cookies, privacy-choices}`)                              | 30 KB        | 150 KB        |
| Portal         | 7 account pages (`/account`, `/account/{data, delete, notifications, privacy, security, subscription}`)                                                      | 150 KB       | 280 KB        |
| Error/utility  | 3 status pages (`/410`, `/451`, `/503`)                                                                                                                      | 20 KB        | 130 KB        |

Total: **28 routes × 2 entries = 56 per-route entries** + 4 aggregate entries = 60 size-limit entries.

The error/utility tier surfaces at outage time (4xx/5xx); bloat there directly impacts user trust at the worst moment + Googlebot scrapes these on crawl errors. Tight 20 KB ceiling catches Sentry-init / error-overlay bloat leaking into the `(errors)` route group.

### Decision B — Per-route + first-load dual-measurement

Each route gets two entries:

- **Per-route** measures ONLY the chunk Next.js emits at `chunks/app/[locale]/<group>/<route>/page-<hash>.js`. Catches regressions that bloat a single page's `'use client'` graph without touching shared deps.
- **First-load** combines the route chunk + `chunks/framework-*.js` + `chunks/main-*.js` + `chunks/webpack-*.js`. Approximates what the browser actually downloads on cold visit. Catches dependency drift in shared chunks that erodes first-load weight on every route simultaneously.

The two-measurement design comes from the 2026 enterprise-bundle-budget canon (Vercel + Shopify + Stripe public engineering posts).

### Decision C — Factory pattern in `.size-limit.cjs`

The config uses a `routeEntries({ name, glob, tier, perRouteLimit, firstLoadLimit })` helper that produces both entries per route. Tiers are arrays of `{ name, glob }`; the per-tier `.flatMap()` of `routeEntries` produces the full entry set. Adding a route is a 3-line change (one entry per tier array). The shared-runtime glob constants are imported into every first-load entry so a future shared-chunk filename rename is a one-place edit.

### Decision D — CI integration

Two CI steps in `.github/workflows/ci.yml`:

1. **`pnpm size`** runs on every push + PR (existing). Fails the build if any budget is exceeded.
2. **`andresz1/size-limit-action@v2`** runs ONLY on `pull_request` events. Comments a per-route delta-vs-base-branch table on the PR. Configured with `skip_step: build` (build already ran in the previous step) + `script: pnpm size`. Uses `GITHUB_TOKEN` for the comment; no additional secrets needed.

PR-blocking is enforced via the size-limit-action's non-zero exit code on budget overrun (the PR is required to pass CI to merge).

### Decision E — Lighthouse CI deferred (TW-015)

Lighthouse CI measures CWV scores (LCP, INP, CLS) but requires preview URLs + 3+ runs per URL to denoise INP. M1.6 doesn't yet have a preview-deploy pipeline (deploy.yml is `if: false`-gated per the M1 scaffold). Lighthouse CI integration lands at the preview-deploy + INP-denoise feasibility trigger documented as TW-015 on the watchlist.

size-limit alone covers the byte-budget gate at M1.6; Lighthouse CI is additive at M4-M6.

## Consequences

**Positive:**

- A regression that adds 20 KB to a single route's client-island graph fails CI on the PR commit, not at launch-week Lighthouse audit.
- The 4-tier taxonomy makes the budget visible at the route level — engineers SEE the budget tightness when adding a new dep.
- PR-comment diff table makes the cost of every change visible without running the build locally.
- Factory pattern in the config keeps the file maintainable as routes are added.

**Negative:**

- 56 per-route entries (28 routes × 2 entries each — per-route + first-load) = more local + CI time. Locally `pnpm size` takes ~8s currently; estimate ~30s post-change (parallelizable internally).
- **CI cost amplification under `andresz1/size-limit-action@v2`**: the action ALSO runs `pnpm install` + `pnpm size` on the base branch under the hood (only way to compute the PR diff). With the webpack production build (slower than Turbopack), the effective PR build job runs the build TWICE — roughly doubling job wall-time. The build-job `timeout-minutes` was raised from 15 to 25 to accommodate. Migration to Codecov Bundle Analysis eliminates the double-build cost.
- The `next build --webpack` opt-out is slower than Turbopack production builds (estimate 2-3× depending on cold-cache state). Acceptable trade-off at M1.6 for the per-route measurement surface; revisit when Turbopack production builds reach feature parity OR when a bundler-agnostic measurement tool migrates the gate.
- A flapping shared-chunk size (e.g., Sentry SDK auto-update bumping framework chunk weight 5 KB) trips all 25 first-load entries simultaneously. Mitigation: the aggregate `Shared runtime + framework` entry catches this first; per-route first-load entries become noise. Plan to ratchet down per-route first-load budgets only after 30 days of stable measurements.
- Portal tier 280 KB first-load is intentionally generous (`react-hook-form` + Zod + auth-island overhead). Tighten at the portal extraction milestone when real consumers ship.
- The aggregate `Total static JS (gzip) 2.5 MB` is calibrated to the webpack vendor-splitting baseline (OpenTelemetry + Sentry + framework). Vercel.com / Stripe.com / Linear.app marketing pages target 200-400 KB JS per route in 2026 (Next.js perf canon); the 2.5 MB ceiling is conservative-but-tight for OUR vendor graph and ratchets down once the graph stabilises.

**Neutral:**

- Lighthouse CI deferral leaves a measurement gap on CWV scores; size-limit covers bytes only. Acceptable trade-off at M1.6 (no preview deploys yet).

## Verification

1. `.size-limit.cjs` produces 60 entries (4 aggregate + 56 per-route).
2. `pnpm size` exits 0 against the current M1.6 build (no budgets exceeded).
3. `.github/workflows/ci.yml` runs `pnpm size` + `andresz1/size-limit-action@v2`.
4. A test PR that bloats `/pricing` past 60 KB gz fails CI with a clear diff comment.

## Revisit triggers

- **Tighter budgets after content lands** — when content volume + design-system maturity stabilises (M4-M5), ratchet down each tier 10-15%.
- **Aggregate budget ratchet** — re-baseline `Total static JS (gzip) 2.5 MB` toward 1.8 MB once the vendor-chunk graph stabilises (no additional SDKs landing in M2-M3). First re-baseline at the M2 content drop.
- **Lighthouse CI activation** — Watchlist entry (preview URLs + INP denoise feasibility).
- **Turbopack production parity** — re-baseline budgets when Turbopack ships per-route subdirectory chunk emission; then evaluate whether to swap `--webpack` back out OR keep the dual-bundler measurement.
- **Codecov Bundle Analysis migration** — Sentry's Codecov product ships bundler-agnostic bundle-analysis with PR Status Checks; migrate once the first 30-day measurement baseline lands AND/OR the Turbopack/webpack divergence becomes ground-truth-relevant.
- **`/edge` subpath for `@quilty/security`** — when CF Functions / OpenNext edge handlers grow, carve an `/edge` subpath that excludes both `node:crypto` and the larger PHI sanitizer payload (Edge runtime ships Web Crypto, not Node crypto).
- **New route tier** — if a future feature ships a tier that doesn't fit (e.g., dashboard with heavy charting), add a 4th tier with documented justification.

## Watchlist entries

The following triggers will be filed in `docs/runbook/trigger-watchlist.md` (C.1) at sprint close:

- Lighthouse CI integration (preview URLs + INP denoise)
- Turbopack production parity for per-route chunks
- Codecov Bundle Analysis migration (eliminates double-build CI cost)
- Aggregate JS budget ratchet (2.5 MB → 1.8 MB after vendor-graph stabilises)
- `@quilty/security/edge` subpath carve-out at Edge runtime activation
