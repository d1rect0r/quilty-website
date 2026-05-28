# CLAUDE.md

> **quilty-website** — Quilty's public-facing website.
> Marketing site + account portal + subscription management surface.
> HIPAA-aligned consumer **vaping cessation** product (Quilty).
> DTC at Phase 0 → not a HIPAA Business Associate. BA-ready architecture for Phase 1+ B2B (employer wellness / health-plan) channels per D176-D178 + ADR-0023 / ADR-0024 / ADR-0025 / ADR-0026.
> Non-prescription, non-DTx; FDA general-wellness lane (FD&C Act §520(o)(1)(B)).
> One-liner: _Quilty is an evidence-based vaping cessation program — a coach in your pocket to help you quit vaping for good._

## Status

M1.6 Workstreams C + D closed + Phase-B / Phase-C retroactive audit + doc-reconciliation pass landed. Foundation phase complete. Sprint metrics: 857+ tests across 17 workspaces, ≥98% type-coverage, 17/17 verify gates green, 3 new packages (`@quilty/search`, `@quilty/tokens`, `@quilty/workflow`), 9 new ADRs (0018 bundle budgets, 0019 search, 0020 design tokens, 0021 workflow engine, 0022 service worker, 0023 vaping-cessation regulatory classification, 0024 multi-state CHD posture, 0025 retention + research carve-out, 0026 pre-AI compliance shape). All structural decisions D1-D175 + U1-U10 + D176-D178 (vaping-cessation framing reconciliation) locked — see `docs/website_strategy_discussion.md`.

---

## Source of truth — read these first

| Doc                                   | Purpose                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `docs/website_strategy_discussion.md` | Locked decisions D1-D49 + Round-5 revisions + D50-D69 + U1-U8 + rationale ("the WHY")              |
| `docs/website_workflow_roadmap.md`    | Milestones M1-M9+, deliverables, decision gates ("the WHAT and WHEN")                              |
| `docs/research/`                      | 8 reports across rounds 1-2 + 11-file Round-5 audit at `docs/research/round_5_independent_review/` |
| `docs/adr/`                           | Architecture Decision Records (Nygard format) — landing alongside scaffold                         |

The strategy doc is authoritative for D1-D49 + Round-5 revisions + D50-D69 + U1-U8 with full rationale. The workflow doc is the operational playbook including current state inventory, cross-account pattern, integration touchpoints, launch readiness checklist, and trigger watchlist.

---

## Stack (locked)

- **Framework:** Next.js 16 App Router + TypeScript strict (D1)
- **Styling:** Tailwind v4 CSS-first (`@theme` block in `apps/web/app/globals.css`, no `tailwind.config.ts` file) + 3-layer token namespace (primitive → semantic → component) + shadcn/ui in `apps/web/components/ui/` with wrap-don't-edit (D17, D18)
- **Icons:** Lucide React (D19)
- **Deploy:** SST 4.x (Ion engine, Pulumi underneath, pinned `^4.14`) to AWS (D2 _— revised Round 5_)
- **Repo structure:** Turborepo + pnpm workspaces _(Round-5 revised — D69 dropped empty `packages/ui` from M1 scaffold)_ — `apps/web` (the Next.js app) + `packages/shared-types` (OpenAPI codegen target, empty at scaffold; populated M5). `packages/ui` NOT scaffolded at M1; recreate at first real extraction trigger.
- **Workspace `package.json` `name:` fields (locked — hooks + skills depend on these):**
  - `apps/web/package.json` → `"name": "web"`
  - `packages/shared-types/package.json` → `"name": "@quilty/shared-types"`
  - _(`packages/ui/` not scaffolded at M1 per D69; reserved name `"@quilty/ui"` for when it gets created at extraction trigger)_
