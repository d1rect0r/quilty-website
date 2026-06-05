# ADR-0007 — Early dev-tooling adoption (Knip, syncpack, depcruise, size-limit, Lighthouse CI, commitlint, secretlint, csp_evaluator, Spotlight)

- **Status:** Accepted (2026-05-19)
- **Deciders:** Volodymyr Petrychenko
- **Consulted:** dev-tooling research agent (post-M1 final-QA, surveyed
  Astro, Cal.com, Turborepo, Vercel, Sentry-Docs, Resend, Linear, Hono
  package.json files + State of JS 2025 + Web Almanac 2025)

## Context

The 12-commit M1 scaffold landed a strong correctness baseline: TS
strict, ESLint flat with jsx-a11y strict-tier, Prettier, Husky +
lint-staged, Vitest, Playwright + axe-core fail-on-violation, Sentry
with PHI sanitizer chokepoint, OpenTelemetry owned by the Sentry SDK
(D56 revised — `@vercel/otel` removed), Velite + Zod content layer, Renovate.

What the M1 baseline did **not** cover:

1. **Unused exports / files / dependencies.** TypeScript strict mode
   does not flag dead code, and a marketing site that grows to ~50K
   LOC over 18 months accumulates orphaned modules + abandoned deps
   that ship in the Lambda bundle.
2. **Dependency version drift across workspaces.** pnpm catalog +
   workspaces protect installation but not declaration-time drift.
   The Round-5 audit caught one example before the final QA fix
   (typescript pinned exact in two workspaces, caret in the third).
3. **Import-graph structural rules.** ESLint sees individual files;
   it cannot enforce "components/ui must not import from anywhere
   else" or "vendor SDKs are forbidden outside lib/observability/"
   at the **transitive** level. The wrap-don't-edit rule (D18) +
   PHI sanitizer chokepoint (D67) both live or die by this guarantee.
4. **External bundle observability.** Next.js 16 deleted per-route
   build statistics (Vercel acknowledged the numbers were
   unreliable). Without external bundle budgeting, a regression from
   accidental client-side imports of the Sentry server SDK or the
   Amplitude analytics SDK without consent-gate would ship invisibly.
5. **Continuous CWV measurement.** axe-core fails on a11y violations
   on every PR, but no equivalent for LCP / CLS / TBT. A marketing
   site whose pitch is "HIPAA-aligned + performant" cannot afford to
   regress here.
6. **Type-coverage erosion.** TS strict catches new `any`; it does
   not catch a graduate of strict-mode where the codebase is 30%
   `any` because of `as` casts and `unknown` boundary types. The
   Cerebral $7M lesson made architectural — sanitize chokepoint
   matters less if its inputs are unknown.
7. **Conventional-commit enforcement at message time.** The Husky
   regex check works but is a private DSL; commitlint reads industry-
   standard rules + integrates cleanly with Changesets (M5+).
