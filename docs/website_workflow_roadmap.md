# Quilty Website — Workflow Roadmap

> Operational playbook for building, integrating, and launching the Quilty website.
> **This doc** = the "what" and "when" (milestones, deliverables, gates, sequencing).
> **`website_strategy_discussion.md`** = the "why" (D1-D49 locked decisions + rationale).
>
> Living document. Updated as milestones complete, patterns emerge, and triggers fire.

---

## Quick reference — where things live

| Concern | Location |
|---|---|
| Strategy + locked decisions (D1-D49) | `quilty-website/docs/website_strategy_discussion.md` |
| Research backing strategy decisions | `quilty-website/docs/research/` (8 reports across 4 research rounds) |
| Workflow + milestones (this doc) | `quilty-website/docs/website_workflow_roadmap.md` |
| Existing AWS infrastructure context | `quilty-aws/CLAUDE.md` |
| Existing DNS layer | `quilty-aws/dns/` (production account, us-east-1) |
| Existing Auth layer (Cognito + Rust) | `quilty-aws/auth/` + `quilty-aws/lambdas/rust/crates/auth-*` |
| Memory pointer | `~/.claude/projects/-Users-d1rect0r-interneta-AppBuilding-quilty-aws/memory/project/website_strategy_locked_2026-05-14.md` |

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
- `quilty-website/` — overwrite Cloudflare scaffold with Turborepo:
  - `apps/web` — Next.js 16 App Router + TypeScript strict
  - `packages/ui` — shadcn components + wrap-don't-edit rule
  - `packages/shared-types` — Zod schemas + OpenAPI consumer (eventually)
  - `sst.config.ts` — SST 3.x config
  - Tailwind v4 with 3-layer token namespace
  - Lucide icons, `next/font` variable font, `next/image` discipline
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

| Event | Frequency | Triggers dns apply? |
|---|---|---|
| Website content/code deploy (PR, main) | Daily/weekly | NO |
| ACM cert renewal | Auto (AWS handles) | NO |
| Adding new website subdomain | Yearly maybe | YES |
| Initial cutover | ONCE | YES |
| Phase 1 migration to `marketing-prod` account | ONCE (post-revenue) | YES |

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
- `quilty-website/` Turborepo scaffold:
  - `package.json` (root, workspaces)
  - `pnpm-workspace.yaml`
  - `turbo.json`
  - `tsconfig.base.json`
  - `sst.config.ts`
  - `apps/web/` — Next.js 16 App Router scaffold
    - `app/page.tsx` — placeholder homepage
    - `app/layout.tsx` — root layout with metadata
    - `app/sitemap.ts`, `app/robots.ts`
    - `app/not-found.tsx`, `app/error.tsx`
    - `next.config.ts` — `trailingSlash: false`, security headers baseline, CSP nonce
    - `tailwind.config.ts` — Tailwind v4 with 3-layer token namespace
    - `eslint.config.js` — strict + jsx-a11y
  - `packages/ui/` — shadcn baseline (button, card, dialog, form primitives)
  - `packages/shared-types/` — placeholder (populated later)
  - `.github/workflows/` — preview-on-pr, deploy-on-main
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

**Deliverables (7 pages):**
- `/` — homepage with placeholder hero, value prop, CTA
- `/privacy` — placeholder privacy policy (lawyer review at M8)
- `/terms` — placeholder Terms of Service
- `/support` — real contact email + basic FAQ
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

### M3 — Identity discovery (voice + visual)

**Goal:** Site looks and sounds like Quilty, not like default shadcn.

**Effort:** 1-2 weeks of iteration
**Drive:** User-driven (you experiment in Claude Design / mockup tools) + Mixed (I implement)

**Deliverables:**
- 3-5 homepage hero copy variants explored
- 2-3 visual directions (color palette, typography, density)
- Final voice + visual identity locked through artifacts
- Tailwind tokens updated to reflect chosen palette
- Typography stack chosen (variable font via `next/font`)
- Component library customized away from shadcn defaults
- Updated /privacy, /terms, /support, /account/delete to match new visual
- Updated metadata + Open Graph images
- Brand guideline doc (`docs/brand_guidelines.md` — minimal, just enough to maintain consistency)