- **Node + pnpm:** Node 24 LTS + pnpm 10 _(revised Round 5 — S3)_; pinned via `packageManager` + `.nvmrc` + `engines`
- **Observability:** Sentry Business tier (errors + RUM + error-triggered replay) from day-one (D42a); **PostHog Cloud Boost ($250/mo) for web analytics + replay + flags + experiments** from D42b _(Round-5 revised — was Amplitude)_; mobile keeps Amplitude (separate contract); OpenTelemetry-first via `@vercel/otel` (D56)
- **Logs:** CloudWatch — server-side only, zero PHI (D42d); PHI sanitizer + `assertNoPHI` + ESLint `no-console` + ban-direct-vendor-SDK-imports outside `lib/observability/` (D67)
- **Feature flags:** Typed `features.ts` env-var module day-one; **PostHog flags at trigger point** (D43 _Round-5 revised — was GrowthBook_)
- **Performance:** `next/font` variable font + `next/image` priority/sizes discipline (D21)
- **A11y:** axe-core in CI fail-on-violation + `eslint-plugin-jsx-a11y` in pre-commit; WCAG 2.2 AA target (D22, D23)
- **i18n:** next-intl with `/[locale]/` route segment reserved, English-only at launch (D14, D25)
- **CMS:** MDX in repo initially; migrate to Sanity/Contentful when content volume + non-engineering authors justify (D30)

---

## Domain + AWS placement

- **Public domain:** `my-quilty.com` (registered at Porkbun, DNS at Route 53 in `quilty-aws` production account) (D45)
- **Subdomains carved:**
  - `auth.my-quilty.com` — Cognito Managed Login (D6 _Round-5 revised — was "Hosted UI"_), provisioned, activated at M1 cutover (next sprint per U5)
  - `help.my-quilty.com` — reserved for hosted help center (Zendesk/Intercom)
  - `app.my-quilty.com` — reserved if web product surface ever ships
- **Phase 0 AWS account:** existing `development` account (D47, $0 incremental cost)
- **Phase 1 trigger:** public launch or first revenue → vend `marketing-prod` account in Workloads-NonHIPAA OU, migrate website out of `development`
- **Cross-account DNS pattern:** Pattern A — SST owns dev-account resources; `quilty-aws/dns/` layer (in prod account) adds Route 53 records via two-step coordinated deploy (one ceremony at cutover, dormant after)

---

## Backend (zero changes from website work)

**Backend is permanently Rust** (D48 — Track A migrated from TypeScript). ~30 Rust crates in `quilty-aws/lambdas/rust/`. Website talks to Rust backend over authenticated HTTPS via API Gateway.

**OpenAPI spec exported from Rust backend** is the cross-language contract for both website (TypeScript) and Flutter mobile (Dart). One source, multiple emission targets.

The website's TS Lambda (Next.js Route Handlers as BFF) is a **thin UI rendering + token-broker layer** — not backend logic. Business logic stays Rust. The TS Lambda:

- Renders React → HTML for SEO + first paint
- Handles OIDC callbacks, sets `__Host-` session cookies (D7)
- Proxies authenticated API calls to Rust backend
- Validates CSRF tokens (D10)

Tokens never reach the browser (BFF pattern, D5). PHI never reaches the website runtime (D31).

---

## Critical compliance rules

- **Zero PHI in website runtime** (D31). No PHI in CloudFront cache, no PHI in Lambda logs, no PHI in browser state, no PHI in third-party SDKs. Marketing + sign-in + account-mgmt only.
- **CSP nonce + strict-dynamic** from day one, report-only → enforce when clean (D32). Web Almanac 2025: CSP is the single most retrofit-hostile header.
- **Server-side ConsentState** single source of truth (D35). All analytics/marketing SDKs gated by consent. GPC `Sec-GPC: 1` honored at edge.
- **Session replay default mask-all**, allowlist non-PHI elements only (D40). Documented in BAA scope.
- **HIPAA-aligned, but website is in Workloads-NonHIPAA scope.** The Cerebral $7M and Monument cases were tracking-pixel exfiltration from PHI-handling accounts — Phase 1 migration into a dedicated `marketing-prod` account outside the BAA OU isolates this risk.
- **SCP forbids access to PHI buckets** from website-account principals (enforced at Phase 1 cutover).

---

## Auth posture

