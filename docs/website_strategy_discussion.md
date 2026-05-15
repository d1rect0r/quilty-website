# Quilty Website — Strategy Discussion Notes

> Living working document for scoping, deciding, and locking choices about the Quilty website.
> Discussion in progress. Decisions land in the **Decision Log** only after explicit lock.

---

## North Star

**Build a good website.** A first-class, long-term product surface for Quilty — not a "minimum viable to unblock SES / App Store / org account" checklist sprint. External-system onboarding clears automatically as a byproduct of doing this well; we do not optimize for the checklist.

**Implications:**
- Design for the next 2-3 years, not for week-1 launch.
- Quality bar = peer-set (Calm, Oura at MVP scale). NOT Headspace (years of dedicated web/SEO/B2B investment).
- Build the right structural seams early so v2/v3 don't require rebuilds.
- Pace ourselves: scope → direction → scaffold → small features → integrate auth → harden. No rushing.

---

## Process rules

- **Lock structural decisions** where multi-agent research converges (cheap to lock, expensive to retrofit).
- **Iterate feature decisions** through discovery (voice, polish, content shape).
- **No premature backend wiring.** Scaffold + small features against fake/local data first. Auth integration comes after UI shape stabilizes.
- **Lock decisions explicitly** in the Decision Log with rationale + date.
- **The current `quilty-website` scaffold is NOT load-bearing.** Replace as needed.

---

## Decision Log (LOCKED 2026-05-14)

Locked after 2-round research synthesis (Round 1: scope + regulatory + integrations; Round 2: 5-agent enterprise structural deep-dive — see `research/`).

### Framework + Deploy

| # | Decision | Rationale |
|---|---|---|
| D1 | **Next.js 16+ App Router + TypeScript** | Dominant 2025-2026 framework for consumer marketing + portal. Path to Duolingo/Headspace scale without rewrite. Best AI-assist coverage. App Router enables BFF pattern natively. |
| D2 | **SST (uses OpenNext under hood) on AWS** | Production-viable in 2026 (Gymshark/Udacity/NHS England in production). Maintains primitive control for HIPAA. Next.js 16.2 stable Adapter API. Avoid Amplify Hosting (loses primitive control, muddier HIPAA boundary). |
| D3 | **Single Next.js app for marketing AND `/account/*` portal** (NOT split into separate SPAs) | Same-app pays off at 1-founder scale (Formcake case study). Cheap to split later if portal becomes real-time SPA-shaped. Splitting later = days; unifying later = SEO debt for years. |
| D4 | **Turborepo + pnpm workspaces** with `apps/website` + `packages/ui` + `packages/shared-types` | Day-one structure. Shared TypeScript types between website and backend Lambdas (Track A). Nx and Bazel are TRAP at our scale. |
| D5 | **BFF pattern via Next.js Route Handlers** (no client→API GW direct) | IETF OAuth Browser-Based Apps BCP (Dec 2025) endorses BFF as default. PHI traverses server-side; retrofitting client-direct calls is a rewrite. Tokens never in browser. |

### Auth + Session

| # | Decision | Rationale |
|---|---|---|
| D6 | **Cognito Hosted UI at `auth.my-quilty.com`** | Isolated auth attack surface. WAF/threat-protection built-in. Supports passkeys + TOTP from W2-B.2. OAuth redirect contract is portable. Custom UI = premature differentiation. |
| D7 | **`__Host-` prefix on session cookies + OIDC code flow per subdomain** (REVISED from earlier "parent-domain `.my-quilty.com` cookies") | `__Host-` is browser-enforced binding; mutually exclusive with parent-domain cookies. OIDC-per-subdomain has narrower XSS blast radius and survives Safari ITP edge cases. Operationally slightly more complex; structurally much safer. |
| D8 | **SameSite=Lax** (not Strict) | Strict breaks consumer email-link-to-logged-in flow. Lax + double-submit CSRF = OWASP compliant. |
| D9 | **OIDC Backchannel Logout with `sid` claim** | Cognito supports it. Wire endpoint now even if "sign out everywhere" UX ships later — retrofitting `sid` plumbing is painful. |
| D10 | **Signed double-submit CSRF token + custom `X-Quilty-CSRF` header** at BFF | OWASP 2025-2026 still requires it; SameSite=Lax is defense-in-depth, not replacement. Cheap. |
| D11 | **Mobile-web sessions are independent**, joined by `sid`, propagated by backchannel logout. **NOT** OIDC Native SSO (token sharing) | Native SSO = enterprise SSO complexity, premature for our scale. |

