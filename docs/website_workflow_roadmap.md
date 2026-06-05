# Quilty Website — Workflow Roadmap

> Operational playbook for building, integrating, and launching the Quilty website.
> **This doc** = the "what" and "when" (milestones, deliverables, gates, sequencing).
> **`website_strategy_discussion.md`** = the "why" (D1-D49 locked decisions + rationale).
>
> Living document. Updated as milestones complete, patterns emerge, and triggers fire.

---

## Quick reference — where things live

| Concern                              | Location                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Strategy + locked decisions (D1-D49) | `quilty-website/docs/website_strategy_discussion.md`                                                                       |
| Research backing strategy decisions  | `quilty-website/docs/research/` (8 reports across 4 research rounds)                                                       |
| Workflow + milestones (this doc)     | `quilty-website/docs/website_workflow_roadmap.md`                                                                          |
| Existing AWS infrastructure context  | `quilty-aws/CLAUDE.md`                                                                                                     |
| Existing DNS layer                   | `quilty-aws/dns/` (production account, us-east-1)                                                                          |
| Existing Auth layer (Cognito + Rust) | `quilty-aws/auth/` + `quilty-aws/lambdas/rust/crates/auth-*`                                                               |
| Memory pointer                       | `~/.claude/projects/-Users-d1rect0r-interneta-AppBuilding-quilty-aws/memory/project/website_strategy_locked_2026-05-14.md` |

---

## North Star

**Build a good website.** First-class long-term product surface for Quilty — not a minimum-viable-to-unblock-X checklist sprint. External onboarding (Apple Dev org, SES production, Stripe activation, Google OAuth, BAA vendors) clears as a byproduct of doing the work well; we don't optimize for the checklist.

Quality bar = Calm or Oura at MVP scale. NOT Headspace (years of dedicated web/SEO/B2B investment, not emulatable for small team).

Pace: scope → direction → scaffold → small features → integrate auth → harden. **No rushing.**

---

## Current state snapshot (2026-05-14)

### Already in place — `quilty-aws` (production account `975630231383`, us-east-1)

**DNS layer (`quilty-aws/dns/`):**

- Three hosted zones in Route 53:
  - `my-quilty.com` — provisioned, SES email infrastructure wired (3 identities + DKIM CNAMEs for transactional/notifications/marketing) — **the future website domain**
  - `my-quilty.app` — currently active for M365 email (DKIM, SPF, DMARC, MX, autodiscover) — **internal use** going forward
  - `my-quilty.net` — brand protection
- NS records at Porkbun confirmed pointing to Route 53
- DNSSEC enabled on all three zones
- Query logging delivered to log-archive
- Wildcard ACM cert for `my-quilty.app` + `*.my-quilty.app` (ECDSA P256, us-east-1)
- CAA records lock cert issuance to Amazon CAs only (we must use ACM)
- Old Cloudflare Pages CNAME placeholder at `count = 0` — designer anticipated this exact transition

**Auth layer (`quilty-aws/auth/`):**

- ACM cert for `auth.my-quilty.com` already provisioned + validated
- Cognito custom domain `auth.my-quilty.com` provisioned but **currently DISABLED** (`enable_custom_domain = false`)
- Cognito falls back to prefix domain `quilty-{env}.auth.us-east-1.amazoncognito.com`
- **Blocker:** Cognito custom domain requires parent domain (`my-quilty.com`) to have an A record. Deploying the website unblocks this — one toggle flip after website is live.
- 30+ Rust crates for auth handlers (auth-public, auth-admin, auth-user, authorizer, Cognito triggers, MFA, etc.) — completely untouched by website work

**Email layer (`quilty-aws/email/`):**

- 3 SES identities ready: `my-quilty.com` (transactional), `notifications.my-quilty.com` (engagement), `marketing.my-quilty.com` (promotional)
- DKIM + SPF + MAIL FROM + DMARC all wired
- SES still in sandbox until production access requested (website existence helps justify)

**Other:**

- App-sync layer (Track A): CloudFront, API Gateway, DDB scaffolding — uses `app-sync` subdomain pattern (TBD if changes)
- Currently `development` account is empty + baselined — **Phase 0 home for website**
- Cache layer (ElastiCache Valkey) provisioned and ready
- Audit pipeline (DDB Streams → Firehose → S3 Object Lock) operational

### What we build in M1

- `quilty-aws/website-baseline/` — new Terraform layer in `development` account
  - Writes SSM parameters SST will consume
  - Provisions OIDC role for GitHub Actions SST deploys
  - Provisions permission boundary for SST-created IAM roles
