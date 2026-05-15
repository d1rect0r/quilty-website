# CLAUDE.md

> **quilty-website** — Quilty's public-facing website.
> Marketing site + account portal + subscription management surface.
> HIPAA-aligned consumer mental-health (Quilty).

## Status

Pre-scaffold (2026-05-15). Cloudflare Pages scaffold soft-nuked. M1 (Next.js + Tailwind v4 + shadcn + SST scaffold) pending. All structural decisions D1-D49 locked — see `docs/website_strategy_discussion.md`.

---

## Source of truth — read these first

| Doc | Purpose |
|---|---|
| `docs/website_strategy_discussion.md` | Locked decisions D1-D49 + rationale ("the WHY") |
| `docs/website_workflow_roadmap.md` | Milestones M1-M9+, deliverables, decision gates ("the WHAT and WHEN") |
| `docs/research/` | 8 research reports across 4 rounds informing decisions |

The strategy doc is authoritative for D1-D49 with full rationale. The workflow doc is the operational playbook including current state inventory, cross-account pattern, integration touchpoints, launch readiness checklist, and trigger watchlist.

---

## Stack (locked)

- **Framework:** Next.js 16 App Router + TypeScript strict (D1)
- **Styling:** Tailwind v4 CSS-first (`@theme` block in `apps/web/app/globals.css`, no `tailwind.config.js`) + 3-layer token namespace (primitive → semantic → component) + shadcn/ui in `apps/web/components/ui/` with wrap-don't-edit (D17, D18)
- **Icons:** Lucide React (D19)
- **Deploy:** SST 3.x (OpenNext underneath) to AWS (D2)
- **Repo structure:** Turborepo + pnpm workspaces — `apps/web` (the Next.js app) + `packages/ui` (workspace scaffolded EMPTY, populated only at extraction trigger per D49) + `packages/shared-types` (OpenAPI codegen target, empty at scaffold) (D4)
- **Workspace `package.json` `name:` fields (locked — hooks + skills depend on these):**
  - `apps/web/package.json` → `"name": "web"`
  - `packages/ui/package.json` → `"name": "@quilty/ui"`
  - `packages/shared-types/package.json` → `"name": "@quilty/shared-types"`
- **Observability:** Sentry Business tier (errors + RUM) from day-one; Amplitude (matches mobile choice) added pre-launch (D42a, D42b)
- **Logs:** CloudWatch — server-side only, zero PHI (D42d)
- **Feature flags:** Typed `features.ts` env-var module day-one; GrowthBook self-hosted at trigger point (D43)
- **Performance:** `next/font` variable font + `next/image` priority/sizes discipline (D21)
- **A11y:** axe-core in CI fail-on-violation + `eslint-plugin-jsx-a11y` in pre-commit; WCAG 2.2 AA target (D22, D23)
- **i18n:** next-intl with `/[locale]/` route segment reserved, English-only at launch (D14, D25)
- **CMS:** MDX in repo initially; migrate to Sanity/Contentful when content volume + non-engineering authors justify (D30)

---

## Domain + AWS placement

- **Public domain:** `my-quilty.com` (registered at Porkbun, DNS at Route 53 in `quilty-aws` production account) (D45)
- **Subdomains carved:**
  - `auth.my-quilty.com` — Cognito Hosted UI (D6, provisioned, activated post-M1)
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

- **BFF pattern via Next.js Route Handlers** (D5). Tokens never in browser. Server-side session in `__Host-` prefixed cookie.
- **Cognito Hosted UI at `auth.my-quilty.com`** (D6). Isolated auth attack surface.
- **OIDC code flow per subdomain** (D7) — NOT parent-domain `.my-quilty.com` cookies. `__Host-` prefix is mutually exclusive with parent-domain sharing.
- **SameSite=Lax** + signed double-submit CSRF token + custom `X-Quilty-CSRF` header (D8, D10)
- **OIDC Backchannel Logout with `sid`** (D9). Wire endpoint during M6.
- **Mobile + web sessions independent**, joined by `sid` claim, propagated via backchannel logout (D11). NOT OIDC Native SSO (token sharing rejected as premature enterprise complexity).

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

Read MEMORY.md first when picking up any task — it indexes locked decisions (D1-D49), M1 pre-scaffold state, inherited feedback (push-per-phase, build-the-good-thing, etc.), and reference notes (Next.js 16 + SST 3.x + HIPAA boundary).

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
