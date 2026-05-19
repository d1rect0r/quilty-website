# Round 5 — Synthesis

> Cross-cutting findings consolidated from the 9-agent audit. This is the action
> matrix that drove the M1 plan: which decisions revise, which new decisions
> lock, which retrofit-hostile gaps were missed, and which UX questions needed
> human input.

---

## 1. Decision revisions to D1-D49

| #        | Old                                                      | Revised                                                                                                                                                                                                                                                                                                                                                                                                                     | Source                                                                |
| -------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **D2**   | "SST 3.x (OpenNext)"                                     | **SST 4.x** (Ion engine, Pulumi underneath), pin `^4.14`. The "maintenance mode" claim from external blog was incorrect — SST shipped 100+ commits in last 90 days, v4.14.1 released 2026-05-12                                                                                                                                                                                                                             | [02](02-monorepo-tooling.md), verified at github.com/sst/sst          |
| **D9**   | "OIDC Backchannel Logout with `sid` claim wired day-one" | Cognito does NOT support OIDC BCL nor emit `sid`. Replace with **front-channel `/logout` + `AdminUserGlobalSignOut` API + BFF-maintained opaque session-ID in DynamoDB + EventBridge fan-out** (`quilty.auth.sessions_revoked`) consumed by web BFF + Rust backend revocation cache. Reserve `/api/auth/backchannel-logout` for the day Cognito ships it.                                                                   | [04](04-auth-session-cognito.md), [09](09-cross-repo-coordination.md) |
| **D11**  | "Mobile-web sessions joined by `sid`"                    | **Independent sessions joined by `cognito_sub` + locally-minted `quilty_sid`** (not the OIDC spec claim, which Cognito does not emit). Cross-device sign-out via EventBridge.                                                                                                                                                                                                                                               | [04](04-auth-session-cognito.md)                                      |
| **D17**  | (roadmap M1 lists `tailwind.config.ts`)                  | **Tailwind v4 CSS-first `@theme` in `apps/web/app/globals.css`. NO `tailwind.config.ts`.** 3-layer token namespace (primitive → semantic → component). Roadmap drift fix.                                                                                                                                                                                                                                                   | [08](08-strategy-doc-audit.md)                                        |
| **D27**  | "FAQPage + MedicalWebPage in baseline"                   | Ship **Organization + SoftwareApplication + WebSite + BreadcrumbList** for SERP weight. Ship **MedicalWebPage** on `/science` with `lastReviewed`+`reviewedBy`. Ship **FAQPage** but understand: Google retired FAQPage rich-result eligibility **2026-05-07**. Both serve AI-overview citation graphs (ChatGPT/Claude/Perplexity), not SERP.                                                                               | [06](06-i18n-seo-content.md)                                          |
| **D34**  | "SRI on Stripe.js + 2-3 analytics scripts"               | **Stripe explicitly does not publish SRI hashes** for `js.stripe.com/v3/`. SRI applies only to first-party `_next/static/*` bundled at build time. Stripe + analytics rely on nonce + strict-dynamic + CSP reporting (Sentry sink) as the PCI DSS 4.0 §11.6.1 compensating control. Puppeteer-based synthetic tamper-detection at M7 when Stripe.js lands.                                                                  | [03](03-csp-security.md)                                              |
| **D42b** | "Amplitude for product analytics pre-launch (web)"       | **Drop Amplitude from web tier.** Web → **PostHog Cloud Boost ($250/mo)** for analytics + replay + flags + experiments under one BAA. Amplitude HIPAA BAA is Enterprise-tier-only ($20K-$100K+/yr) AND ships a documented HTML-attribute leak (`alt`, `title`, `placeholder`, `aria-label`, `value`, `data-*`) — unacceptable on a clinical surface. Mobile keeps Amplitude (separate contract, smaller attribute surface). | [05](05-observability-analytics-flags.md)                             |
| **D43**  | "GrowthBook self-hosted at trigger"                      | **PostHog flags at trigger** (same platform as analytics, zero new infra, same BAA, native A/B-on-flag). Typed `features.ts` env-var module stays day-one.                                                                                                                                                                                                                                                                  | [05](05-observability-analytics-flags.md)                             |
| **S3**   | "Node 22 LTS + pnpm 9"                                   | **Node 24 LTS + pnpm 10.** Node 22 enters Maintenance LTS on 2026-05-13 — wrong pin for a 2-3 year horizon.                                                                                                                                                                                                                                                                                                                 | [02](02-monorepo-tooling.md)                                          |
| **S4**   | "CSP nonce middleware at `apps/web/middleware.ts`"       | Next.js 16 renamed `middleware.ts` → **`proxy.ts`**. File at `apps/web/proxy.ts`. **Two-tier CSP** (per-route branching): marketing routes ship static+hash-pinned CSP (preserves CDN caching); portal routes ship nonce + strict-dynamic. Sentry as report-uri sink. Trusted Types `require-trusted-types-for 'script'` report-only at M1.                                                                                 | [03](03-csp-security.md), [10](10-harness-hooks-verification.md)      |
| **S5**   | "Husky + lint-staged"                                    | KEEP. ESLint flat + Prettier + Husky + lint-staged + jsx-a11y/strict. Add custom rules: `no-console`, `no-direct-vendor-sdk-imports-outside-lib-observability`. Biome considered but jsx-a11y rule coverage wins for our WCAG 2.2 AA target.                                                                                                                                                                                | [02](02-monorepo-tooling.md), [07](07-a11y-wcag-eaa.md)               |