8. **Per-file secret scanning.** gitleaks runs against git history
   (catches what's already in); secretlint per-file is the
   complementary 2026 layer for per-staged-file inspection (catches
   what's about to land).
9. **CSP policy bypass-database validation.** Our proxy.ts two-tier
   CSP is structurally correct but no automated check catches
   regressions against Google's published bypass database (e.g., a
   developer adds `script-src 'unsafe-inline'` for a Stripe Elements
   debugging session and forgets to remove it).
10. **Dev-time observability inspection.** Sentry events fire in dev
    too; without a local overlay, the PHI sanitizer chokepoint
    cannot be verified-by-eye before shipping. Spotlight provides
    that overlay locally without consuming Sentry Business-tier
    quota.

The post-M1 dev-tooling research agent (M1 verification report —
Appendix) confirmed that Astro, Cal.com, Turborepo, Sentry-Docs,
Vercel's own engineering, Linear, and Resend all bake Tier-1 of
these tools into pre-commit + CI. State of JS 2025 + Web Almanac 2025
corroborate the shift toward layered hygiene.

## Decision

Adopt nine tools at M1+1 (not deferred to M3+ as the research agent
initially proposed). All are MIT/Apache 2.0 with zero SaaS dependency.

| Tool                           | Layer                               | Failure mode in CI                                                              | M1 baseline                                                                                   |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Knip 5.88                      | Unused exports/files/deps/binaries  | Error (any unused)                                                              | 0 unused at M1; scoped to files,dependencies,unlisted,binaries; exports + types flip on at M2 |
| syncpack 13                    | Dep version drift across workspaces | Error (any drift)                                                               | 0 drift; OTel versionGroup forces match to pnpm.overrides                                     |
| dependency-cruiser 17          | Import-graph rules                  | Error on cycles, shadcn-isolation, vendor-SDK-chokepoint                        | 0 violations                                                                                  |
| size-limit 12                  | Bundle budgets                      | Error on exceeded                                                               | gzip 201 KB / brotli 175 KB JS; 4.5 KB CSS — budgets 30% above with headroom                  |
| Lighthouse CI 0.15             | CWV + a11y + SEO scores             | Error a11y ≥0.95, SEO ≥0.95, CLS ≤0.1; warn perf ≥0.90, LCP ≤2500ms, TBT ≤200ms | Calibrated against first-build local run                                                      |
| type-coverage 2.29             | TS type-coverage %                  | Error if <97%                                                                   | 97.57% achieved (vs ratchet to 99% at M3 when SST/Velite SDK typings mature)                  |
| commitlint 19                  | Conventional Commits at commit-msg  | Error on non-conformant                                                         | replaces .husky/commit-msg regex                                                              |
| secretlint 11                  | Per-staged-file secret scanning     | Error on detected secret                                                        | 0 false positives after .secretlintignore tuned                                               |
| csp_evaluator 1.1.5            | CSP policy bypass-database lint     | Error on HIGH severity                                                          | 0 HIGH on marketing + portal CSP                                                              |
| Sentry Spotlight (overlay 4.5) | Local dev overlay for Sentry/OTel   | N/A (dev-only)                                                                  | Tree-shaken from prod bundle                                                                  |

## Consequences

**Positive:**

- Real bug caught immediately: Knip flagged `@vitest/coverage-v8`
  referenced by vitest.config but missing from apps/web/package.json
  — that would have broken `pnpm test:coverage` silently.
- Real drift caught: syncpack flagged a typescript version mismatch
  that the M1 commits hadn't surfaced.
- Bundle baseline locked: 201 KB gzip / 175 KB brotli with 30%
  headroom. Future commits that breach this fail CI before merge.
- Wrap-don't-edit + PHI chokepoint now enforced at the import graph,
  not just the lint and PreToolUse layers.
- Trusted Types Baseline 2026 readiness: csp_evaluator catches policy
  drift before it reaches production.
- Commit messages now read by a tool, not a regex — Changesets path
  at M5+ is unblocked.

**Negative:**

- ~50 MB added to `node_modules` (acceptable — devDeps don't ship).
- ~30 seconds added to the pre-commit + CI hygiene job (acceptable —
  parallelizable, mostly cached after first run).
- Tooling configs proliferate at repo root: knip.json,
  .syncpackrc.json, .dependency-cruiser.cjs, .size-limit.cjs,
  .lighthouserc.json, commitlint.config.mjs, .secretlintrc.json,
  .secretlintignore, typeCoverage block in package.json. Mitigated
  by extensive in-file comments documenting why each setting was
  chosen.

**Trade-offs explicitly considered + rejected:**

- **Biome / oxlint as ESLint replacement.** Faster but no jsx-a11y
  parity; D22 WCAG 2.2 AA + the consumer vaping cessation product risk
  profile (see ADR-0023 + ADR-0024) needs jsx-a11y strict. Revisit at
  M5+ if parity lands.
- **Storybook over Ladle.** When component playground lands at M3+,
  Ladle (Uber: 15,896 stories migrated) is the cheaper, faster
  default for our React-only single-framework codebase. Storybook's
  cross-framework + huge addon ecosystem isn't load-bearing for us.
- **Pact / consumer-driven contract testing.** openapi-msw +
  openapi-fetch (lock-in at M5) gives the same type-safety benefit
  at 1/10 the ceremony.
- **TanStack Query at M1.** Server Actions + native Next.js fetch
  cache handle 80% of our portal data needs; add Query only when a
  demonstrated need surfaces.
- **Million.js / Million Lint.** Marketing site is mostly RSC/static;
  runtime React rendering isn't the bottleneck.

## Implementation

Landed in three logical commits after the M1 verification commit:

1. `chore(tooling): adopt Knip + syncpack + dependency-cruiser + type-coverage`
2. `chore(tooling): adopt size-limit + Lighthouse CI for perf observability`
3. `chore(tooling): adopt commitlint + secretlint + csp_evaluator`
4. `feat(dev): Sentry Spotlight dev overlay`

Each commit includes the tool, its config, CI wiring, and an initial
baseline run.

## Future work

- M2: Flip Knip `--include exports,types` on once Velite content
  consumes block schemas + Sentry/Amplitude adapters are exercised.
- M3: Ratchet type-coverage from 97% to 99% when SST + Velite SDK
  typings improve.
- M3+: Add Ladle for component playground + Argos CI for visual
  regression once `components/app/` has ~20+ wrapped primitives.
- M5: openapi-typescript + openapi-fetch + openapi-msw triad when
  Rust backend ships its OpenAPI spec.
- M5+: Changesets when packages publish.
- M8: trufflehog on `.next` build artifact (per the 2026 layered
  secrets-scanning model: history via gitleaks + per-file via
  secretlint + artifact via trufflehog).

## References

- [Knip 5.88 docs](https://knip.dev)
- [syncpack docs](https://syncpack.dev)
- [dependency-cruiser docs](https://github.com/sverweij/dependency-cruiser)
- [size-limit docs](https://github.com/ai/size-limit)
- [Lighthouse CI docs](https://github.com/GoogleChrome/lighthouse-ci)
- [commitlint docs](https://commitlint.js.org)
- [secretlint docs](https://github.com/secretlint/secretlint)
- [csp_evaluator (Google)](https://csp-evaluator.withgoogle.com)
- [Sentry Spotlight](https://spotlightjs.com)
- M1 verification report Appendix — full dev-tooling research agent
  output at `docs/m1_verification_report.md`
- [Web Almanac 2025 — Capabilities chapter](https://almanac.httparchive.org/en/2025/capabilities)
- [State of JS 2025](https://stateofjs.com/en-US)