**Decision gate before M4:** voice + visual feel "right." This is judgment, not metric.

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

**Decision gate before M5:** marketing pages convert (or at least feel like they could). Lighthouse + Core Web Vitals still green. Page weight budget honored.

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
- Cognito Hosted UI at `auth.my-quilty.com` activated (M1 unlock)
- Cognito app client for web with redirect URIs registered

**Deliverables:**
- Next.js Route Handlers (BFF):
  - `/api/auth/callback` — OIDC code exchange, sets `__Host-` session cookie
  - `/api/auth/logout` — clears session, calls Cognito global sign-out, dispatches backchannel logout
  - `/api/auth/refresh` — server-side token refresh
  - `/api/csrf` — issues double-submit CSRF token
- BFF middleware: session validation, CSRF check on mutating requests, request signing
- `__Host-quilty_session` cookie (HTTP-only, Secure, SameSite=Lax, Path=/)
- OIDC backchannel logout endpoint
- Real account data fetch from Rust backend (over HTTPS to API GW with auth headers)
- Real MFA management (passkeys + TOTP enrollment, verification, recovery)
- Real session list + "sign out everywhere" (via backchannel logout to mobile + revocation)
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

**Deliverables:**
- Stripe Customer Portal embed with deep links to subscription/payment/cancellation
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
- "Limit Use of My Sensitive Personal Information" link (CPRA — mental-health is sensitive PI)
- Accessibility statement (WCAG 2.2 AA conformance)
- Manual a11y audit (TPGi or Deque) — pre-EU-launch requirement (EAA June 2025)
- Business name + physical address in footer (Stripe + GDPR identity disclosure)
- Stripe full activation: complete the website checklist (16 items in `research/regulatory_requirements.md`)
- Auto-renewal + trial terms disclosure
- Breach notice template at `/security/notices/` (soft requirement until needed)

**Decision gate before launch:** lawyer signs off on privacy + terms + NPP. Stripe full activation granted. Apple Dev org enrollment complete. SES production access granted (likely landed by M2-M3, but verify). EAA-readiness audit complete if launching in EU.

### M9+ — Iterate (post-launch, ongoing)

**Goal:** Continuous improvement based on real user signal.

**Drive:** Mixed, user-prioritized

**Likely deliverables (not exhaustive):**
- Hosted help center migration (Zendesk or Intercom at `help.my-quilty.com`)
- Blog (if/when content marketing matters)
- A/B testing infrastructure (GrowthBook flag triggers)
- SEO investment + content marketing
- More marketing pages
- Performance tuning (cold start, INP, LCP optimization)
- Internationalization activation (first non-EN locale)
- Headless CMS migration (when content volume + non-engineering authors justify)
- Sitewide search (Pagefind → Algolia trigger)
- Advanced analytics dashboards
- Amplitude integration (when traffic exists)

---

## Parallel / cross-cutting workstreams (continuous from M1)

### CI/CD
- GitHub Actions OIDC → SST deploy
- `main` push → production stage in dev account
- PR open → preview stage (auto-cleanup on close)
- Lockfile + SBOM (CycloneDX) generation per build
- Dependabot + Renovate
- Sigstore signing (mirroring backend pattern)

### Testing
- Vitest for unit/component tests
- Playwright for e2e + a11y (axe-core integration)
- Visual regression (Percy / Chromatic — TBD, additive)
- Performance budgets enforced in CI (Lighthouse CI)

### Observability (Sentry from M1, Amplitude pre-launch)
- Sentry: errors + RUM + replay (mask-all default)
- `web-vitals` → Sentry for Core Web Vitals
- Server-side logging to CloudWatch
- W3C traceparent propagation locked in M6, baseline in M1
- Amplitude added pre-launch when funnels start mattering

### Security
- CSP nonce + strict-dynamic, report-only → enforce
- Security headers baseline (HSTS preload, frame-ancestors, Permissions-Policy)
- SRI on third-party scripts (Stripe.js, analytics)
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