### Domain + Routing

| # | Decision | Rationale |
|---|---|---|
| D12 | **`my-quilty.com` for marketing + `/account/*` portal**; subdomains: `auth.my-quilty.com` (Cognito), `help.my-quilty.com` (reserved for Zendesk/Intercom), `app.my-quilty.com` (reserved if web product surface ships) | Same Next.js app for marketing + portal; subdomains carve out auth and help with their own cookie/CSP scope. |
| D13 | **`trailingSlash: false`** in `next.config.js` | Lock once. Retrofitting = mass 301s + SEO loss. |
| D14 | **Locale routing: sub-path `/[locale]/`** — reserve route segment now, English-only at launch | Per Next.js issue #23419: non-default locale URL patterns "cost innumerable hours" to retrofit. Sub-path inherits root-domain SEO authority. Subdomain/ccTLD = TRAP for our scale. |
| D15 | **Permalink convention**: `/blog/<slug>` (industry default, even though no blog at launch); `/account/*` (closer to user mental model than `/dashboard/*`) | Lock now. Cheap. Painful to flip after indexing. |
| D16 | **Redirect table as versioned artifact** in `next.config.js` `redirects()` — load-bearing | 301 when authority should move; 410 when content gone; never blanket-301 to homepage (soft-404). |

### Styling + Design

| # | Decision | Rationale |
|---|---|---|
| D17 | **Tailwind CSS v4 + `@theme` with 3-layer token namespace** (primitive → semantic → component) | Every enterprise design system converged on 3-layer. Tailwind v4's `@theme` gives both utility class + CSS custom property. Name tokens now even if half empty. |
| D18 | **shadcn/ui components in `components/ui/` + wrap-don't-edit rule**; in-house components in `components/app/` | shadcn is code we own. Convention = no code cost; defers monorepo extraction. |
| D19 | **Lucide React icons** | 29M weekly downloads; tree-shakes per-icon; ~1KB per icon; integrates with shadcn defaults. |
| D20 | **Dark-mode-ready CSS variable architecture** (light tokens ship now; `[data-theme="dark"]` switch hook ready; dark theme rolls out later) | Retrofit cost of skipping = 2-3 months industry average. Architecture lock = O(1). |
| D21 | **`next/font` variable font + `next/image` priority/sizes discipline** from day one | 55% LCP / 57% INP / 93% CLS improvement when wired correctly. Irreversible if skipped. |

### Accessibility