---

## 2. New decisions to lock (D50-D69)

### Cognito + auth (D50-D55, from [04-auth-session-cognito.md](04-auth-session-cognito.md))

- **D50** Cognito Essentials tier at M1; Plus tier gate at M6 for passkeys + adaptive auth
- **D51** **Opaque session-ID cookie** (`__Host-quilty_sid`) + DynamoDB session store. NOT iron-session sealed cookie. Sealed cookies cannot instantly revoke; HIPAA-aligned site requires immediate "sign out everywhere" — load-bearing
- **D52** Access-token TTL 5 min; refresh-token TTL 8h; rotation enabled via `GetTokensFromRefreshToken`
- **D53** Per-subdomain `__Host-` cookies (confirms D7); SameSite=Lax (confirms D8); **CSRF triple-layer**: Origin/Referer check + signed double-submit token + custom `X-Quilty-CSRF` header
- **D54** Step-up auth via `prompt=login` + server-side `elevated_until` flag (5-min window). Cognito doesn't expose RFC 9470 step-up error semantics; this is the BFF polyfill
- **D55** Backup codes in-app (Argon2id-hashed + DynamoDB), not in Cognito

### Observability (D56, from [05-observability-analytics-flags.md](05-observability-analytics-flags.md))

- **D56** OpenTelemetry-first instrumentation via `@vercel/otel` + W3C `tracecontext`/`baggage` propagators day-one. Sentry's SDK is OTel-native under the hood; OTel-first costs zero today + future-proofs every vendor swap

### Security (D57-D61, from [03-csp-security.md](03-csp-security.md))