- **BFF pattern via Next.js Route Handlers** (D5). Tokens never in browser. Server-side session in `__Host-` prefixed cookie carrying an opaque session ID; the actual session record lives in DynamoDB (D51 _Round-5 lock — NOT iron-session sealed cookies; opaque-ID + server-side store enables instant revocation_).
- **Cognito Managed Login (Nov 2024 redesign) at `auth.my-quilty.com`** (D6 _Round-5 revised — was "Hosted UI"; Managed Login is the only path to passkeys/email MFA/`prompt=login`/branding editor_). Isolated auth attack surface.
- **OIDC code flow per subdomain** (D7) — NOT parent-domain `.my-quilty.com` cookies. `__Host-` prefix is mutually exclusive with parent-domain sharing.
- **SameSite=Lax** + signed double-submit CSRF token + custom `X-Quilty-CSRF` header + Origin/Referer check (D8, D10, D53 _Round-5 — CSRF triple-layer_)
- **Cognito-native logout + BFF-maintained opaque session-ID + EventBridge fan-out** (D9 _Round-5 revised — Cognito does NOT support OIDC Back-Channel Logout or emit `sid` claim; front-channel `/logout` + `AdminUserGlobalSignOut` API + EventBridge `quilty.auth.sessions_revoked` consumed by web BFF + Rust backend revocation cache; `/api/auth/backchannel-logout` Route Handler reserved as 501-stub for the day Cognito ships native BCL_). Wire EventBridge bus during M6.
- **Mobile + web sessions independent**, joined by `cognito_sub` (Cognito user identifier) + locally-minted `quilty_sid` (NOT the OIDC spec's `sid` claim, which Cognito does not emit), propagated via the EventBridge bus (D11 _Round-5 revised — wording corrected to reflect Cognito reality_). NOT OIDC Native SSO (token sharing rejected as premature enterprise complexity).
- **Access-token TTL 5 min; refresh-token TTL 8h; rotation via `GetTokensFromRefreshToken`** (D52 _Round-5_).
- **Step-up auth** via `prompt=login` + server-side `elevated_until` flag (5-min window) for sensitive actions (email change, account delete, payment method change, MFA management) — D54 _Round-5_.
- **Backup codes in-app** (Argon2id-hashed + DynamoDB), not in Cognito (D55 _Round-5_ — Cognito has no native backup-code surface).

---

## Working patterns

- Trunk-based on `main`, feature branches for non-trivial work
- Atomic commits per logical unit
- Push only at milestone boundaries (M1, M2, …) per `feedback_push_per_phase`
- ADRs in `docs/adr/` for non-obvious choices
- 3-agent QA loops after autonomous milestone closure via `/run-qa-loop`

Patterns to formalize after M1-M2 lived experience are in
`~/.claude/projects/-Users-d1rect0r-interneta-AppBuilding-quilty-website/memory/project/working_patterns_tbd.md`.

---

## Git conventions

- **All commits SSH-signed** via `~/.ssh/id_ed25519_signing` (commit.gpgsign=true is set globally; unsigned commits will fail)
- Trunk-based on `main`, feature branches for non-trivial work
- Atomic commits per logical unit
- Conventional commit prefixes: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`
- Push only at milestone boundaries per `feedback_push_per_phase` user memory
- Commit messages end with: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (Claude Code's `includeCoAuthoredBy` is set to `false` in this repo's settings.json, so Claude appends the trailer manually in every commit — do not skip it)

---

## NEVER

- Commit unsigned (no `--no-verify` or `--no-gpg-sign` unless explicitly authorized)
- Push without explicit user authorization at milestone boundaries
- Include PHI in CloudFront cache, Lambda logs, browser state, or third-party scripts
- Load analytics/marketing SDKs before user consent (D35; the Cerebral $7M lesson)
- Co-locate marketing site with PHI-handling services in the same AWS account (Phase 1 trigger separates this)
- Edit `apps/web/components/ui/` (shadcn primitives) directly — wrap them in `apps/web/components/app/` instead (D18; PreToolUse hook enforces this mechanically)
- Use git submodules for cross-repo type sharing (universally regretted; use OpenAPI codegen or published packages)
- Adopt Backstage or commercial IDP below ~10 engineers (premature)
- **Adopt any accessibility overlay product** (accessiBe, UserWay, AudioEye, EqualWeb, etc.) — FTC settled $1M order against accessiBe (April 2025); disability-community consensus rejects overlays; 800+ professionals on the Overlay Fact Sheet; UserWay class action Feb 2026; ~25% of 2024 ADA lawsuits cited overlays as failing to remediate. Overlays do NOT achieve WCAG 2.2 AA compliance; ship native accessibility (D22, D23). _(Added Round 5 — Overlay Prohibition Rule per file 07.)_
- Build the blog, full CMS, sitewide search, A/B testing, or hosted help center pre-launch (all triggered work)
- Touch `.well-known/apple-app-site-association` or `.well-known/assetlinks.json` without verifying mobile-app deeplink behavior — these are bound to iOS bundle `7XGU6BN3K3.app.quilty.myquilty` + Android `app.quilty.myquilty`

---

## Related repos

- `quilty` — Flutter mobile app (Dart)
- `quilty-aws` — AWS Terraform infrastructure (7+ Terraform layers) + Rust auth backend (~30 crates) + DNS layer (production account, where `my-quilty.com` hosted zone lives)
- `quilty-entra` — Microsoft Entra IdP for staff
- `quilty-m365` — Microsoft 365 / Intune for staff devices
- `quilty-1password` — secrets management

---

## Memory

Project memory index: `~/.claude/projects/-Users-d1rect0r-interneta-AppBuilding-quilty-website/memory/MEMORY.md`

Read MEMORY.md first when picking up any task — it indexes locked decisions (D1-D49 + Round-5 revisions + D50-D69 + U1-U8), M1 scaffold state, inherited feedback (push-per-phase, build-the-good-thing, etc.), and reference notes (Next.js 16 + SST 4.x + HIPAA boundary).

**Round 5 audit (2026-05-17):** 9-agent independent architecture review surfaced 11 decision revisions + 20 new decisions (D50-D69) + 8 UX/sequencing locks (U1-U8). Full audit at `docs/research/round_5_independent_review/`. Key impacts on this orientation:

- **Tailwind v4 CSS-first** in `apps/web/app/globals.css` `@theme` block — **NO `tailwind.config.ts`** (D17 clarified)
- **`proxy.ts` not `middleware.ts`** — Next.js 16 renamed the file convention (S4 revised)
- **Two-tier CSP per-route** — marketing static-hashed / portal nonce + strict-dynamic (D59)
- **OpenTelemetry-first** via `@vercel/otel`; Sentry consumes OTel spans (D56)
- **PostHog Cloud Boost** for web analytics + replay + flags (D42b/D43 revised); Amplitude only for mobile
- **Opaque session-ID + DynamoDB store** for auth sessions; NOT iron-session (D51)
- **Cognito doesn't support OIDC Back-Channel Logout or emit `sid`** (D9/D11 revised) — use EventBridge fan-out
- **Velite + Zod** for MDX content (D64), typed discriminated-union block library (D65)
- **AI crawler policy** in `robots.ts` — block training, allow citation (D66)
- **Drop empty `packages/ui` at M1** (D69 overrides D49 for that workspace)

Cross-repo: `~/.claude/projects/-Users-d1rect0r-interneta-AppBuilding-quilty-aws/memory/project/website_strategy_locked_2026-05-14.md` has the original lock-down context if needed.

---

## First-session bootstrap (one-time per workstation)

Before the first M1 session in this repo:

1. `cp .claude/settings.local.json.template .claude/settings.local.json` (the local file is gitignored)
2. `aws sso login --profile quilty-dev` (Phase 0 deploys to the `development` account — verify your SSO profile name matches your AWS config)
3. `export GITHUB_PAT=<fine-grained PAT>` if using the GitHub MCP server
4. `export CONTEXT7_API_KEY=<key>` if using the Context7 docs MCP server
5. Confirm signing key: `git config --get user.signingkey` should match `~/.ssh/id_ed25519_signing.pub`
6. Confirm gitleaks installed: `which gitleaks` (the commit guard depends on it)
7. Sentry MCP authenticates on first `/mcp` invocation via OAuth — accept the prompt
8. Open a new Claude Code session in this directory; the SessionStart hook injects git + phase context

The `.claude/CURRENT_PHASE` file is committed at `M1`; bump it at each milestone boundary (`echo M2 > .claude/CURRENT_PHASE && git add … && git commit`).

---

## Quick start (will populate during M1)

Will be filled in once Next.js + SST scaffold lands. Will include:

- `pnpm install` — install deps
- `pnpm sst dev --stage <name>` — local development with live Lambda
- `pnpm sst deploy --stage <stage>` — preview/prod deploys (prod requires explicit human authorization; `guard-bash.sh` blocks `--stage prod`/`production`)
- `pnpm test` — Vitest unit; `pnpm test:e2e` — Playwright; `pnpm test:a11y` — axe-core

Until then: see `docs/website_workflow_roadmap.md` § M1 for the exact deliverable list.