| # | Decision | Rationale |
|---|---|---|
| D22 | **`@axe-core/playwright` in CI fail-on-violation** (WCAG 2.2 AA tags) + **`eslint-plugin-jsx-a11y`** in pre-commit | EAA enforces June 2025 in EU; HIPAA-aligned mental-health = asymmetric reputational risk. Automation catches ~57% (Deque's own figure). Budget manual audit pre-EU-launch. |
| D23 | **Target WCAG 2.2 AA**, NOT AAA | AA is the legal floor and industry ceiling for consumer. AAA = TRAP. |

### Content + i18n + SEO

| # | Decision | Rationale |
|---|---|---|
| D24 | **Pages as typed block arrays** (even in MDX): `page = { hero, valueProps[], faq[], cta }` | Ports cleanly to Sanity/Contentful when migration triggers. Free-form .mdx blob does not. |
| D25 | **next-intl** (App Router) — dominant 2026 choice | next-translate fading; Lingui has bundle-size edge but smaller ecosystem. |
| D26 | **Metadata baseline**: `metadataBase` in root layout, per-route `generateMetadata`, absolute canonical URLs, `app/sitemap.ts` + `app/robots.ts` at launch | 30 min of work; gate to indexing. |
| D27 | **Schema.org baseline**: `MedicalWebPage` for any clinical content + `Organization` + `SoftwareApplication` + `FAQPage`; include `lastReviewed` + `reviewedBy` on clinical content | AI-search citation rates rising 78-94% for sites with connected schema graphs. HIPAA-credibility + E-E-A-T signal. |
| D28 | **RUM tracking INP/LCP/CLS from day one** | INP replaced FID March 2024. Threshold ≤200ms p75. Can't fix what you don't measure. |
| D29 | **Marketing-page block library**: Hero, ValueProp, FeatureGrid, FAQ, TestimonialQuote, CTABanner | Non-engineer can compose new landing page later. Same shape as D24. |
| D30 | **MDX in repo initially**; migrate to Sanity (field-level i18n) or Contentful when content volume + non-engineering authors justify | Migration triggered by need, not premature complexity. CMS day-one = TRAP. |

### Security + Compliance

| # | Decision | Rationale |
|---|---|---|
| D31 | **Zero-PHI website**: marketing + sign-in + account-management surfaces only; PHI stays mobile + sync | Collapses threat surface. Critical anti-OCR control given Cerebral/Monument precedent. |
| D32 | **CSP nonce + strict-dynamic** plumbing from day one (report-only initially → enforce when clean) | Web Almanac 2025: CSP is the single most retrofit-hostile header (21.9% adoption, only ~10% strict-dynamic). Build inline-script discipline into framework choice. |
| D33 | **Security headers baseline**: HSTS preload, frame-ancestors deny, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy default-deny `camera`/`microphone`/`geolocation` | One-line ops, large structural protection. |
| D34 | **SRI on third-party scripts** (Stripe.js + 2-3 analytics scripts) — NOT blanket SRI | Real-world SRI median 2.82% per page; selective coverage is correct. |
| D35 | **Server-side ConsentState single source of truth**; SDK-load gated by consent; GPC `Sec-GPC` honored at edge | Cerebral $7M + Monument ban + $100M+ pixel-tracking penalties = consent-gating is the load-bearing control. Banner UI is cosmetic. |
| D36 | **CycloneDX SBOM generation in CI** (mirrors backend Trivy/checkov) + Dependabot + lockfile pinning | Same Sigstore signing seam as backend. |
| D37 | **CloudFront WAF managed rules + Cloudflare Turnstile** on auth/signup forms | Free, privacy-friendly. Custom rate limits = ADDITIVE post-launch. |

### Observability + Audit

| # | Decision | Rationale |
|---|---|---|
| D38 | **W3C traceparent → x_trace_id propagation** (browser → CloudFront → API Gateway → Lambda) | Web spans land in same trace as backend. Structural lock. |
| D39 | **Web mutations use the same `/v1/*` endpoints as mobile** with traceparent + Idempotency-Key + `channel: "web"` tag at API gateway boundary | DDB Streams → Firehose → S3 Object Lock audit pipeline already exists; web is just another client. Do NOT build a web-specific audit sink. |
| D40 | **Session replay default mask-all, allowlist non-PHI elements only**; document in BAA scope | Mental-health site = high sensitivity. |
| D42a | **Sentry Business tier for errors + Core Web Vitals (RUM)** day-one + thin `logError()` abstraction module | Best-in-class error monitoring, lowest friction, BAA-eligible at ~$26-80/mo. Will actually get used. |
| D42b | **Amplitude for product analytics** (pre-launch / Milestone 7-8) + thin `track()` abstraction module | Mobile already on Amplitude; cross-platform consolidation dominates per-platform feature comparison. Single source of truth for product decisions. Industry standard for consumer-health (Headspace, Calm). |
| D42c | **Session replay decision deferred to pre-launch** — Amplitude Session Replay (consolidate) vs FullStory/LogRocket (specialist) | Amplitude Session Replay matures over time; real debug needs at pre-launch inform the call. |
| D42d | **CloudWatch for server-side logs** | Already in our AWS substrate; free; integrates with existing observability. |

### Feature Flags

| # | Decision | Rationale |
|---|---|---|
| D41 | **Server-side feature flag evaluation with local cache** (SSR-evaluated flags, NOT client-only) | LaunchDarkly Oct 2025 outage lesson: server-side + local cache survives vendor outages. Client-only flags = TRAP. |
| D43 | **Typed `features.ts` env-var module day-one; GrowthBook self-hosted at trigger point** | No tool needed until runtime-toggle pain is real (need toggle without redeploy OR non-dev flipping flags OR real A/B testing). GrowthBook keeps flags purpose-built and in our AWS; integrates with Amplitude for experimentation (GrowthBook fires variant-assignment events → Amplitude measures outcomes). |

### Domain

| # | Decision | Rationale |
|---|---|---|
| D45 | **`my-quilty.com` is the public website domain.** `my-quilty.app` is reserved for internal use. `my-quilty.net` held in reserve. Same-origin marketing + `/account/*` portal on `my-quilty.com`; subdomains `auth.my-quilty.com` (Cognito Hosted UI), `help.my-quilty.com` (reserved for hosted help center), `app.my-quilty.com` (reserved if web product surface ever ships). | Public-facing TLD choice. Earlier discussion tentatively used `quilty.app`; user clarified actual owned domains are `my-quilty.{com,app,net}` and the `.com` is the public domain by design. All prior decisions referencing the public domain (D6, D7, D12) have been updated accordingly. |

### Repo + Account Placement (Phase 0)

| # | Decision | Rationale |
|---|---|---|
| D46 | **Website lives in rebuilt `quilty-website` repo, separate from `quilty-aws`.** Scaffold overwritten as Next.js + SST monorepo (`apps/web`, `packages/ui`, `packages/shared-types`). | Round-3 enterprise research (see `research/`): polyrepo regret is universal when splits precede org friction, but the website's change rate (fast, marketing-driven) + audit scope (zero-PHI) + framework toolchain (Next.js/SST) are sufficiently different from `quilty-aws` (slow IaC + Rust backend) that co-locating creates ongoing friction. Separate repo from day one. |
| D47 | **Phase 0 AWS account placement: existing `development` account** (currently empty, baselined). No new AWS accounts created. Zero incremental cost. SST deploys into `development`; Terraform writes website-needed inputs to SSM Parameter Store in the same account. | User pushback on creating `web-prod`/`web-nonprod` pre-revenue: "$100+/mo on extra accounts when paying basically for nothing." `development` is empty and baselined; it's the right Phase 0 home. The SST↔Terraform contract (D3 boundary, SSM Parameter Store) preserves the migration seam — Phase 1 cutover to `marketing-prod` becomes an account-ID change, not a re-architecture. |
| D48 | **Backend is permanently Rust.** TypeScript Track A backend path is closed; the team explicitly migrated off TS in favor of Rust (performance + correctness). The `pnpm-workspace.yaml` + `tsconfig.base.json` inside `quilty-aws/lambdas/` is dead scaffolding — cleanup deferred but tracked. Cross-language contract is **OpenAPI exported from Rust backend** → consumed by Dart (Flutter mobile) + TypeScript (website only TS surface). Type sharing flows one direction: backend → consumers. | User confirmed 2026-05-14. Resolves the "should backend + website share a TS monorepo" tension definitively — backend will never be TS, so the cross-repo contract is OpenAPI, not workspace deps. Affects every prior decision that referenced "future TS Track A backend." |
| D49 | **All other restructuring deferred to Phase 1 (post-launch/revenue triggers).** No OU restructure, no `lambdas/` extraction, no `quilty-contracts` repo creation, no `quilty-workflows` repo, no corp-IT merge (`quilty-entra` + `quilty-m365` + `quilty-1password` stay separate), no Renovate centralized config, no `services.yaml` manifest **right now**. | User framing: "everything else stay as is for now, we will work on extracting [later]." Minimal-moves principle: focus on website, don't pre-emptively reshape the rest of the system. Target end-state is documented (see Update log + research files) so we don't lose direction; concrete triggers (launch, revenue, engineer #2) will fire each migration when warranted. |

---

## Decisions deferred (will lock closer to relevant milestone)

| # | Decision | Options | When to lock |
|---|---|---|---|
| D42c | **Session replay vendor** (within D42 stack) | (a) Amplitude Session Replay (single-vendor consolidation), (b) FullStory or LogRocket (specialist, separate vendor) | Pre-launch (Milestone 7-8), informed by real debug needs |
| D43-upgrade | **Feature flag tool trigger** (when env-var module no longer sufficient) | GrowthBook self-hosted (direction locked in D43); confirm at trigger | Trigger-based (runtime toggle need, non-dev flag flipping, or real A/B testing) |
| D44 | **Subscription provider config** | Stripe + Stripe Customer Portal + RevenueCat for IAP unification (baseline locked); exact Billing setup TBD | Closer to launch (Milestone 7) |

---

## Open questions (require discovery / iteration, not lockable in the abstract)

| # | Question | Notes |
|---|---|---|
| Q1 | What's the website's voice + positioning? | Discovered through writing 3 hero variants, not abstract analysis |
| Q4 | Account portal v1 scope (which screens at v1 vs v2) | Work backwards from Stripe Customer Portal coverage |
| Q6 | Visual identity specifics (typography, color palette) | Discovered through iteration with locked tokens architecture (D17) |

---

## What we're explicitly NOT deciding now (and why)

- Backend wiring details — defer until scaffold + few features exist
- Cognito Hosted UI integration code — defer until account-portal screens exist as static mockups
- Help-center content authorship — defer until help platform chosen (Zendesk vs Intercom is ADDITIVE)
- Real legal copy — placeholders during dev; lawyer-reviewed pre-launch
- Internationalization activation — route segment reserved (D14), translations deferred
- Storybook setup — defer past ~50 components
- Style Dictionary + `@quilty/tokens` extraction — defer until Flutter app needs token parity
- CMS migration (D30) — triggered by need, not date

---

## Differentiators worth designing for (from Round 1 research)

1. **Self-serve data export + account deletion in-portal** — Headspace forces email-support, does not scale; HIPAA-aligned + GDPR-Art-20-ready.
2. **MFA management UI on web** — most peers ship email OTP only; we have passkeys + TOTP + backup codes from W2-B.2.
3. **Platform-aware IAP cancellation routing** — App Store / Play subscribers routed back with explicit copy. Universal must-have.

---

## Floor we have to clear (from Round 1 research)

Captured in `research/regulatory_requirements.md`. 16-item must-have list automatically clears as a byproduct of target quality.

---

## Reference library

### Round 1 (scope + regulatory + integrations)
- `research/consumer_health_patterns.md` — 10-company peer-set inspection
- `research/regulatory_requirements.md` — Apple / Google Play / GDPR / CCPA / Stripe / HIPAA forcing functions
- `research/external_integrations.md` — AWS SES / Apple Dev / Google OAuth / Stripe / BAA touchpoints

### Round 2 (enterprise structural decisions)
- `research/framework_deploy_architecture.md` — Framework / Next.js / SST/OpenNext / monorepo / BFF / URL conventions
- `research/auth_session_architecture.md` — BFF / cookies / Cognito / cross-subdomain / step-up / mobile-web parity
- `research/design_system_a11y.md` — Tailwind v4 / shadcn / tokens / a11y CI / fonts / Core Web Vitals
- `research/content_i18n_seo.md` — content blocks / next-intl / sitemap / schema.org / redirects
- `research/security_observability_compliance.md` — CSP / consent / RUM / audit pipeline / pixel-tracking enforcement / SBOM / WAF / feature flags

---

## Update log

- **2026-05-14 (round 1)** — Strategy doc created. Three research reports filed. Scope tentatively confirmed as Marketing + Account Portal + Subscription Management.
- **2026-05-14 (round 2)** — 5-agent enterprise structural deep-dive completed. **D1-D41 locked.** **Key revision: D7 — cookie scope changed from parent-domain `.my-quilty.com` to per-subdomain `__Host-` cookies with OIDC code flow per surface**, based on IETF OAuth BCP guidance + Safari ITP compatibility.
- **2026-05-14 (round 2 finalization)** — D42 split into four locked sub-decisions: **D42a Sentry** (errors+RUM, day-one), **D42b Amplitude** (analytics, pre-launch — matches mobile choice; cross-platform consolidation dominates), **D42c deferred to pre-launch** (session replay), **D42d CloudWatch** (server-side logs). **D43 locked**: typed `features.ts` env-var module day-one + GrowthBook self-hosted at trigger point. All D1-D43 now locked. Only D42c (session replay vendor), D43-upgrade (flag tool trigger), and D44 (subscription config) remain trigger-deferred.
- **2026-05-14 (domain lock)** — **D45 locked**: public website domain is `my-quilty.com`. Updated D6/D7/D12 and all subdomain references across the doc from prior tentative `quilty.app` to `my-quilty.com` (cookie scope, Cognito subdomain, help subdomain, optional app subdomain). `my-quilty.app` is now internal use; `my-quilty.net` reserved. **Round-3 research launched on remaining pre-scaffold gates: AWS account placement, SST↔Terraform boundary, and repo strategy** — user emphasized clean architecture over minimum effort.
- **2026-05-14 (round 4 — system-as-whole research + final pre-scaffold locks)** — Inspected current repo state on disk: `quilty-aws` is overloaded (11 TF layers, ~30 Rust crates, 119GB on disk, dead pnpm scaffolding). 8 active Quilty repos total. Launched 3 enterprise research agents on consumer-app + consumer-health architecture patterns (Duolingo, Headspace, Calm, Cal.com, PostHog, Block, etc.). **Key research findings:** HIPAA isolation is a runtime boundary (account/IAM/VPC), NOT a repo boundary; pre-emptive polyrepo splits are universally regretted (Block, Cash App, Storyblocks); OpenAPI is the canonical multi-language contract spine; Backstage/IDPs premature below 10 engineers. **Phase 0 locks:** D46 (website in separate rebuilt `quilty-website` repo), D47 (Phase 0 home = existing `development` account, $0 incremental cost; Phase 1 trigger = launch/revenue), D48 (backend permanently Rust — TS Track A path closed; OpenAPI as cross-language contract), D49 (all other restructuring deferred — OU split, lambdas extract, contracts repo, workflows repo, corp-IT merge ALL deferred to Phase 1+ with concrete triggers). **Target end-state** (12-24 months, ~10 engineers): ~7 repos (quilty mobile, quilty-rust, quilty-aws core IaC, quilty-web, quilty-contracts, quilty-corp-it merged) + ~12-14 AWS accounts (Security OU, Infrastructure OU, Workloads-HIPAA OU, Workloads-NonHIPAA OU). Documented but not built. **Pre-scaffold gates now CLEAR.** Next: Milestone 1 = Next.js + SST scaffold into `quilty-website` repo, SST deploy to `development` AWS account, DNS at `my-quilty.com`.
- **2026-05-14 (BFF runtime confirmation)** — Considered alternative architecture: Next.js static export + Rust BFF Lambda behind API Gateway (would have moved D5's BFF runtime from TS to Rust, joining existing `quilty-aws/lambdas/rust/` workspace). **Rejected after analysis showed the TS Lambda is a thin UI rendering layer (~5-15k LOC website-only) that does NOT touch the existing ~100k LOC Rust backend.** Track A's Rust migration was about backend correctness + performance for high-throughput services; the website Lambda is purely React-rendering + thin token-broker, where TS is the native runtime and Next.js ecosystem maturity (SSR, Server Components, Middleware, Image Optimization) justifies a small TS surface in the production runtime. **D5 stays as originally locked: BFF via Next.js Route Handlers (TS Lambda).** Rust backend remains completely untouched by the website work.