- **D57** Trusted Types `require-trusted-types-for 'script'` **report-only at M1**. Hit MDN Baseline Feb 2026; React 19 supports; prevents DOM XSS sinks
- **D58** Security headers baseline expands: `Cross-Origin-Opener-Policy: same-origin-allow-popups`, `Cross-Origin-Resource-Policy: same-origin`, `X-Content-Type-Options: nosniff` (alongside D33's existing list)
- **D59** **Two-tier CSP via per-route branching in `proxy.ts`**: marketing routes use static + hash-pinned (preserves CloudFront caching); portal routes use nonce + strict-dynamic. Nonce-everywhere kills marketing CDN caching; Stripe + Cal.com both branch by pathname
- **D60** HSTS preload submission deferred to **M8 launch gate** (irreversible). M1 ships `max-age=300` ramping over 4-8 weeks: 5min → 1day → 1week → 1year → 1year+includeSubDomains → 2years+preload
- **D61** CSP report sink = **Sentry's CSP endpoint** via `report-uri`. Already paid for in D42a; same triage workflow; no new infra

### Consent + privacy (D62-D63, from [03-csp-security.md](03-csp-security.md))

- **D62** GPC visible indicator: `<GpcHonoredIndicator>` component renders when `Sec-GPC: 1` was detected, per CCPA §7025(c)(6) effective **2026-01-01** (Disney $2.75M Feb 2026 + Ford $375K Mar 2026 enforcement)
- **D63** Server-side ConsentState in DynamoDB (encrypted at rest, per-user) + `Sec-GPC: 1` detection at CloudFront Function edge → forced opt-out cookie + DynamoDB row. Cerebral-lesson defense; client-only consent fails ITP and is bypass-able

### Content (D64-D65, from [06-i18n-seo-content.md](06-i18n-seo-content.md))

- **D64** Content layer = **Velite + Zod-validated MDX frontmatter from M1**. CMS pick when D30 triggers = Sanity Enterprise (BAA available; Portable Text matches typed-block discipline)
- **D65** Marketing block library = **typed discriminated-union** (`Hero | ValueProp | FeatureGrid | FAQ | TestimonialQuote | CTABanner`) rendered by single `<BlockRenderer>`. Maps cleanly to Sanity Portable Text + Contentful at trigger

### SEO + crawlers (D66, from [06-i18n-seo-content.md](06-i18n-seo-content.md))

- **D66** AI crawler policy in `robots.ts`: **block training** (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Meta-ExternalAgent, Bytespider); **allow citation** (OAI-SearchBot, Claude-SearchBot, PerplexityBot). 2026 consumer-health peer default — maintains AI-overview presence, denies training corpus

### Observability hardening (D67-D68, from [05-observability-analytics-flags.md](05-observability-analytics-flags.md))

- **D67** **PHI sanitizer** (`lib/observability/sanitize.ts`) + `assertNoPHI()` runtime guard + ESLint `no-console` + ban on direct vendor-SDK imports outside `lib/observability/`. Cerebral $7M lesson made architectural; single chokepoint, not call-site discipline
- **D68** Replay vendor concrete pick: **Sentry replay (error-triggered)** + **PostHog replay (consent-gated, sampled)** — both with `block`-class on every clinical-state-implying control. Resolves D42c deferral. "Exclude beats Mask" lesson from FullStory docs applied to both vendors

### Monorepo shape (D69, from [02-monorepo-tooling.md](02-monorepo-tooling.md))

- **D69** **Drop empty `packages/ui` from M1 scaffold.** Keep empty `packages/shared-types` (has near-term OpenAPI codegen consumer). `packages/ui` recreated at first extraction trigger. Empty packages bloat install graph and signal phantom work; D49's "scaffold empty" intent is wrong for `packages/ui`

---

## 3. UX/sequencing locks from session (U1-U8)

User answered 8 menu-shaped questions on 2026-05-17:

- **U1** Portal navigation = **hybrid top-nav primary + sidebar at complex sub-screens** (Stripe Customer Portal embedded pattern)
- **U2** M1-reserved marketing routes = **/science, /for-business, /customers** (NOT /careers — deferred)
- **U3** Help center reservation = **both /help path + help.my-quilty.com subdomain** — decide self-host vs Zendesk/Intercom at M9+ trigger
- **U4** AI crawler policy = **block training, allow citation** (per D66)
- **U5** Cognito `enable_custom_domain` flip = **at M1 cutover** (next sprint work)
- **U6** Cross-account DNS coordination = **manual PR-coordinated** between SST outputs and `quilty-aws/dns/` PR
- **U7** Web Cognito app client = **confidential** (client_secret in SSM) — enables Plus tier `enable_propagate_additional_user_context_data`
- **U8** Web tier product analytics = **PostHog Cloud Boost** (drop Amplitude from web; mobile keeps Amplitude per D42b retained for mobile only)

---

## 4. Strong confirmations (KEEP unchanged or with minor caveats)

| #                                                                | Status                                            |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| D1, D3-D8, D10, D12-D16, D18-D26, D28, D31-D33, D35-D41, D45-D49 | KEEP with caveats noted in respective agent files |

---

## 5. Harness gap discovered

`guard-bash.sh` blocks `sst remove` even with `--stage` arg → `/sst-destroy-previews` skill is dead-on-arrival. Plus `--force-with-lease` contradicts asklist vs hook. User must patch `.claude/hooks/guard-bash.sh` manually (Claude can't edit `.claude/hooks/`). Patch documented in `docs/runbook/m1_post_scaffold_checklist.md` for execution at sprint boundary.

---

## 6. Out-of-scope decisions deferred to next sprints

- M2-M3 UX: magic-link vs password vs passkey, social login providers, hard-vs-soft account deletion, blog author model, changelog voice
- M5-M7 UX: HSA/FSA, Stripe Customer Portal vs custom UI (leaning hosted)
- All quilty-aws work: `website-baseline/` TF layer, OIDC role, DNS records, Cognito flip, SES production access verification
- OpenAPI codegen wiring: direction locked (utoipa → `@quilty/api-types` → GitHub Packages), execution at M5
- Trusted Types enforce flip: M8 after 2-4 clean weeks of report-only data
- CSP enforce flip: M8 after 2-4 clean weeks of report-only data
- HSTS preload submission: M8 launch gate
- `/careers` route reservation: deferred (not in U2)
- Help center implementation: M9+ trigger per U3

---

## 7. Verification evidence (key data points)

- **SST release cadence (2026-05-12 v4.14.1, 100 commits in 90 days):** `gh api repos/sst/sst/commits?since=...&per_page=100` returned 100; releases endpoint returned v4.12.x → v4.14.x over ~3 weeks
- **Sentry BAA at Business tier:** verified at sentry.io/legal/baa/ (v1.0.1, Jan 15 2026)
- **Amplitude HIPAA BAA Enterprise-only:** verified at amplitude.com/pricing
- **PostHog Boost ($250/mo) covers BAA:** verified at posthog.com/platform-packages
- **Cognito OIDC BCL absence:** Cognito discovery doc does not advertise `backchannel_logout_supported` per AWS docs
- **Stripe SRI policy:** verified Stripe explicitly does not publish SRI hashes for `js.stripe.com/v3/`
- **Google FAQPage rich-result retirement:** 2026-05-07 per developers.google.com/search
- **CCPA §7025(c)(6):** effective 2026-01-01; Disney $2.75M + Ford $375K enforcement Feb-Mar 2026
- **Node 22 Maintenance LTS:** 2026-05-13 per nodejs.org schedule
- **Next.js 16 `middleware.ts` → `proxy.ts` rename:** verified at nextjs.org/docs/app/api-reference/file-conventions/proxy
- **WCAG 2.2 = ISO/IEC 40500:2025**
- **EAA enforcement** (effective 2025-06-28): France leading (Carrefour/Auchan/Leclerc formal notices); Ireland criminal penalties

---

## 8. Implication for M1 plan

The plan executes in 12 commits + final 6-agent QA:

- Phase A (commits 1-2): docs revisions + ADRs (this synthesis is committed in `synthesis.md` alongside the agent files)
- Phase B (commits 3-11): scaffold proper
- Phase C (commit 12 + manual + final QA): verification report, harness gap patch instructions for user

Each commit runs the per-task QA loop: 2 agents (bug-hunt + enterprise-comparison) → fix → 1 agent (cross-check) → fix → commit (SSH-signed, manual co-author trailer).