- `quilty-website/` — overwrite Cloudflare scaffold with Turborepo _(deliverable list revised Round 5)_:
  - `apps/web` — Next.js 16 App Router + TypeScript strict (shadcn primitives at `apps/web/components/ui/` per D18 + D69)
  - `packages/shared-types` — empty workspace placeholder (`@quilty/shared-types`); populated at M5 with OpenAPI codegen from Rust backend
  - **No `packages/ui` at M1** — dropped per D69 (Round-5 override of D49's "scaffold empty" intent); recreate at first real extraction trigger
  - `sst.config.ts` — SST 4.x (Ion engine, pinned `^4.14`)
  - Tailwind v4 **CSS-first `@theme` in `globals.css`** with 3-layer token namespace (NO `tailwind.config.ts` per D17)
  - Lucide icons, `next/font` variable font, `next/image` discipline
  - `proxy.ts` (Next.js 16 file-convention rename of `middleware.ts`) — two-tier CSP per route per D59
- `quilty-aws/dns/` updates — add alias records (apex + www) pointing to CloudFront, write ACM validation records for the website cert

---

## Cross-account pattern (LOCKED — Pattern A: coordinated two-step deploy)

**Architectural reality:** `dns` Terraform layer runs in **production account** (`975630231383`). SST website runs in **development account** (Phase 0 home). ACM certs + Route 53 records span both accounts.

**Pattern A — coordinated deploy:**

1. **SST creates** in dev account: CloudFront distribution, Lambda (Next.js SSR), S3 origin, ACM cert for `my-quilty.com` + `www` in us-east-1
2. SST outputs: CloudFront distribution domain + ACM validation CNAMEs (name + value)
3. **Terraform `dns` layer updates** in prod account using those outputs: writes ACM validation records in hosted zone → cert validates
4. Same `dns` apply: writes alias record at apex + www pointing to CloudFront distribution domain
5. Website resolves at `my-quilty.com` end-to-end

**Why this is fine:**

- The dns layer is "mostly done and forgotten" — DNS changes happen at cutover events (rare), not at content deploys
- Content deploys = pure SST in dev account, never touches prod
- DNS layer keeps its clean audit posture (no cross-account write access from SST)
- Pattern B (SST cross-account assume-role) was rejected because it grants SST permanent write access to the most sensitive layer

**Frequency of dns-layer touches expected:**

| Event                                         | Frequency           | Triggers dns apply? |
| --------------------------------------------- | ------------------- | ------------------- |
| Website content/code deploy (PR, main)        | Daily/weekly        | NO                  |
| ACM cert renewal                              | Auto (AWS handles)  | NO                  |
| Adding new website subdomain                  | Yearly maybe        | YES                 |
| Initial cutover                               | ONCE                | YES                 |
| Phase 1 migration to `marketing-prod` account | ONCE (post-revenue) | YES                 |

**Operational implication:** During M1, plan for two coordinated TF applies (`website-baseline` in dev, then `dns` in prod). After M1, dns is dormant from website perspective.

---

## Milestone roadmap

> Drive patterns: **Autonomous** = Claude drives end-to-end, user authorizes pushes at phase boundaries. **Mixed** = back-and-forth iteration. **User-driven** = user provides direction/content, Claude implements.

### M1 — Foundation

**Goal:** Website exists at `my-quilty.com` with placeholder content. CloudFront + Lambda + Cognito custom domain wired. External-system reviewers see a real site.

**Effort:** 1-2 days
**Drive:** Autonomous

**Deliverables:**

- `quilty-aws/website-baseline/` Terraform layer (new):
  - `oidc_role.tf` — GitHub Actions OIDC role for SST deploy
  - `permission_boundary.tf` — IAM permission boundary for SST-created roles
  - `ssm_parameters.tf` — writes parameters SST reads (hosted zone ID, log archive bucket ARN, KMS key ARN, OIDC provider ARN)
  - `kms.tf` — website-specific KMS CMK if needed (SST may not need one initially)
  - `outputs.tf`, `variables.tf`, `versions.tf`, `backend.tf`, `providers.tf`, `README.md`
- `quilty-website/` Turborepo scaffold _(deliverable list revised Round 5 — see `docs/research/round_5_independent_review/`)_:
  - `package.json` (root, `packageManager: "pnpm@10.x"`, `engines.node: ">=24 <25"`)
  - `pnpm-workspace.yaml`
  - `turbo.json`
  - `tsconfig.base.json`
  - `.nvmrc` (24), `.npmrc`, `.gitattributes`, `.editorconfig`
  - `sst.config.ts` — SST 4.x skeleton (config only at M1; first deploy is next sprint)
  - `apps/web/` — Next.js 16 App Router scaffold
    - `app/page.tsx` — redirect to `/en/`
    - `app/[locale]/layout.tsx` + `app/[locale]/(marketing)/layout.tsx` + `app/[locale]/(account)/layout.tsx` — locale segment + route groups (D14 + S1 + S2 baked from day one)
    - `app/[locale]/(marketing)/page.tsx` — placeholder homepage with one `Hero` block via `<BlockRenderer>`
    - `app/[locale]/(marketing)/{features,pricing,about,contact,science,for-business,customers,help}/page.tsx` — reserved stubs (U2 + U3 — `/careers` NOT reserved per U2)
    - `app/[locale]/(marketing)/legal/{privacy,terms,cookies}/page.tsx` — placeholder legal stubs
    - `app/[locale]/(account)/account/{security,subscription,data,notifications,delete}/page.tsx` — reserved stubs (M5 fills)
    - `app/api/auth/{callback,logout,session,refresh}/route.ts` + `app/api/webhooks/stripe/route.ts` — reserved Route Handler stubs (501 until M6/M7)
    - `app/layout.tsx` — root layout with `metadataBase`, root `<title>` fallback (Next 15.2+/16 streaming-metadata bug), OG+Twitter cards, Organization+WebSite+SoftwareApplication JSON-LD
    - `app/sitemap.ts` (locale-aware), `app/robots.ts` (AI crawler policy per D66/U4)
    - `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`
    - `app/manifest.ts`
    - `app/globals.css` — **Tailwind v4 `@theme` block CSS-first** with 3-layer token namespace (D17 — NO `tailwind.config.ts`)
    - `next.config.ts` — `trailingSlash: false`, redirects() versioned table, AASA/assetlinks.json `Content-Type: application/json` headers (S8)
    - `proxy.ts` — **Next.js 16 file-convention rename of `middleware.ts`** — owns nonce generation + two-tier CSP per-route branching (marketing static-hashed / portal nonce+strict-dynamic per D59), Trusted Types report-only (D57), security headers baseline (D33+D58), Sentry as report-uri sink (D61)
    - `instrumentation.ts` + `instrumentation-client.ts` + `sentry.{server,edge}.config.ts` — OpenTelemetry owned by the Sentry SDK (D56 _revised — `@vercel/otel` removed_) + Sentry with mask-all replay defaults (D68)
    - `lib/security/{csp,headers}.ts` + tests
    - `lib/observability/{logger,sanitize,assertNoPHI,log-error,track,flag,web-vitals,replay-classes,consent}.ts` — PHI sanitizer + adapters (D67)
    - `lib/flags/features.ts` — typed env-var flag module (D43)
    - `lib/content/{schemas,load}.ts` — Velite + Zod-validated MDX (D64)
    - `lib/seo/schemas.ts` — JSON-LD builders (D27)
    - `components/blocks/{Hero,ValueProp,FeatureGrid,FAQ,TestimonialQuote,CTABanner,BlockRenderer}.tsx` — typed discriminated-union block library (D65)
    - `components/site/{Header,Footer,SkipLink,FocusOnNavigate}.tsx` — marketing chrome + a11y primitives
    - `components/account/{PortalNav,PortalSidebar}.tsx` — hybrid portal nav (U1)
    - `components/legal/GpcHonoredIndicator.tsx` — CCPA §7025(c)(6) visible indicator (D62)
    - `components/ui/` — shadcn primitives installed via `pnpm exec shadcn add button card dialog form input label separator sheet sonner skeleton tabs`
    - `components.json` — shadcn config
    - `public/.well-known/{apple-app-site-association,assetlinks.json}` — relocated from repo root (S8)
    - `velite.config.ts` — content layer
    - `vitest.config.ts` + `vitest.setup.ts` — Vitest + RTL + jsdom + v8 coverage
    - `playwright.config.ts` + `tests/playwright/**` — Playwright + axe-core wrapper (WCAG 2.2 AA tags)
    - `eslint.config.mjs` — flat config + jsx-a11y/strict + no-console + ban-direct-vendor-SDK-imports custom rule
  - `packages/shared-types/` — empty workspace placeholder (`@quilty/shared-types`); populated at M5 with OpenAPI codegen from Rust backend
  - **NO `packages/ui/` at M1** — dropped per D69 (the Round-5 audit override of D49's "scaffold empty" intent); recreate at first real extraction trigger
  - `.husky/{pre-commit,commit-msg}` + `lint-staged.config.mjs` + `prettier.config.mjs`
  - `.github/workflows/{ci,deploy}.yml` (deploy.yml gated `if: false` until next-sprint OIDC role exists) + `renovate.json` (security alerts + routine updates with 72h `minimumReleaseAge` + monorepo grouping per D36 _Round-5 revised — Dependabot dropped in favor of Renovate_) + `CODEOWNERS` + `PULL_REQUEST_TEMPLATE.md`
  - `docs/adr/` directory with 0000-template + 0001-monorepo-shape + 0002-session-cookie-pattern + 0003-openapi-codegen-direction + 0004-observability-stack + 0005-csp-two-tier + 0006-content-layer
  - `docs/research/round_5_independent_review/` — 11-file audit archive
  - `docs/runbook/sst-deploy.md` + `docs/runbook/m1_post_scaffold_checklist.md` (user manual actions: harness patch, CURRENT_PHASE bump, settings.local additions)
  - `README.md`
- `quilty-aws/dns/` updates:
  - Add alias record at `my-quilty.com` apex → CloudFront distribution
  - Add alias record at `www.my-quilty.com` → CloudFront distribution
  - Add ACM validation CNAMEs for `my-quilty.com` + `*.my-quilty.com` cert (SST creates cert, dns layer validates)
- One SST deploy to dev account, one TF apply to dns layer in prod, verify TLS + CSP + cold start

**Decision gates before M2:**

- TLS handshake works at `my-quilty.com`
- CSP report-only is logging (not enforcing yet)
- Cold start <2s for first uncached SSR render
- Sentry receives a test error from the deployed Lambda
- `web-vitals` package reports INP/LCP/CLS to Sentry

**After M1:** Flip `auth/variables.tf`'s `enable_custom_domain = true` and apply auth layer → Cognito custom domain `auth.my-quilty.com` activates (15-60 min provision time). MTA-STS TXT can be added to dns layer.

### M2 — Skeleton

**Goal:** All structurally-required pages exist with placeholder content. Site is "complete" in shape even if content is placeholder.

**Effort:** 3-5 days
**Drive:** Autonomous

**Deliverables (8 pages):**

- `/` — homepage with placeholder hero, value prop, CTA
- `/privacy` — placeholder privacy policy (lawyer review at M8)
- `/terms` — placeholder Terms of Service
- `/support` — real contact email + basic FAQ
- `/resources` — canonical public-health cessation resources (per ADR-0023 + research): 1-800-QUIT-NOW (national quitline), smokefree.gov (NCI/HHS), state-specific quitlines, Truth Initiative's This Is Quitting (DITCHVAPE → 88709), CDC Tips From Former Smokers. Explicit "Quilty is not affiliated with…" copy. NO claim of CDC/NCI endorsement. Quilty is one option among many; users self-call (no PHI handoff).
- `/account/delete` — deep-linkable deletion landing page (Apple/Google requirement)
- `/404` — branded
- `/500` — branded
- Global header + footer with real navigation
- shadcn primitives wired and themed
- Marketing block library skeleton (Hero + ValueProp + CTABanner at minimum)
- Sitemap.ts + robots.ts emit correct URLs
- MedicalWebPage schema.org markup baseline on relevant pages
- Open Graph metadata, Twitter cards
- Tailwind v4 token namespace populated (primitive → semantic layers; component layer per-component)
- axe-core in CI fail-on-violation (WCAG 2.2 AA tags)
- `eslint-plugin-jsx-a11y` in pre-commit
- Vitest unit test setup
- Playwright e2e + a11y test scaffold
- Renovate config baseline

**Decision gate before M3:** axe-core passes on all 7 pages. Lighthouse scores ≥90 across the board on /. Apple/Google submission becomes viable from this point.

### M3 — Identity discovery + entity formation (voice + visual + legal)

**Goal:** Site looks and sounds like Quilty, not like default shadcn. Legal entity in place so subscription contracts can be signed in the company name.

**Effort:** 1-2 weeks of iteration
**Drive:** User-driven (you experiment in Claude Design / mockup tools) + Mixed (I implement)

**Deliverables (visual + voice):**

- 3-5 homepage hero copy variants explored
- 2-3 visual directions (color palette, typography, density)
- Final voice + visual identity locked through artifacts
- Tailwind tokens updated to reflect chosen palette
- Typography stack chosen (variable font via `next/font`)
- Component library customized away from shadcn defaults
- Updated /privacy, /terms, /support, /account/delete to match new visual
- Updated metadata + Open Graph images
- Brand guideline doc (`docs/brand_guidelines.md` — minimal, just enough to maintain consistency)

**Deliverables (entity + legal — Round 6 Wave 6 promotion):**

- USPTO trademark filing for "Quilty" name + logo (manual user action; brand identity must lock before filing)
- Delaware C-Corp formation (manual user action; gates on initial revenue planning + lawyer review of the cap table)
- Customer.io activation (transactional + drip email — BAA-eligible; replaces ad-hoc SES drip post-launch)
- Sub-processor email-list mailbox `subprocessors@my-quilty.com` activated (D102 + D118)

**Decision gate before M4:** voice + visual feel "right." This is judgment, not metric. USPTO filing receipt in hand. Delaware C-Corp formation complete (entity number assigned). Customer.io activation is non-blocking — drip + transactional copy can ship after M4 starts; BAA + sending-domain warmup are the gate items, not the campaign content.

### M4 — Marketing pages

**Goal:** Marketing surface complete enough to drive App Store / Play conversions.

**Effort:** 1-2 weeks
**Drive:** Mixed (user provides direction/content, Claude implements)

**Deliverables:**

- `/features` (or `/how-it-works`) — block-array composed
- `/science` (or `/research`) — clinical credibility, MedicalWebPage schema with `lastReviewed` + `reviewedBy`
- `/pricing` — TBD: visible vs quiz-gated
- 1-2 deep feature pages (linked from /features)
- Marketing block library fully populated (Hero + ValueProp + FeatureGrid + FAQ + TestimonialQuote + CTABanner)
- Internal nav between marketing pages
- App Store / Play "smart banners" via meta tags
- Updated sitemap.ts
- **Marketing-copy review gate per ADR-0023 (FDA general-wellness lane):** every page passes a copy-discipline lint that rejects `digital therapeutic` / `DTx` / `prescription` / `FDA-cleared` / `clinically proven` (without an explicit RCT citation) / `medical-grade` / `treat` / `cure` / `diagnose` / `addiction recovery` / `wellness app` / `quit smoking app`. Approved hedged phrasing: "may help reduce risk," "supports quitting," "evidence-informed." This is a build-time gate, not just a soft review — the lint runs in CI on every PR touching MDX content + page route files.
- **WA MHMDA + MD MODPA cross-state CHD copy review per ADR-0024:** marketing copy must not imply collection of consumer health data beyond what's strictly necessary for the requested feature; no profiling-style language; explicit GPC posture mentioned in privacy preview.

**Decision gate before M5:** marketing pages convert (or at least feel like they could). Lighthouse + Core Web Vitals still green. Page weight budget honored. **Marketing-copy lint passes on all pages with zero exemptions.**

### M5 — Account portal v0 (static)

**Goal:** Complete account portal UX exists as static UI. Demoable. Tests in place. No real auth yet.

**Effort:** 1-2 weeks
**Drive:** Autonomous

**Deliverables:**

- `/login` — form UI, no real auth integration
- `/account` — profile UI (display name, email, phone change)
- `/account/security` — MFA management (passkeys list, TOTP setup, backup codes), session list
- `/account/subscription` — Stripe Customer Portal embed mockup + IAP routing copy + plan-switch UI
- `/account/data` — data export request, account deletion flow
- `/account/notifications` (optional v1+) — email/push preferences
- Layout primitives for portal (sidebar, breadcrumbs, status indicators)
- Skeleton loading states (for eventual auth-gated rendering)
- Form validation patterns
- Accessibility verified across all portal screens
- Playwright e2e tests for happy-path navigation

**Decision gate before M6:** every portal screen exists, demoable, accessible. Real auth integration is the next step.

### M6 — Real auth integration (BIG milestone)

**Goal:** Real users can log in, see real data, manage their accounts.

**Effort:** 2-3 weeks
**Drive:** Mixed (coordinated with auth backend deploy state)

**Pre-requisites:**

- W2-B.3 auth backend deployed to prod (currently NOT pushed pending user authorization — must complete before M6 fully works end-to-end)
- Cognito Managed Login at `auth.my-quilty.com` activated (M1 unlock per U5 — _Round-5 wording per D6_)
- Cognito app client for web with redirect URIs registered (confidential client per U7)
- EventBridge bus `quilty.auth.sessions_revoked` provisioned in `quilty-aws/auth/` (consumer for cross-device sign-out per D9 _Round-5_)
- DynamoDB session table provisioned for opaque session-ID storage (D51 _Round-5_)

**Deliverables:**

- Next.js Route Handlers (BFF):
  - `/api/auth/callback` — OIDC code exchange, creates DynamoDB session, sets `__Host-quilty_sid` cookie carrying opaque session ID (D51 _Round-5_ — NOT iron-session sealed cookie)
  - `/api/auth/logout` — clears DynamoDB session row + `__Host-` cookie, calls `AdminUserGlobalSignOut`, publishes `quilty.auth.sessions_revoked` event to EventBridge (D9 _Round-5_ — Cognito-native logout + EventBridge fan-out, NOT OIDC BCL which Cognito doesn't support)
  - `/api/auth/refresh` — server-side token refresh via `GetTokensFromRefreshToken` with rotation enabled (D52 _Round-5_ — access TTL 5min, refresh TTL 8h)
  - `/api/auth/session` — returns session metadata for client consumption
  - `/api/auth/backchannel-logout` — **reserved 501-stub Route Handler** for the day Cognito ships native OIDC BCL (D9 _Round-5_ reserve)
  - `/api/csrf` — issues signed double-submit CSRF token (paired with `X-Quilty-CSRF` header + Origin/Referer check per D53 _Round-5_ — triple-layer)
- BFF middleware (in `proxy.ts`): session validation against DynamoDB, CSRF triple-layer check on mutating requests, request signing
- `__Host-quilty_sid` opaque-session-ID cookie (HTTP-only, Secure, SameSite=Lax, Path=/, no Domain attribute per D7) — value is an opaque DynamoDB key, NOT a token (D51 _Round-5_)
- EventBridge consumer in BFF + Rust backend revocation cache subscribed to `quilty.auth.sessions_revoked` (D9 _Round-5_)
- Real account data fetch from Rust backend (over HTTPS to API GW with auth headers + W3C `traceparent` propagation per D38/D56)
- Real MFA management (passkeys + TOTP enrollment, verification, recovery, in-app backup codes per D55 _Round-5_)
- Real session list + "sign out everywhere" (via EventBridge fan-out + DynamoDB session-row invalidation — NOT OIDC BCL per D9 _Round-5_)
- Step-up auth flows (D54 _Round-5_) for email change, account delete, payment method change, MFA mgmt: `prompt=login` redirect + server-side `elevated_until` flag (5-min window)
- Real account deletion flow (initiates DSAR + erasure)
- Real data export flow (initiates DSAR exporter)
- W3C traceparent propagation: browser → CloudFront → Lambda → API GW → Rust backend
- Audit-log integration: web mutations carry `channel: "web"` tag at API GW boundary
- Error envelope: RFC 9457 Problem Details consumed from Rust backend, surfaced in UI
- Sentry replay configured with mask-all default, allowlist non-PHI elements

**Decision gates before M7:**

- End-to-end auth flow works: sign-up → email verify → MFA enroll → log in → manage account → log out
- Session refresh works without flicker
- Step-up auth surface works (changing email, deleting account triggers re-MFA)
- All web audit events visible in DDB Streams → Firehose → S3 Object Lock pipeline
- Sentry replay masks portal sensitive content correctly
- jwt_tool / Newman / k6 verification suite passes against staging

### M7 — Real subscription

**Goal:** Real money flows. Users can subscribe, manage billing, cancel.

**Effort:** 1-2 weeks
**Drive:** Mixed (coordinated with adding Rust webhook handlers)

**Pre-requisites:**

- Stripe full activation done (M8 has the website checklist) — chicken-and-egg, so M7 starts in test mode
- BAA with Stripe signed (if processing health-related data; consult lawyer)
- Sign in with Apple integration ready (Cognito IdP federation; D6 Managed Login supports SiwA natively)

**DTC-only at M7 per D178.** Phase 0 billing is Stripe + Apple Pay + Sign in with Apple — DTC consumer flow only. No insurance claims, no employer-wellness PHI flow, no Change-Healthcare-style intermediary. **Quilty is not a HIPAA Business Associate at M7.** The architecture is BA-ready (Phase-1 marketing-prod account split, PHI sanitizer chokepoint, OpenAPI surface for downstream BAA chain), but no PHI flows to insurers because no B2B contract exists yet. B2B billing pathway is reserved for the TW-010 + TW-013 trigger: first signed B2B contract with claims-billing requirement → activate a separate `billing-b2b` crate + Change-Healthcare integration + BAA signing flow + employer-cohort dashboard (k≥11 anonymity per HHS HCUP). The split keeps the M7 DTC delivery clean and prevents premature B2B-shape from contaminating the consumer subscription model.

**Deliverables:**

- Stripe Customer Portal embed with deep links to subscription/payment/cancellation
- Stripe + Apple Pay (Payment Request API; Stripe.js handles the wallet integration; replaces a separate RevenueCat IAP dependency for web checkout per Round 6 mobile-stack reconnaissance — mobile retains StoreKit/Play Billing direct, no RevenueCat wrapper)
- Sign in with Apple (federated IdP via Cognito Managed Login per D6; required by App Store §4.8 if any other third-party identity provider is offered — passkeys + Google + SiwA are the M7 federation set)
- IAP-aware routing: detect Apple/Google subscribers, route to App Store / Play settings with explicit copy
- HSA/FSA invoice download
- Plan-switch flow (monthly ↔ annual with proration)
- Trial → paid conversion handling
- Stripe webhook handlers (Rust) — new crate(s) in `lambdas/rust/crates/stripe-webhook-*`
- Subscription state mirrored in DDB (auth-side single-table)
- Email triggers via SES (welcome, renewal, cancellation, dunning)
- Error states: payment failure, card decline, dunning UI

**Decision gates before M8:** test-mode subscription flow works end-to-end. Webhook idempotency verified. Cancellation works correctly.

### M8 — Real legal + compliance

**Goal:** Legally launch-ready.

**Effort:** 1-2 weeks + lawyer wait time
**Drive:** Mixed (lawyer-driven for copy; Claude implements technical surfaces)

**Deliverables:**

- Lawyer-reviewed Privacy Policy (replaces M2 placeholder)
- Lawyer-reviewed Terms of Service (replaces M2 placeholder)
- HIPAA Notice of Privacy Practices `/hipaa-notice`
- Refund + cancellation policy `/refund`
- Cookie consent banner with granular GDPR + CCPA toggles
- `Sec-GPC: 1` (Global Privacy Control) honored at edge (Lambda@Edge or BFF middleware)
- Server-side ConsentState — SDK loading gated by consent for analytics/marketing
- "Your Privacy Choices" link in global footer + privacy policy
- "Limit Use of My Sensitive Personal Information" link (CPRA — vaping/nicotine cessation behavioral data is sensitive PI; SUD adjacency under CMIA AB-2089)
- Accessibility statement (WCAG 2.2 AA conformance)
- Manual a11y audit (TPGi or Deque) — pre-EU-launch requirement (EAA June 2025)
- Business name + physical address in footer (Stripe + GDPR identity disclosure)
- Stripe full activation: complete the website checklist (16 items in `research/regulatory_requirements.md`)
- Auto-renewal + trial terms disclosure
- Breach notice template at `/security/notices/` (soft requirement until needed)
- **CSP enforce-flip from report-only to enforce** (Round 6 promotion — pre-requisite: 14 days of zero first-party violations in the Sentry CSP sink per D32 + D61 + the post-sprint checklist gate)
- **HSTS preload submission to hstspreload.org** (Round 6 promotion — pre-requisite: M8 launch deploy + 30-day clean window at `max-age` target value with `includeSubDomains` per D60 + `docs/runbook/hsts-preload-gate.md`)
- Sentry Business BAA countersigned + Sentry Replay activation (Round 6 promotion — gate-condition for moving from error-triggered only to consent-gated normal-sampling; per `docs/runbook/m1.5-post-sprint-checklist.md` item 5)
- Mobile-coordinated apex-domain migration (Round 6 promotion — `support@my-quilty.app` → `support@my-quilty.com` per D45; coordinated Flutter release shipping the AASA/assetlinks manifest update for `my-quilty.com` deep-link claims)

**Decision gate before launch:** lawyer signs off on privacy + terms + NPP. Stripe full activation granted. Apple Dev org enrollment complete. SES production access granted (likely landed by M2-M3, but verify). EAA-readiness audit complete if launching in EU. CSP enforce-flip + HSTS preload submission complete (the two one-way doors in the security-header stack). Sentry Business BAA countersigned (gates Replay normal-sampling activation).

### M9+ — Iterate (post-launch, ongoing)

**Goal:** Continuous improvement based on real user signal.

**Drive:** Mixed, user-prioritized

**Likely deliverables (not exhaustive):**

- Hosted help center migration (Zendesk or Intercom at `help.my-quilty.com`)
- Blog (if/when content marketing matters)
- A/B testing infrastructure (Amplitude Experiment — same vendor as analytics per D42b/D43 _Amplitude pivot 2026-05-19_)
- SEO investment + content marketing
- More marketing pages
- Performance tuning (cold start, INP, LCP optimization)
- Internationalization activation (first non-EN locale)
- Headless CMS migration (when content volume + non-engineering authors justify)
- Sitewide search (Pagefind → Algolia trigger)
- Advanced analytics dashboards
- Amplitude analytics activation (when traffic + ConsentState shipped per D42b _Amplitude pivot 2026-05-19_; shared SDK + data platform across web + mobile)
- **SOC 2 Type II readiness** (Round 6 promotion — post-launch ~12 months; gates on first SaaS B2B contract requesting SOC 2 attestation OR pre-Series-A diligence trigger; Drata/Vanta as the post-2024 enterprise compliance-automation canon)
- **Status page activation** (Round 6 promotion — Instatus Pro on `status.my-quilty.com`; gates on first paying customer OR first published uptime SLA OR 100 active users per `docs/runbook/m1.5-post-sprint-checklist.md` item 10)
- **Service Worker activation** (Round 6 promotion — PWA install becomes a growth lever post-launch; gates on first measurable install-conversion intent; Workbox is the canonical 2026 PWA toolkit)

---

## Parallel / cross-cutting workstreams (continuous from M1)

### CI/CD

- GitHub Actions OIDC → SST deploy
- `main` push → production stage in dev account
- PR open → preview stage (auto-cleanup on close)
- Lockfile + SBOM (CycloneDX) generation per build
- Renovate (security alerts + routine updates + 72h minimumReleaseAge) — Dependabot dropped per D36 _Round-5 revised_
- Sigstore signing (mirroring backend pattern)

### Testing

- Vitest for unit/component tests
- Playwright for e2e + a11y (axe-core integration)
- Visual regression (Percy / Chromatic — TBD, additive)
- Performance budgets enforced in CI (Lighthouse CI)

### Observability (Sentry from M1, Amplitude pre-launch — _Amplitude pivot 2026-05-19_)

- Sentry: errors + RUM + error-triggered replay (mask-all default per D40/D68)
- `web-vitals` → OTel histograms → Sentry (D56 _revised_ — OpenTelemetry owned by the Sentry SDK; `@vercel/otel` removed)
- Server-side logging to CloudWatch + PHI sanitizer + structured JSON (D42d/D67)
- W3C `traceparent`/`baggage` propagation wired in M1 (D38/D56); end-to-end across Rust at M6
- **Amplitude** activated post-ConsentState (M3) for analytics; Amplitude Experiment at the flag-trigger point (D42b/D43 _Amplitude pivot 2026-05-19_; web + mobile share the same SDK + data platform)
- Sentry Replay only for session replay per D68 (error-triggered, `replaysSessionSampleRate: 0`, mask-all + block-class on clinical controls); **Amplitude Session Replay is explicitly REJECTED** per Round-5 attribute-leak finding

### Security

- CSP nonce + strict-dynamic, report-only → enforce
- Security headers baseline (HSTS preload, frame-ancestors, Permissions-Policy)
- SRI on first-party `_next/static/*` bundles only (Stripe.js + analytics rely on nonce + strict-dynamic + CSP reporting per D34 _Round-5 revised_ — Stripe explicitly does not publish SRI hashes). Puppeteer-based synthetic tamper-detection at M7 per PCI DSS 4.0 §11.6.1.
- WAF managed rules at CloudFront
- Cloudflare Turnstile on auth/signup forms
- Renovate centralized config (eventually)

### Cost monitoring

- Infracost diff on PR (matches `quilty-aws` pattern)
- Per-stage cost reports

### Documentation

- README in each app + package
- ADRs for non-obvious decisions in `quilty-website/docs/adr/`
- Inline JSDoc on non-trivial functions

---

## Integration touchpoints with `quilty-aws`

| Touchpoint                                               | When                                | What we coordinate                                                                                                                                             | Owner                 |
| -------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `dns/` layer (prod account)                              | M1, M8                              | Add alias records, validate ACM cert, MTA-STS TXT                                                                                                              | Coordinated           |
| `auth/` layer                                            | M1 (flip flag), M6 (web app client) | `enable_custom_domain = true`, add web Cognito app client with redirect URIs                                                                                   | Coordinated           |
| Cognito Managed Login _(Round-5 wording per D6)_         | M6                                  | Activate, configure for web flow + passkeys + email MFA + `prompt=login` step-up (Managed Login required for these); branding editor at M3; custom UI deferred | quilty-aws            |
| `email/` layer (SES)                                     | M2+                                 | Transactional emails from website (welcome, password reset) — already wired, just call from BFF                                                                | quilty-aws (existing) |
| OpenAPI spec from Rust backend                           | M6+                                 | Website TS types via codegen (or hand-write initially, automate later)                                                                                         | quilty-aws            |
| Cache layer (ElastiCache Valkey)                         | M6                                  | BFF session storage TBD — may use, may rely on cookies only                                                                                                    | TBD at M6             |
| Stripe webhook handlers (Rust)                           | M7                                  | New Rust crate(s) in `lambdas/rust/crates/` for subscription state webhooks                                                                                    | quilty-aws            |
| Audit pipeline (DDB Streams → Firehose → S3 Object Lock) | M6+                                 | Web mutations carry `channel: "web"` tag at API GW; lands in same audit sink                                                                                   | quilty-aws (existing) |
| W2-B.3 deploy state                                      | M6 blocker                          | Auth backend must be deployed to prod before live auth integration                                                                                             | quilty-aws            |
| Phase 1 migration                                        | post-launch (~M8 trigger)           | Vend `marketing-prod` account in Workloads-NonHIPAA OU; migrate website out of `development`; apply pixel-isolation SCP                                        | quilty-aws            |

---

## Launch readiness checklist

To land before public launch:

### Infrastructure

- [ ] All M1-M8 complete
- [ ] Production SES access granted
- [ ] Cognito custom domain `auth.my-quilty.com` live
- [ ] MTA-STS HTTPS endpoint live
- [ ] CSP enforce mode (not report-only)
- [ ] WAF rules tuned based on staging traffic patterns
- [ ] Backup + DR procedures documented
- [ ] Monitoring + alerting baselines tuned
- [ ] Phase 1 account migration triggered (or scheduled)

### Legal / Compliance

- [ ] Lawyer sign-off on Privacy Policy + ToS + NPP + Refund Policy
- [ ] BAA with relevant vendors (Stripe if applicable, **Amplitude Enterprise** for analytics web + mobile per the 2026-05-19 pivot, Sentry Business tier)
- [ ] Cookie consent flow tested across EU + CA traffic
- [ ] GPC honoring verified
- [ ] Accessibility manual audit complete (TPGi or Deque)
- [ ] HIPAA NPP posted + linked prominently
- [ ] CCPA "Your Privacy Choices" link in footer + relevant pages
- [ ] CPRA "Limit Use of Sensitive PI" link (vaping cessation behavioral data = sensitive PI under CCPA/CPRA + CMIA AB-2089 SUD inclusion)
- [ ] WA MHMDA opt-in consent UI + separate sharing consent + standalone sale authorization (private right of action up to $25k treble; first lawsuit Feb 2025)
- [ ] MD MODPA "strictly necessary" data minimization review (effective Oct 1 2025; sale of sensitive data prohibited even with consent)
- [ ] Marketing-copy review gate per ADR-0023: NO use of `digital therapeutic` / `DTx` / `prescription` / `FDA-cleared` / `clinically proven` (without RCT citation) / `medical-grade` / `treat` / `cure` / `diagnose` / `addiction recovery` / `wellness app` / `quit smoking app`
- [ ] Geofencing audit: no ad-buy targets within 2,000 ft of any in-person healthcare provider per WA MHMDA + adjacent state laws
- [ ] FTC Health Breach Notification Rule (HBNR) procedures documented

### External integrations

- [ ] Apple Developer Program org enrollment complete (uses real website)
- [ ] Apple App Store submission ready (privacy URL, support URL, marketing URL all resolve)
- [ ] Google Play submission ready (data deletion URL matches across in-app + Play Console + website)
- [ ] Google OAuth verification complete (homepage + privacy + ToS verified)
- [ ] Stripe full activation (website checklist 16 items)
- [ ] BAA negotiations complete where applicable

### Product

- [ ] Real content (not placeholder) across all marketing pages
- [ ] Brand voice + visual identity locked
- [ ] All portal screens have real data flows
- [ ] Subscription end-to-end tested in test mode
- [ ] Sentry replay masking verified on all PII-bearing screens
- [ ] Amplitude event taxonomy defined + instrumented for launch funnels (web + mobile share the same `user_id` from the Rust backend per the 2026-05-19 pivot)

---

## Things explicitly NOT being done at this stage

To stay honest about scope:

- Hosted help center (Zendesk/Intercom) — M9+
- Blog — M9+ unless content strategy demands earlier
- Internationalization activation — route segment reserved (D14), translations defer
- Headless CMS migration — MDX in repo until non-engineers need to publish (D30)
- Storybook setup — defer past ~50 components
- Style Dictionary / `@quilty/tokens` extraction — defer until Flutter app needs token parity
- Sitewide search — Pagefind when >50 pages, Algolia at scale
- Smart app banners — meta tags, trivial later
- A/B testing platform — need traffic first
- Multi-region failover — Phase 2+
- OU restructure in AWS Org — Phase 1+ trigger
- `lambdas/` extraction from `quilty-aws` — post-launch trigger
- Corp-IT repo merge (entra + m365 + 1password) — defer indefinitely until awkward
- Backstage / OpsLevel IDP — wait for engineer #8-10
- Track A sync backend integration — only when sync is part of web product (likely never for pure marketing+portal site)

---

## Working patterns (TBD — to be filled in as we develop them)

User flagged: "we need to strategize before we automate and etc so we don't make stupid mistakes."

**Patterns to formalize after we have lived experience:**

- **Drive cadence:** when does Claude drive autonomously vs pair vs you-driven? (Default: autonomous for technical scaffold, mixed for design, you-driven for content + voice)
- **Push authorization:** push per milestone (matches AWS work) vs push per feature?
- **PR + review:** how thoroughly do you review autonomous changes? Broad-trust or per-line?
- **Testing posture:** when do we TDD, when do we test-after, when do we skip?
- **Deploy cadence:** every commit → staging? Per-milestone → production?
- **QA loop:** 3-agent QA loops (matching W2-B.3) after autonomous milestones, or different pattern?
- **Decision logging:** ADRs in repo for non-trivial choices? Inline comments? Memory updates?
- **Coordination with AWS work:** alternating sessions? Concurrent? When website needs auth integration coordination, how do we sync?

**Don't formalize these now.** Discover through M1-M2 work, then write them down once we have signal.

---

## Decision quick-reference (D1-D49 + Round-5 revisions + D50-D69 + U1-U8)

Full text in `website_strategy_discussion.md`. This is the one-line summary for quick recall. Round-5 revisions marked with **R5**.

| #            | Decision            | One-line summary                                                                                                                                                                                   |
| ------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1           | Framework           | Next.js 16 App Router + TypeScript                                                                                                                                                                 |
| D2 **R5**    | Deploy              | **SST 4.x (Ion + Pulumi + OpenNext) on AWS, pinned `^4.14`**                                                                                                                                       |
| D3           | App layout          | Single Next.js app for marketing + `/account/*` portal                                                                                                                                             |
| D4           | Monorepo            | Turborepo + pnpm; apps/web + packages/shared-types _(per D69, no packages/ui at M1)_                                                                                                               |
| D5           | BFF                 | Next.js Route Handlers (TS Lambda) — Option A locked                                                                                                                                               |
| D6 **R5**    | Auth boundary       | **Cognito Managed Login** (Nov 2024 redesign — supersedes classic Hosted UI) at auth.my-quilty.com                                                                                                 |
| D7           | Cookie scope        | `__Host-` prefix, per-subdomain (NOT parent-domain shared)                                                                                                                                         |
| D8           | SameSite            | Lax                                                                                                                                                                                                |
| D9 **R5**    | Logout              | **Cognito-native** front-channel `/logout` + `AdminUserGlobalSignOut` + BFF opaque session-ID + EventBridge fan-out (Cognito does NOT support OIDC BCL or emit `sid`)                              |
| D10          | CSRF                | Signed double-submit + custom header                                                                                                                                                               |
| D11 **R5**   | Mobile-web          | Independent sessions joined by `cognito_sub` + locally-minted `quilty_sid` + EventBridge revocation                                                                                                |
| D12          | Domain              | my-quilty.com same-origin marketing + portal; subdomains carved out                                                                                                                                |
| D13          | URL                 | trailingSlash: false                                                                                                                                                                               |
| D14          | Locale              | `/[locale]/` route segment reserved, EN-only at launch                                                                                                                                             |
| D15          | Permalinks          | /blog/<slug>, /account/\*                                                                                                                                                                          |
| D16          | Redirects           | Versioned artifact in next.config.js                                                                                                                                                               |
| D17 **R5**   | Styling             | **Tailwind v4 CSS-first `@theme` in globals.css (no `tailwind.config.ts`)** + 3-layer tokens                                                                                                       |
| D18          | Components          | shadcn in components/ui/ + wrap-don't-edit                                                                                                                                                         |
| D19          | Icons               | Lucide                                                                                                                                                                                             |
| D20          | Theme               | Dark-mode-ready CSS variables (ship later)                                                                                                                                                         |
| D21          | Perf                | next/font + next/image discipline                                                                                                                                                                  |
| D22          | A11y                | axe-core in CI + jsx-a11y ESLint                                                                                                                                                                   |
| D23          | WCAG                | 2.2 AA target                                                                                                                                                                                      |
| D24          | Content             | Pages as typed block arrays                                                                                                                                                                        |
| D25          | i18n                | next-intl                                                                                                                                                                                          |
| D26          | Metadata            | metadataBase + canonical (self-ref `'./'`) + sitemap.ts + robots.ts                                                                                                                                |
| D27 **R5**   | Schema              | Organization + SoftwareApplication + WebSite + BreadcrumbList (SERP); MedicalWebPage on /science + FAQPage for AI-overview citations only (Google retired FAQPage rich-result 2026-05-07)          |
| D28          | RUM                 | INP/LCP/CLS tracking from day one                                                                                                                                                                  |
| D29          | Blocks              | Hero + ValueProp + FeatureGrid + FAQ + TestimonialQuote + CTABanner                                                                                                                                |
| D30          | CMS                 | MDX in repo (Velite + Zod per D64) → migrate to Sanity Enterprise at trigger                                                                                                                       |
| D31          | PHI                 | Zero-PHI website                                                                                                                                                                                   |
| D32          | CSP                 | Nonce + strict-dynamic (two-tier per D59)                                                                                                                                                          |
| D33          | Headers             | HSTS preload + frame-ancestors + Permissions-Policy default-deny _(extended by D58)_                                                                                                               |
| D34 **R5**   | SRI                 | **First-party `_next/static/*` only; Stripe.js + analytics rely on nonce + strict-dynamic + CSP reporting (PCI DSS 4.0 §11.6.1 compensating control). Stripe explicitly publishes no SRI hashes.** |
| D35          | Consent             | Server-side ConsentState + GPC honoring + SDK-load-gated                                                                                                                                           |
| D36          | SBOM                | CycloneDX in CI + lockfile pinning + Renovate (with 72h minimumReleaseAge) — Renovate replaces Dependabot per Round-5 audit                                                                        |
| D37          | WAF                 | CloudFront managed rules + Turnstile on auth/signup                                                                                                                                                |
| D38          | Tracing             | W3C traceparent → x_trace_id propagation (OTel-first per D56)                                                                                                                                      |
| D39          | Audit               | Web hits same /v1/\* endpoints with `channel:"web"` tag                                                                                                                                            |
| D40          | Replay              | Session replay mask-all default (concrete vendor pick D68)                                                                                                                                         |
| D41          | Flags               | Server-side eval with local cache                                                                                                                                                                  |
| D42a         | Errors+RUM          | Sentry Business tier day-one + `logError()` adapter                                                                                                                                                |
| D42b **R5+** | Web analytics       | **Amplitude all-in (web + mobile)** per 2026-05-19 pivot. Start without BAA; upgrade to Amplitude Enterprise pre-launch when PHI risk becomes real.                                                |
| D42c **R5+** | Replay              | **Resolved by D68** — Sentry replay only (error-triggered, mask-all + block-class on clinical controls). Amplitude Session Replay is REJECTED per Round-5 attribute-leak finding.                  |
| D42d         | Server logs         | CloudWatch + structured JSON + PHI sanitizer (D67)                                                                                                                                                 |
| D43 **R5+**  | Flag tool           | Typed env-var `features.ts` day-one → **Amplitude Experiment at trigger** per 2026-05-19 pivot (same vendor as analytics; zero new infra; was PostHog flags / GrowthBook).                         |
| D44          | Subscription        | Stripe + Stripe Customer Portal + Apple Pay (Payment Request API) + Sign in with Apple (Cognito IdP federation); **no RevenueCat IAP wrapper** for web checkout per Round 6 mobile-stack recon.    |
| D45          | Public domain       | my-quilty.com (NOT .app)                                                                                                                                                                           |
| D46          | Repo                | Rebuilt quilty-website monorepo, separate from quilty-aws                                                                                                                                          |
| D47          | Phase 0 account     | Existing `development` account ($0 incremental)                                                                                                                                                    |
| D48          | Backend lang        | Permanently Rust (TS Track A closed)                                                                                                                                                               |
| D49          | Other restructuring | All deferred to Phase 1+ triggers (D69 overrides for `packages/ui`)                                                                                                                                |
| **D50**      | Cognito tier        | Essentials at M1; Plus at M6 (passkeys + adaptive auth)                                                                                                                                            |
| **D51**      | Session store       | Opaque session-ID cookie + DynamoDB store (NOT iron-session sealed cookie)                                                                                                                         |
| **D52**      | Token TTLs          | Access 5 min; refresh 8h; rotation via `GetTokensFromRefreshToken`                                                                                                                                 |
| **D53**      | CSRF triple         | Origin/Referer + signed double-submit + `X-Quilty-CSRF` header                                                                                                                                     |
| **D54**      | Step-up auth        | `prompt=login` + server `elevated_until` (5-min window)                                                                                                                                            |
| **D55**      | Backup codes        | In-app (Argon2id + DynamoDB), not in Cognito                                                                                                                                                       |
| **D56**      | OTel-first          | OTel owned by the Sentry SDK (`@sentry/nextjs` v10) + W3C tracecontext+baggage propagators day-one (_revised — `@vercel/otel` removed_)                                                            |
| **D57**      | Trusted Types       | `require-trusted-types-for 'script'` report-only at M1                                                                                                                                             |
| **D58**      | Headers ext.        | COOP same-origin-allow-popups + CORP same-origin + X-Content-Type-Options nosniff                                                                                                                  |
| **D59**      | Two-tier CSP        | Marketing static+hashed / portal nonce+strict-dynamic (per-route branching in `proxy.ts`)                                                                                                          |
| **D60**      | HSTS ramp           | M1 max-age=300 → ramp to 2y + preload at M8 launch gate (submission irreversible)                                                                                                                  |
| **D61**      | CSP sink            | Sentry CSP endpoint via report-uri                                                                                                                                                                 |
| **D62**      | GPC indicator       | `<GpcHonoredIndicator>` per CCPA §7025(c)(6) effective 2026-01-01                                                                                                                                  |
| **D63**      | ConsentState        | Server-side DynamoDB (encrypted) + Sec-GPC at CloudFront edge                                                                                                                                      |
| **D64**      | Content layer       | Velite + Zod-validated MDX frontmatter from M1; CMS pick = Sanity Enterprise at trigger                                                                                                            |
| **D65**      | Block library       | Typed discriminated-union → single `<BlockRenderer>`                                                                                                                                               |
| **D66**      | AI crawlers         | Block training (GPTBot/ClaudeBot/Google-Extended/Applebot-Extended/CCBot/Meta-ExternalAgent/Bytespider); allow citation (OAI-SearchBot/Claude-SearchBot/PerplexityBot)                             |
| **D67**      | PHI sanitizer       | `lib/observability/sanitize.ts` + `assertNoPHI()` + ESLint no-console + ban direct vendor-SDK imports                                                                                              |
| **D68**      | Replay vendors      | Sentry error-triggered only (per 2026-05-19 Amplitude pivot — PostHog replay dropped; Amplitude Session Replay REJECTED). `block`-class on every clinical control.                                 |
| **D69**      | packages/ui         | Drop from M1 scaffold; recreate at first real extraction trigger (overrides D49 for that workspace)                                                                                                |
| **U1**       | Portal nav          | Hybrid top-nav primary + sidebar at complex sub-screens                                                                                                                                            |
| **U2**       | Reserved routes     | /science, /for-business, /customers (NOT /careers at M1)                                                                                                                                           |
| **U3**       | Help center         | Reserve both /help path + help.my-quilty.com subdomain                                                                                                                                             |
| **U4**       | Crawlers            | Per D66                                                                                                                                                                                            |
| **U5**       | Cognito domain      | Flip enable_custom_domain at M1 cutover (next sprint in quilty-aws/auth/)                                                                                                                          |
| **U6**       | DNS dance           | Manual PR-coordinated (one ceremony at cutover)                                                                                                                                                    |
| **U7**       | Web Cognito client  | Confidential (client_secret in SSM)                                                                                                                                                                |
| **U8**       | Web analytics       | Per D42b — **Amplitude all-in (web + mobile)** per 2026-05-19 pivot (was PostHog Cloud Boost under Round-5 lock).                                                                                  |

---

## Open questions remaining

Genuinely unresolved (won't block M1):

1. **Q1 — Voice + positioning** — discovered through M3 iteration
2. **Q4 — Account portal v1 final scope** — refined at M5
3. **Q6 — Visual identity beyond Tailwind baseline** — discovered through M3
4. ~~D42c — Session replay vendor~~ — **Resolved Round 5 by D68 + revised 2026-05-19 Amplitude pivot** (Sentry replay error-triggered only; PostHog replay dropped; Amplitude Session Replay REJECTED)
5. ~~D43-upgrade — Feature flag tool trigger~~ — **Vendor resolved by D43 + revised 2026-05-19 Amplitude pivot** (Amplitude Experiment at trigger; same vendor as analytics, zero new infra); trigger conditions unchanged (runtime toggle / non-dev flipping / A/B testing)
6. **D44 — Subscription provider exact config** — closer to launch
7. **Working patterns (above)** — discovered through M1-M2 lived experience

---

## Trigger watchlist (future migrations queued)

Things we've explicitly deferred with concrete triggers:

| Trigger                                                      | Action                                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Public launch or first revenue                               | Vend `marketing-prod` AWS account; migrate website out of `development`; apply pixel-isolation SCP; flip Phase 0 → Phase 1 |
| Engineer #2 joins                                            | Wire Entra → AWS IAM Identity Center (SAML+SCIM); revisit drive patterns                                                   |
| ~$500K ARR or 5 engineers                                    | Consider splitting auth-prod from foundation/api-prod                                                                      |
| ~$2M ARR or 10 engineers + 2nd VPC                           | Add `network` account + Transit Gateway                                                                                    |
| ~50 components                                               | Consider Storybook                                                                                                         |
| Non-engineering author needs to publish                      | Migrate MDX → Sanity/Contentful                                                                                            |
| Second product surface in monorepo OR first shared primitive | **Create `packages/ui` workspace** (not scaffolded at M1 per D69) and extract first shared primitive into it               |
| `lambdas/` polyglot CI gets awkward                          | Extract `lambdas/rust/` → new `quilty-rust` repo                                                                           |
| Engineer #8-10                                               | Evaluate OpsLevel or Port (skip Backstage)                                                                                 |
| >50 indexable pages                                          | Add Pagefind search; later Algolia                                                                                         |
| 10k weekly visitors                                          | Activate A/B testing via Amplitude Experiment (same vendor as analytics per D42b/D43 _2026-05-19 Amplitude pivot_)         |
| First EU launch                                              | Manual a11y audit + EAA conformance verification                                                                           |

---

## Update log

- **2026-05-14** — Workflow doc created after 4 rounds of strategy discussion + 11 research agents across rounds. M1 ready to begin pending user authorization to start implementation work. Cross-account Pattern A locked. All D1-D49 captured. Open questions catalogued. Trigger watchlist populated.
- **2026-05-17 (Round 5 — Independent Architecture Audit)** — 9-agent independent review landed (6 online enterprise-pattern + 3 codebase/docs; no project context; 2025-2026 sources only; "what would Discord/Stripe/Linear/Cal.com/PostHog do" lens). Full audit archived at `docs/research/round_5_independent_review/` (11 files). **M1 deliverable list materially rewritten** to reflect: SST 3.x → 4.x (active mid-May 2026 release cadence verified); drop `tailwind.config.ts` (Tailwind v4 CSS-first `@theme` in `globals.css`); drop empty `packages/ui` (D69 override of D49 for that workspace); add `proxy.ts` not `middleware.ts` (Next.js 16 file-convention rename); add Velite + Zod content layer (D64); add typed block discriminated-union via `<BlockRenderer>` (D65); add `instrumentation.ts` + Sentry+OTel adapters + PHI sanitizer + `assertNoPHI` + ESLint custom rules (D67); add Trusted Types report-only header (D57); add COOP/CORP/nosniff to security headers (D58); add two-tier CSP per-route in `proxy.ts` (D59); add Sentry as CSP report-uri sink (D61); add HSTS preload ramp deferred to M8 launch gate (D60); add CCPA §7025(c)(6) `<GpcHonoredIndicator>` (D62); add server-side ConsentState in DynamoDB (D63); add AI crawler policy (D66 + U4); reserve /science + /for-business + /customers + /help routes (U2 + U3); hybrid top-nav portal layout (U1); ADR scaffold + 0001-0006; `docs/runbook/` for M1-post-scaffold checklist (harness gap patch instructions, `pnpm exec husky/turbo` allowlist additions, CURRENT_PHASE bump). **M6 deliverables rewritten** to reflect D9 (no OIDC BCL — Cognito-native + EventBridge fan-out + opaque session-ID + DynamoDB session store + 501-stub at `/api/auth/backchannel-logout` reserved for the day Cognito ships it). **Vendor swaps**: drop Amplitude from web tier → PostHog Cloud Boost (D42b — Amplitude HIPAA BAA Enterprise-only + HTML-attribute-leak in Session Replay); drop GrowthBook self-hosted → PostHog flags at trigger (D43 — zero new infra). **Dependency mgmt**: Dependabot dropped in favor of Renovate exclusively (D36 — 72h `minimumReleaseAge` + monorepo grouping). **Schema.org expectations reset** (D27 — FAQPage Google rich-result retired 2026-05-07; MedicalWebPage not Google-rich-result-supported; both still emitted for AI-overview citation graphs in ChatGPT/Claude/Perplexity). **Harness gap discovered**: `guard-bash.sh` blocks `sst remove --stage <non-prod>` killing `/sst-destroy-previews` skill; patch documented in `docs/runbook/m1_post_scaffold_checklist.md` for user manual application (Claude can't edit `.claude/hooks/`). **8 UX/sequencing locks** (U1-U8) answered by user. Quick-reference table regenerated with R5 markers. All M9+ / cross-cutting / launch-readiness sections scrubbed of stale Amplitude / GrowthBook / Stripe.js-SRI references. M1 plan now executes in 12 commits with per-commit 3-agent QA loop + final 6-agent QA sweep + Playwright MCP browser smoke test.
- **2026-06-03 (post-M1.6 strategy + cross-repo auth recon → execution sequencing locked)** — Two strategy sessions: (1) full-repo + enterprise-architecture review (grade A−/B+ benchmarked against FAANG/top-SaaS — A-grade security/compliance/platform spine on a pre-launch product; gaps are "not built yet," not "built wrong"); (2) cross-repo auth-readiness recon (5 agents over `quilty-aws`) + a structured 3-round decision pass. **Key finding:** the server is rich and production-live (79-endpoint Rust auth, Cognito Plus, W3-F federation substrate deployed to prod 2026-06-03), but the website-specific seams are not yet ready — so **website auth cannot be built end-to-end yet, and the deploy is the critical path** the server is waiting on. **AWS infra PARKED:** account structure is in active talks with the AWS team (possible dedicated website account / shared-services tier); `website-baseline` Terraform, SES/WAF ownership, and the first deploy all wait on that outcome. **Execution sequencing locked:** (a) **in-repo hardening first (~3–7 days), new UI held until M3 identity locks** — one batched PR: OpenAPI codegen for the current spec + real Sentry project/DSN + Amplitude key consent-gated/OFF + repo fixes (incl. the `deploy.yml` bug where `QUILTY_PSEUDONYM_PEPPER` is never passed to either job's `env:`) + fail-closed prod guards on the in-memory rate-limiter + consent store; (b) **meanwhile the server team decides the AWS account structure**; (c) **then deployment + the server's deliverables** (`website-baseline` → first deploy → DNS Pattern-A ceremony → `auth.my-quilty.com` custom-domain flip → BFF auth-callback at M5). **Entity formation is not a near-term priority** (an existing LLC covers near-term contracting; C-Corp matters mainly for VC/QSBS/equity). **Server reverse-contract landed:** `docs/runbook/federation-handoff-from-quilty-aws-2026-06-03.md` (W3-F substrate handoff + the M5 BFF auth-callback spec + a "no shortcuts" addenda + **6 open questions owed back to the server**, tracked for a dedicated decision pass). New runbooks committed: `first-dev-deploy.md` (deploy ceremony) + `auth-integration-coordination.md` (the consolidated website⇄backend contract + ratified facts + execution sequencing). 2 ADRs committed: **0027 (zero-PHI runtime boundary / D31)** + **0028 (server-side ConsentState / D35)**. Full picture in `docs/runbook/auth-integration-coordination.md`.
- **2026-06-03 (M6 BFF auth-callback design locked — ADR-0029)** — The federation handoff's 6 open questions resolved (3 web-research agents + AskUserQuestion ratification) and captured in **ADR-0029 (BFF auth architecture)**: unified `/auth/*` namespace; transparent server-side refresh (no client route, single-flight); our-side identity picker (App Store §4.8 parity, shared web/iOS config); step-up `prompt=login` + **10-min** `elevated_until` (revises D54's 5-min); sensitive-action route gating (`/account/security|data|delete`) + payment-action gate + dynamic `requires_step_up`; thin anonymous→authenticated guest carrier now (promotion bridge deferred to M5/M6). These refine the **M6** BFF deliverables; the DynamoDB-backed pieces (`elevated_until`, `requires_step_up`, `guest_state`) stage as port + in-memory + fail-closed guard until AWS account placement lands. Next: confirm the `/auth/callback` path with the server (unblocks `web_bff` provisioning); the **in-repo hardening phase** — codegen + Sentry + Amplitude + repo fixes + fail-closed guards, plus ADR-0029's `/auth/*` relocation + thin guest carrier — is queued for a dedicated plan-mode session.