| Touchpoint | When | What we coordinate | Owner |
|---|---|---|---|
| `dns/` layer (prod account) | M1, M8 | Add alias records, validate ACM cert, MTA-STS TXT | Coordinated |
| `auth/` layer | M1 (flip flag), M6 (web app client) | `enable_custom_domain = true`, add web Cognito app client with redirect URIs | Coordinated |
| Cognito Hosted UI | M6 | Activate, configure for web flow, custom UI later (deferred per D6) | quilty-aws |
| `email/` layer (SES) | M2+ | Transactional emails from website (welcome, password reset) — already wired, just call from BFF | quilty-aws (existing) |
| OpenAPI spec from Rust backend | M6+ | Website TS types via codegen (or hand-write initially, automate later) | quilty-aws |
| Cache layer (ElastiCache Valkey) | M6 | BFF session storage TBD — may use, may rely on cookies only | TBD at M6 |
| Stripe webhook handlers (Rust) | M7 | New Rust crate(s) in `lambdas/rust/crates/` for subscription state webhooks | quilty-aws |
| Audit pipeline (DDB Streams → Firehose → S3 Object Lock) | M6+ | Web mutations carry `channel: "web"` tag at API GW; lands in same audit sink | quilty-aws (existing) |
| W2-B.3 deploy state | M6 blocker | Auth backend must be deployed to prod before live auth integration | quilty-aws |
| Phase 1 migration | post-launch (~M8 trigger) | Vend `marketing-prod` account in Workloads-NonHIPAA OU; migrate website out of `development`; apply pixel-isolation SCP | quilty-aws |

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
- [ ] BAA with relevant vendors (Stripe if applicable, Amplitude, Sentry)
- [ ] Cookie consent flow tested across EU + CA traffic
- [ ] GPC honoring verified
- [ ] Accessibility manual audit complete (TPGi or Deque)
- [ ] HIPAA NPP posted + linked prominently
- [ ] CCPA "Your Privacy Choices" link in footer + relevant pages
- [ ] CPRA "Limit Use of Sensitive PI" link (mental-health = sensitive PI)
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
- [ ] Amplitude event taxonomy defined + instrumented for launch funnels

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

## Decision quick-reference (D1-D49 summary)

Full text in `website_strategy_discussion.md`. This is the one-line summary for quick recall:

| # | Decision | One-line summary |
|---|---|---|
| D1 | Framework | Next.js 16 App Router + TypeScript |
| D2 | Deploy | SST (OpenNext) on AWS |
| D3 | App layout | Single Next.js app for marketing + `/account/*` portal |
| D4 | Monorepo | Turborepo + pnpm; apps/website + packages/ui + packages/shared-types |
| D5 | BFF | Next.js Route Handlers (TS Lambda) — Option A locked |
| D6 | Auth boundary | Cognito Hosted UI at auth.my-quilty.com |
| D7 | Cookie scope | `__Host-` prefix, per-subdomain (NOT parent-domain shared) |
| D8 | SameSite | Lax |
| D9 | Logout | OIDC Backchannel Logout with `sid` |
| D10 | CSRF | Signed double-submit + custom header |
| D11 | Mobile-web | Independent sessions joined by `sid` + backchannel logout |
| D12 | Domain | my-quilty.com same-origin marketing + portal; subdomains carved out |
| D13 | URL | trailingSlash: false |
| D14 | Locale | `/[locale]/` route segment reserved, EN-only at launch |
| D15 | Permalinks | /blog/<slug>, /account/* |
| D16 | Redirects | Versioned artifact in next.config.js |
| D17 | Styling | Tailwind v4 + 3-layer token namespace |
| D18 | Components | shadcn in components/ui/ + wrap-don't-edit |
| D19 | Icons | Lucide |
| D20 | Theme | Dark-mode-ready CSS variables (ship later) |
| D21 | Perf | next/font + next/image discipline |
| D22 | A11y | axe-core in CI + jsx-a11y ESLint |
| D23 | WCAG | 2.2 AA target |
| D24 | Content | Pages as typed block arrays |
| D25 | i18n | next-intl |
| D26 | Metadata | metadataBase + canonical + sitemap.ts + robots.ts |
| D27 | Schema | MedicalWebPage + Organization + SoftwareApplication + FAQPage |
| D28 | RUM | INP/LCP/CLS tracking from day one |
| D29 | Blocks | Hero + ValueProp + FeatureGrid + FAQ + TestimonialQuote + CTABanner |
| D30 | CMS | MDX in repo → migrate when justified |
| D31 | PHI | Zero-PHI website |
| D32 | CSP | Nonce + strict-dynamic |
| D33 | Headers | HSTS preload + frame-ancestors + Permissions-Policy default-deny |
| D34 | SRI | On third-party scripts (Stripe.js, analytics) |
| D35 | Consent | Server-side ConsentState + GPC honoring + SDK-load-gated |
| D36 | SBOM | CycloneDX in CI + Dependabot + lockfile pinning |
| D37 | WAF | CloudFront managed rules + Turnstile on auth/signup |
| D38 | Tracing | W3C traceparent → x_trace_id propagation |
| D39 | Audit | Web hits same /v1/* endpoints with `channel:"web"` tag |
| D40 | Replay | Session replay mask-all default |
| D41 | Flags | Server-side eval with local cache |
| D42a-d | Observability | Sentry (errors+RUM) + Amplitude (analytics) + CloudWatch (logs) + session replay deferred |
| D43 | Flag tool | Typed env-var module → GrowthBook trigger |
| D44 | Subscription | Stripe + Stripe Customer Portal + RevenueCat for IAP (config TBD) |
| D45 | Public domain | my-quilty.com (NOT .app) |
| D46 | Repo | Rebuilt quilty-website monorepo, separate from quilty-aws |
| D47 | Phase 0 account | Existing `development` account ($0 incremental) |
| D48 | Backend lang | Permanently Rust (TS Track A closed) |
| D49 | Other restructuring | All deferred to Phase 1+ triggers |

---

## Open questions remaining

Genuinely unresolved (won't block M1):

1. **Q1 — Voice + positioning** — discovered through M3 iteration
2. **Q4 — Account portal v1 final scope** — refined at M5
3. **Q6 — Visual identity beyond Tailwind baseline** — discovered through M3
4. **D42c — Session replay vendor** — Amplitude SR vs FullStory at pre-launch
5. **D43-upgrade — Feature flag tool trigger** — GrowthBook direction locked, trigger TBD
6. **D44 — Subscription provider exact config** — closer to launch
7. **Working patterns (above)** — discovered through M1-M2 lived experience

---

## Trigger watchlist (future migrations queued)

Things we've explicitly deferred with concrete triggers:

| Trigger | Action |
|---|---|
| Public launch or first revenue | Vend `marketing-prod` AWS account; migrate website out of `development`; apply pixel-isolation SCP; flip Phase 0 → Phase 1 |
| Engineer #2 joins | Wire Entra → AWS IAM Identity Center (SAML+SCIM); revisit drive patterns |
| ~$500K ARR or 5 engineers | Consider splitting auth-prod from foundation/api-prod |
| ~$2M ARR or 10 engineers + 2nd VPC | Add `network` account + Transit Gateway |
| ~50 components | Consider Storybook |
| Non-engineering author needs to publish | Migrate MDX → Sanity/Contentful |
| Second product surface in monorepo | Extract `packages/ui` to its own workspace (already there but become real) |
| `lambdas/` polyglot CI gets awkward | Extract `lambdas/rust/` → new `quilty-rust` repo |
| Engineer #8-10 | Evaluate OpsLevel or Port (skip Backstage) |
| >50 indexable pages | Add Pagefind search; later Algolia |
| 10k weekly visitors | Add A/B testing infrastructure (GrowthBook) |
| First EU launch | Manual a11y audit + EAA conformance verification |

---

## Update log

- **2026-05-14** — Workflow doc created after 4 rounds of strategy discussion + 11 research agents across rounds. M1 ready to begin pending user authorization to start implementation work. Cross-account Pattern A locked. All D1-D49 captured. Open questions catalogued. Trigger watchlist populated.
