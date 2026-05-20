# Round 6 Foundation Audit — Synthesis & Decisions

> Living decision contract. Sections A, B.1-B.5 are recommendations awaiting user lock. Section C is the decision-question table to answer inline. Section D is the proposed M1.5 sprint shape gated on Sections A-C.
>
> Audit corpus: 9 specialist agent reports + 2 verification Explore probes — all saved under `_raw/`. Total ~45,000 audit words.

---

## Preamble

The M1 + M1+1 baseline shipped a strong correctness foundation but a **flat monolith shape** — `apps/web/lib/` flat subdirectories with vendor SDK imports gated only by ESLint at the directory boundary. Audit Round 6 surfaced ~50 new decisions, ~15 strategy doc revisions, ~10 production bugs already shipped, and a load-bearing architectural principle from the mobile codebase: **`quilty_auth` is hexagonal at scale** (33 ports + 27 fakes + 9 cubits) with explicit ports/adapters/composition-root pattern.

The user's read: this should be our shape too. **Modular monolith + hexagonal per package + composition root + ESLint chokepoint at the adapter boundary.** Mobile is the architectural reference.

This document is the decision contract. Read Section A as factual locks (overrides agent reports where flagged). Read Section B as recommendations awaiting your sign-off. Answer Section C inline. Section D is the resulting M1.5 sprint plan.

---

## Section A — Locked corrections (no discussion needed)

### A.1 — User-asserted facts that override agent reports

| #   | Topic                 | User-asserted fact                                                                                                                                                                                    | Agent report that was wrong                                                                                                       |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Amplitude pivot       | **Stays.** Amplitude is the all-in analytics pick (web + mobile). Client migrates to Amplitude once auth migration completes. Headspace precedent. PostHog is legacy.                                 | Service-stack-coherence (`08`) recommended reverting to PostHog all-in. **Recommendation overruled.**                             |
| A2  | Domain strategy       | **`.com` is public-facing, `.app` is internal.** Mobile will migrate to `.com` once auth migration completes. The current `.app` references in mobile are interim — they're not the target end state. | AWS-recon (`01`) and Mobile-recon (`02`) reported `.app` as primary. **Read was correct for present state, wrong for direction.** |
| A3  | AASA scope            | Narrow to actual claimed paths only. **Fix the 2 shipped bugs.**                                                                                                                                      | Deeplinks (`07`) flagged the 2 bugs correctly.                                                                                    |
| A4  | Auth migration status | Cognito migration is **actively in progress and substantially more mature** than the original Mobile-recon claimed.                                                                                   | Mobile-recon (`02`) reported Supabase primary + Cognito "Phase 3 planned." **Wrong on both counts** — see A.2 verification.       |

### A.2 — Verified facts (Explore probes 10 + 11)

**Mobile `quilty_auth` package state (probe 10 — `quilty/packages/quilty_auth/`):**

- C1 HTTP layer ✅ shipped Apr 2026 (15 interceptors, JWT, SRP, error handling, 623+ tests)
- C2 Session core ✅ shipped May 9 (AuthBloc, refresh, signout, revoke, restore, 1698+ tests)
- C3 Auth flows ✅ shipped May 14 (signup, signin, MFA, OAuth, 2466 tests total)
- C4 Account management 🔄 in-progress May 18 (delete, email-change, password-reset)
- C5-C8 ⏳ pending Sprint 12+ (WebAuthn, device-trust, attestation)
- C9 ⏳ pending Sprint 13+ (main-app consumer rewire — package not yet imported by app)
- **33 ports + 27 fakes + 9 cubits + 1 main BLoC** — hexagonal architecture proven
- **2,466 tests passing, 85.2% coverage, 0 analyzer issues**
- Production smoke tests green vs `api.my-quilty.app` on 2026-05-14
- Branch `feature/auth-v2-supabase-rip` — Supabase intentionally torn out, zero source-code references in `quilty_auth`
- Token storage: Keychain/Keystore atomic-swap (not in-memory)
- Session state: RxDart `BehaviorSubject` with replay-1 (ADR-0025)

**AWS Cognito auth-layer state (probe 11 — `quilty-aws/auth/`):**

- User Pool tier: **PLUS** (advanced security, adaptive auth, WebAuthn passkeys)
- 15 schema attributes (standard + custom including `mfa_required_at`, `passkey_required_at`, versioned GDPR/CCPA consent receipts, synthetic-user load-test discriminator)
- MFA: OPTIONAL + software TOTP (SMS intentionally disabled per D186; email MFA off due to account-recovery deadlock)
- Password policy: NIST SP 800-63B-4 final compliant — 15-char minimum, no composition rules
- Device tracking: explicitly disabled (D193 — RFC 9700 §2.2.2 satisfied by refresh-token rotation + reuse-detection)
- Advanced security: AUDIT mode (toggle to ENFORCED ready)
- 3 active app clients (mobile public SRP/Custom-Auth/USER_AUTH, m2m_partner_reserved confidential, verification-only) + **web BFF client architecture locked U7**, delivery at M6
- Custom domain `auth.my-quilty.com`: one-flag flip away (`enable_custom_domain = false` → `true` at M1)
- Lambda triggers: monolithic active, split (5 dedicated crates) ready behind `q_topo_4_split_enabled` feature flag
- 15 Rust auth crates active dev, 30+ commits last 60 days
- EventBridge auth bus `quilty-{env}-auth-events` fully wired with `quilty.auth.Envelope` JSONSchema, transactional outbox pattern (DDB `quilty_outbox` → EventBridge Pipe → event bus → consumers)
- Session strategy: Cognito JWTs + Valkey ElastiCache JTI denylist + refresh-token rotation (RFC 9700 §4.14). **No separate DynamoDB session table.**
- API Gateway REQUEST authorizer (Rust Lambda :live alias, CodeDeploy managed)
- **No blockers to M1 website launch** (custom domain is one-variable flip once DNS apex exists)

### A.3 — Production bugs already shipped (must fix in M1.5)

| #     | Bug                                                                                                                                        | Source                                 | Fix scope |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | --------- |
| A.3.1 | `apps/web/app/manifest.ts` references `/icon-192.png` + `/icon-512.png` which don't exist in `public/` — Lighthouse PWA fails every deploy | Tech routes (`03`)                     | M1.5      |
| A.3.2 | AASA `paths`/`components` diverge for `/magic-link` — iOS 13+ silently drops it                                                            | Deeplinks (`07`)                       | M1.5      |
| A.3.3 | All 4 AASA-claimed paths reference routes that don't exist in `app/` — iOS clicks 404                                                      | Deeplinks (`07`)                       | M1.5      |
| A.3.4 | `sst.config.ts` emits `quilty:env` tag; AWS Org Tag Policy requires `quilty:environment` + 8 other mandatory tags                          | AWS recon (`01`)                       | M1.5      |
| A.3.5 | Strategy doc D9 wording incorrect — bus is `quilty-{env}-auth-events`, not `quilty.auth.sessions_revoked`                                  | AWS recon (`01`) + verification (`11`) | M1.5      |

---

## Section B — Decisions (recommendations awaiting lock)

### B.1 — Architecture decisions (the foundational restructure)

The single most consequential set of decisions in this audit. Mobile is hexagonal at scale (33 ports + 27 fakes); web must follow.

| D       | Decision                                                                                                                                                                                                                            | Rationale                                                                                                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D75** | **Modular monolith via Turborepo + pnpm workspaces.** `apps/web/` becomes thin (routes, layouts, server actions, composition root). Domain capabilities live in `packages/*` workspaces — one per cross-cutting concern.            | Matches the consensus enterprise pattern (Cal.com, Plain, Linear, Vercel, Resend, Sentry-Docs). Matches mobile's architectural shape. Refactoring at M1.5 (~150 files) is cheap; at M5 (~800 files) it's a 2-week sprint. |
| **D76** | **Hexagonal architecture per package.** Each `packages/<name>/src/` contains `ports.ts` (interfaces) + `domain/` (vendor-free logic) + `adapters/` (vendor-specific). **Adapter files are the ONLY files that import vendor SDKs.** | Direct mirror of `quilty_auth` (33 ports + 27 fakes). Vendor swap = one file. Tests inject fake adapters by port — no SDK mocking.                                                                                        |
| **D77** | **Composition root pattern.** Single file `apps/web/composition.ts` (per runtime: server, client, edge) wires concrete adapters to ports at boot. Domain never imports a vendor name.                                               | Industry-standard. Avoids DI containers (premature at our scale); explicit wiring is enough at <50 ports.                                                                                                                 |
| **D78** | **ESLint chokepoint at adapter boundary.** Vendor SDK imports (`@sentry/*`, `posthog-js`, `amplitude-js`, `@aws-sdk/*`, `stripe`, etc.) are permitted **only** in `packages/*/src/adapters/*.ts`. Anywhere else = build error.      | Tightens the existing M1 ESLint rule that gated at `lib/observability/` directory. Enforces D77 mechanically.                                                                                                             |
| **D79** | **dependency-cruiser graph rule extension.** `packages/*/src/domain/**` MUST NOT import `packages/*/src/adapters/**`. Cycles forbidden. Cross-package imports allowed only via the `index.ts` public API barrel.                    | Catches what ESLint can't see (transitive imports).                                                                                                                                                                       |
| **D80** | **Package taxonomy locked.** At M1.5: `packages/{shared-types, observability, security, seo, content, consent, auth, email, captcha, rate-limit}`. Deferred to triggers: `packages/{ui (D69), payment (M7)}`.                       | One package per cross-cutting concern with a clear port boundary. Smaller packages encourage smaller, more swappable adapters.                                                                                            |
| **D81** | **No bare `Service` naming.** Type names are role-shaped: `ErrorReporter`, `EmailSender`, `Captcha` — not `ErrorReporterService`. Adapter file names are vendor-shaped: `sentry-error-reporter.ts`, `ses-email-sender.ts`.          | "Service" as a generic suffix obscures port vs adapter intent. Mobile's package is named `quilty_auth` (capability), not `auth_service`.                                                                                  |

### B.2 — Port decisions (long-lived interface shapes)

The interface shapes that survive every adapter swap. Each port lives in `packages/<name>/src/ports.ts` and is consumed by domain code that knows nothing about the vendor behind it.

| D       | Port                           | Package                                  | Shape (concise)                                                                                                                          |
| ------- | ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **D82** | `ErrorReporter`                | observability                            | `captureError(err, ctx): void` + `captureMessage(msg, level, ctx): void` + `setUser(idHash)` + `setTag(key, val)`                        |
| **D83** | `Analytics`                    | observability                            | `track<E extends AnalyticsEvent>(event: E, ctx: TrackContext): Promise<void>` (existing D67 chokepoint shape retained)                   |
| **D84** | `Logger`                       | observability                            | `debug/info/warn/error(msg, fields)` — structured JSON, PHI-sanitized at chokepoint                                                      |
| **D85** | `FeatureFlagEvaluator`         | observability (or its own package later) | `evaluate(flagKey, defaultValue, ctx): boolean \| string \| number`                                                                      |
| **D86** | `Replay`                       | observability                            | `init(opts)` + `addEvent(name, payload?)` + `flush()` — mask/block policy lives in the port contract                                     |
| **D87** | `EmailSender`                  | email                                    | `sendTransactional({to, template, data})` + `sendBatch(...)` — template names are typed strings; payload Zod-validated                   |
| **D88** | `Captcha`                      | captcha                                  | `verify(token, ctx): Promise<{ok: true} \| {ok: false, reason}>`                                                                         |
| **D89** | `RateLimiter`                  | rate-limit                               | `check(key, limit, windowSec): Promise<{allowed: boolean, remaining: number, resetAt: Date}>`                                            |
| **D90** | `SessionStore`                 | auth (skeleton at M1.5; M6 fills)        | `get(sid)` + `put(sid, record)` + `revoke(sid)` + `revokeAllForUser(uid)`                                                                |
| **D91** | `ConsentStore`                 | consent                                  | `get(userIdOrCookie): Promise<ConsentState>` + `set(userIdOrCookie, state)` — DynamoDB-backed; honors GPC at edge                        |
| **D92** | `Authenticator`                | auth (skeleton at M1.5; M6 fills)        | `signIn(...)` + `signOut(...)` + `verifyToken(...)` + `refreshSession(...)` — abstracted from Cognito so the future-future swap is cheap |
| **D93** | `PaymentProcessor`             | payment (M7)                             | `createCheckoutSession(...)` + `verifyWebhook(...)` + `getSubscription(...)`                                                             |
| **D94** | `WafGate` (optional, deferred) | security                                 | thin port over WAF rule decisions; M1.5 stub-only                                                                                        |

### B.3 — Adapter decisions (vendor picks; M1.5 swap-cheap)

Vendor picks for M1.5 — each is one file in `packages/<name>/src/adapters/`. Swap = one file edit + one composition.ts line.

| Port                   | M1.5 Adapter                                                                                                                                     | Source                      | Notes                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ErrorReporter`        | **Sentry** (`@sentry/nextjs` 10.x)                                                                                                               | A1 (user lock)              | Already locked D42a; existing M1 wiring stays.                                                                                        |
| `Analytics`            | **Amplitude** (`@amplitude/analytics-browser` + `-node`)                                                                                         | A1 (user lock)              | Pivot stands. Pre-BAA at M1.5; upgrade to Amplitude Enterprise pre-launch. Client mobile follows once their auth migration completes. |
| `Logger`               | **CloudWatch** (Lambda `console.log` → CloudWatch Logs with PHI sanitizer chokepoint)                                                            | existing                    | Logger adapter is essentially the existing M1 `logger.ts` moved to `adapters/cloudwatch-logger.ts`.                                   |
| `FeatureFlagEvaluator` | **Env-var-typed `features.ts`** at M1.5 (D43 day-one); **Amplitude Experiment** when the trigger fires (post-launch flag activation requirement) | A1 (user lock)              | Adapter is a single env-var reader at M1.5.                                                                                           |
| `Replay`               | **Sentry Replay** (error-triggered only, mask-all + block-class on clinical controls per D68)                                                    | existing                    | D68 reframed in B.5 as **per-config discipline** (not per-vendor blanket rejection).                                                  |
| `EmailSender`          | **AWS SES** (existing enterprise-grade infra per `04-email-deliverability.md`)                                                                   | email agent                 | Stay on SES. Lift sandbox at M1.5; MTA-STS endpoint at M2.                                                                            |
| `Captcha`              | **Cloudflare Turnstile**                                                                                                                         | forms agent (D37 confirmed) | Free, privacy-friendly, CSP-compatible. Mobile already uses Turnstile.                                                                |
| `RateLimiter`          | **DynamoDB-backed** (`packages/rate-limit/src/adapters/dynamodb.ts`)                                                                             | forms agent                 | **Upstash rejected** (HIPAA account-isolation). 4-layer: WAF edge + DDB app.                                                          |
| `ConsentStore`         | **DynamoDB-backed** (shared schema with mobile's Usercentrics CMP)                                                                               | consent agent               | Web ships native cookie banner UI; mobile keeps Usercentrics. Shared `ConsentState` schema.                                           |
| `SessionStore`         | (M6) **Cognito JWT validation + Valkey ElastiCache JTI denylist**                                                                                | AWS recon + verification 11 | Matches the production-shipped strategy. **No separate website session table.**                                                       |
| `Authenticator`        | (M6) **AWS Cognito BFF** (Managed Login + confidential web client per U7)                                                                        | AWS recon + verification 11 | Web confidential client ships at M6 against the production user pool.                                                                 |
| `PaymentProcessor`     | (M7) **Stripe**                                                                                                                                  | strategy doc                | Adapter shape only at M1.5.                                                                                                           |

### B.4 — Cross-cutting decisions (the substantive M1.5 picks)

| D        | Decision                                                                                                                                                                                                                                                                                                         | Source                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **D95**  | **Native cookie consent banner**, server-side `ConsentState` as single source of truth (D35 confirmed). Reject Cookiebot/OneTrust/CookieYes/Osano (200-800KB hostile JS + conflict with D35 single source).                                                                                                      | consent agent            |
| **D96**  | **Cookie taxonomy v1**: essential / functional / analytics / marketing / personalization. Grandfathering policy: taxonomy v1 grandfathers existing users; only new categories require re-consent.                                                                                                                | consent agent            |
| **D97**  | **DSAR canonical URLs**: `/legal/privacy-choices` (preferences hub), `/account/data` (export/delete self-serve when signed in), `/privacy/request` (public unauthenticated DSAR form).                                                                                                                           | consent agent            |
| **D98**  | **GPC honored at edge** + server-side mirror. When `Sec-GPC: 1`, banner skips, ConsentState forces analytics+marketing off, GpcHonoredIndicator activates. Disney $2.75M Feb 2026 enforcement-tested baseline.                                                                                                   | consent agent            |
| **D99**  | **Accessibility Statement** at `/legal/accessibility` (alias `/accessibility`) — EAA 2025 (June 28) deadline already passed; we're late. 15-business-day feedback SLA. WCAG 2.2 AA self-asserted (third-party audit deferred).                                                                                   | consent agent            |
| **D100** | **Sub-processor list** at `/legal/subprocessors` (mirror at `/trust/subprocessors` when Trust Center subdomain materializes). 30-day notice before changes. RSS feed for subscribers.                                                                                                                            | consent agent            |
| **D101** | **Trust Center subdomain reserved** at `trust.my-quilty.com` (DNS record at M1.5; content fills M3+ when SOC 2 readiness begins).                                                                                                                                                                                | tech routes              |
| **D102** | **`status.my-quilty.com` subdomain reserved at M1.5**; Instatus Pro ($20/mo) activates M2-M3.                                                                                                                                                                                                                    | monitoring agent         |
| **D103** | **Sentry Uptime + Sentry Crons** for monitoring (1 free monitor each, BAA already). Reject BetterStack (no BAA), Checkly (no BAA), CloudWatch Synthetics (high ops).                                                                                                                                             | monitoring agent         |
| **D104** | **No on-call rotation pre-2nd-engineer.** Sentry → operator phone + Slack until then. Trigger to add BetterStack On-Call free tier = 2nd engineer hire. **Reject PagerDuty + incident.io as premature.**                                                                                                         | monitoring agent         |
| **D105** | **AWS Phase 0 security baseline**: GuardDuty + Security Hub Essentials + Config + HIPAA Conformance Pack + Inspector Lambda (~$30-60/mo). Phase 1 marketing-prod adds CloudFront WAF + Shield Advanced trigger.                                                                                                  | monitoring agent         |
| **D106** | **CloudWatch BFF Lambda log retention 14d → 6 years** (HIPAA §164.530(j)).                                                                                                                                                                                                                                       | monitoring agent         |
| **D107** | **HIPAA Breach Notification runbook spine** at `docs/runbook/incidents/` before M8: internal escalation, OCR portal submission template, user notification template, public statement template.                                                                                                                  | monitoring agent         |
| **D108** | **OTel single-target rule.** @vercel/otel pipes to Sentry OTLP only at M1.5 (D56 confirmed). Adding Honeycomb/Tempo/X-Ray = future trigger, not M1.5.                                                                                                                                                            | monitoring agent         |
| **D109** | **SEV taxonomy locked** at M1.5: SEV1 (PHI exposure / data loss) / SEV2 (sign-in outage / Stripe outage) / SEV3 (degraded perf) / SEV4 (cosmetic). User notification SLA = HIPAA 60-day for SEV1; status-page within 5 min for SEV1/2.                                                                           | monitoring agent         |
| **D110** | **AWS Budgets + Cost Anomaly Detection** at M1.5 (free, native). Infracost in CI on TF changes (when `quilty-aws/website-baseline/` lands).                                                                                                                                                                      | monitoring agent         |
| **D111** | **`security.txt`** (RFC 9116) + `/security` page at M1.5. Expires field with CI check that fails when `< 30 days` out (Stripe + Vercel security.txt files are expired — easy peer win).                                                                                                                          | tech routes              |
| **D112** | **`change-password`** well-known redirect to `/account/security` at M1.5. Chrome credential manager UX.                                                                                                                                                                                                          | tech routes              |
| **D113** | **`gpc.json`** well-known at M1.5 — we honor GPC; publish the policy.                                                                                                                                                                                                                                            | tech routes              |
| **D114** | **Favicon family** at M1.5: 16/32/96/192/512 PNGs + `apple-touch-icon-180.png` + `mask-icon.svg`. OG default image (1200×630 ≤ 1 MB). Fixes A.3.1 production bug.                                                                                                                                                | tech routes              |
| **D115** | **Manifest depth**: `id`, `scope`, `categories: ['health', 'productivity']`, `display_override`, `lang`, `dir`, `screenshots`, `shortcuts` — at M1.5.                                                                                                                                                            | tech routes              |
| **D116** | **AI crawler policy extended**: keep U4 (block training, allow citation); add Cloudflare Content-Signal header in robots.ts; add user-initiated AI fetcher allowlist (ChatGPT Browse, Claude-Web — distinct from training crawlers).                                                                             | tech routes              |
| **D117** | **Forms canonical pattern**: React Hook Form + Zod (shared schema for validate+types) + Server Actions + typed Result envelope + CSRF triple-layer + honeypot + time-trap + Turnstile + `role="status"` aria-live error region. shadcn `<Field>` primitives. Single Zod schema as source of truth.               | forms agent              |
| **D118** | **Auth URL surface locked at M1.5** (even though Authenticator adapter is M6). Routes: `/en/auth/verify`, `/en/auth/reset`, `/en/auth/sign-in?from=`, `/en/auth/mfa-enroll`; BFF: `/api/auth/{callback, logout, session, refresh, backchannel-logout, csrf-token, step-up, mfa-verify}`.                         | deeplinks agent          |
| **D119** | **`quilty_sub` is the cross-platform join key** (Rust-backend-issued UUID). Stored as Cognito custom attribute + future-Supabase-sunset removed. Revises D11 wording (`cognito_sub` → `quilty_sub`). Survives backend swaps.                                                                                     | service-stack agent      |
| **D120** | **Magic-link tokens via query string** (`?token=...`), NOT URL fragment. Server-side validate + single-use mark + 15-min expiry + 1/min rate-limit.                                                                                                                                                              | deeplinks agent          |
| **D121** | **Typed Server Action Result envelope** in `packages/observability/src/ports.ts` (or shared-types) — discriminated union `{ok: true, data} \| {ok: false, error}`. Hand-written TS (NOT `z.discriminatedUnion` — Zod 4 lost discriminator inference on envelopes).                                               | forms + deeplinks agents |
| **D122** | **Shared `validateRedirect()` utility** in `packages/security/src/`. Allowlist regex; reject open redirects. Used by every `from=` consumer.                                                                                                                                                                     | deeplinks agent          |
| **D123** | **Per-route-group `error.tsx` + `loading.tsx`** at M1.5: 9 files total. Distinct UX per group (marketing branded 500 + retry; portal preserves signed-in context with support link; API returns JSON error envelope).                                                                                            | deeplinks agent          |
| **D124** | **410 / 451 / 503 status code handling** at proxy.ts level. 410 Gone for permanently removed content (better than 404 for SEO); 451 for DMCA/GDPR-erasure responses; 503 for maintenance mode.                                                                                                                   | deeplinks agent          |
| **D125** | **No Service Worker at M1.5.** Marginal CWV win, HIPAA audit-surface inflation, Next.js 16 has no first-party SW story, consumer-health peers don't ship SW. Revisit at M9+ if PWA install becomes growth lever.                                                                                                 | deeplinks agent          |
| **D126** | **No PHI in email bodies ever.** Email content uses notification pattern only ("you have a new message — sign in to see it"). Extends D67 chokepoint to `EmailSender.sendTransactional` payload (sanitize template data before send).                                                                            | email agent              |
| **D127** | **DMARC ramp plan locked** — 8 weeks: Week 0 (audit current `p=quarantine pct=100`) → Week 2 (`p=quarantine pct=100` + monitor) → Week 4 (`p=reject pct=25`) → Week 6 (`p=reject pct=50`) → Week 8 (`p=reject pct=100`). Coordinated with `quilty-aws/email/`.                                                   | email agent              |
| **D128** | **List-Unsubscribe-Post (RFC 8058)** one-click handler at `/u/{token}` in BFF. Mandatory for marketing email and best-practice for transactional.                                                                                                                                                                | email agent              |
| **D129** | **Public mailbox roster**: `support@`, `legal@`, `privacy@`, `dpo@`, `security@`, `abuse@`, `postmaster@`, `dmarc-reports@`. Routed through M365 (per `quilty-m365` repo) with BAA in place.                                                                                                                     | email agent              |
| **D130** | **BIMI deferred** to post-USPTO-trademark. VMC ($1.5K/year for Gmail blue checkmark) deferred to post-launch revenue. CMC ($0/year, no checkmark) acceptable interim.                                                                                                                                            | email agent              |
| **D131** | **Customer.io Premium** as the locked marketing email adapter for `EmailSender` when waitlist activates at M3+. SES retained for transactional.                                                                                                                                                                  | email agent              |
| **D132** | **Double opt-in for marketing list** from day one (GDPR + CASL). Token + 24h expiry + confirmation page.                                                                                                                                                                                                         | email agent              |
| **D133** | **CI gate**: `security.txt` Expires < 30 days fails build. Pattern-matched in the existing CI hygiene job.                                                                                                                                                                                                       | tech routes agent        |
| **D134** | **Handle reservation matrix** — reserve at M1.5: Twitter/X, LinkedIn, Threads, Instagram, TikTok, YouTube, Bluesky (via custom domain), Reddit (no posting until policy lock), Substack, Product Hunt, GitHub org. Defer: Mastodon (instance choice TBD), Discord (moderation overhead), Facebook (B2C decline). | forms agent              |
| **D135** | **NEVER claim "HIPAA-compliant" badge.** "HIPAA-aligned" is the ceiling pre-BAA-with-Stripe-and-all-vendors. Cerebral $7M lesson. Linter rule: ban "HIPAA-compliant" string in all .tsx + .md outside `_raw/` audit dirs.                                                                                        | forms + consent agents   |

### B.5 — Strategy doc revisions (wording fixes)

| #                | Decision                     | Revision                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D9** revision  | EventBridge bus name         | `quilty.auth.sessions_revoked` → **`quilty-{env}-auth-events`** (custom registry, transactional outbox pattern). Detail-type discrimination per `quilty.auth.Envelope` JSONSchema.                                                                                                                                                                           |
| **D11** revision | Cross-platform join key      | `cognito_sub` → **`quilty_sub`** (Rust-backend-issued UUID — swap-resilient).                                                                                                                                                                                                                                                                                |
| **D45** revision | Public domain                | Add note: **`my-quilty.com` is public-facing; `my-quilty.app` is internal/migration interim**. Client migrates to `.com` once auth migration completes. Two-TLD architecture is interim, not permanent.                                                                                                                                                      |
| **D52** revision | Refresh token TTL            | Clarify per-client: **web 8h** vs **mobile 30d rotating**. Per-client RFC 9700 §4.14 rotation + reuse-detection.                                                                                                                                                                                                                                             |
| **D63** revision | ConsentState DynamoDB schema | Update schema definition to match what `packages/consent/src/ports.ts` will declare. Shared with mobile Usercentrics CMP.                                                                                                                                                                                                                                    |
| **D67** revision | PHI sanitizer chokepoint     | Extend chokepoint to **`EmailSender.sendTransactional` payload** (sanitize template data before vendor send).                                                                                                                                                                                                                                                |
| **D68** revision | Replay vendor posture        | **Per-config discipline**, not per-vendor blanket rejection. Required configs (across any replay adapter): `maskAllInputs: true` + `maskAllText: true` + `blockClass: 'replay-block'` + CI selector test that fails on missing class on PHI-bearing inputs. Mobile's PostHog Session Replay setup already meets this discipline; web Sentry Replay does too. |

---

## Section C — Open questions (decision table)

Answer inline by editing this file (the rows are intentionally short).

### P0 — blocking M1.5 start (need answer this week)

| #   | Question                                                                                                                                                                                                              | Recommended default | Your answer |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------- |
| C1  | Confirm Section A.1 user-asserted facts (Amplitude stays, `.com` public / `.app` internal, AASA narrow scope, auth migration mature)                                                                                  | ✓ Lock as written   |             |
| C2  | Confirm Section B.1 modular monolith + hexagonal architecture (D75-D81)                                                                                                                                               | ✓ Lock              |             |
| C3  | Confirm package taxonomy (D80): `shared-types, observability, security, seo, content, consent, auth, email, captcha, rate-limit` at M1.5 + deferred `ui, payment`                                                     | ✓ Lock as written   |             |
| C4  | AASA claim scope narrow: which paths to claim? Recommendation = `/account/security/passkeys`, `/auth/magic-link` (when shipped), `/account/data/export` (when shipped). Marketing routes NOT claimed (better as web). | ✓ As recommended    |             |

### P1 — blocking M2 / M3 work

| #   | Question                                                                                                                                                      | Recommended default                                                                               | Your answer |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------- |
| C5  | GDPR Right-to-Erasure scope: website-only or unified across BAA boundary (mobile + web together via Rust backend `Erase` API)?                                | Unified — Rust backend is canonical user-data owner                                               |             |
| C6  | GDPR Right-to-Access (export) scope: same question                                                                                                            | Unified — Rust backend `Export` API                                                               |             |
| C7  | DPO appointment timing: founder-as-DPO interim or external Privacy Officer engaged at M3?                                                                     | Founder-as-DPO until first paying customer / first GDPR DSAR / Y employees, whichever comes first |             |
| C8  | Account-delete reason enum: keep current values (`too_expensive`, `not_helpful`, `privacy`, `switched_provider`, `other_specified`, `unspecified`) or revise? | Keep — covers main exit reasons without smuggling clinical state                                  |             |
| C9  | USPTO trademark filing: wordmark only, wordmark + logo, or both with first-action timing?                                                                     | Wordmark filing at M3 (cheap, gates BIMI/VMC); logo filing at M5 (after brand identity locks)     |             |
| C10 | HIPAA officer designation: Privacy Officer + Security Officer (§164.530(a)) — founder-as-both?                                                                | Founder-as-both at solo-team scale; split when 2nd engineer hires                                 |             |

### P2 — blocking M5-M7

| #   | Question                                                                             | Recommended default                                                                                         | Your answer |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------- |
| C11 | CAN-SPAM physical address: PO Box / registered agent / personal address?             | Registered agent (~$100-200/year)                                                                           |             |
| C12 | Sentry digest visibility on user 500 pages — currently visible                       | Keep visible (support UX > information disclosure for small team)                                           |             |
| C13 | Smart App Banner copy strategy — when to show?                                       | Show on marketing routes only after user signed in once on mobile (heuristic via Sec-CH-UA-Mobile + cookie) |             |
| C14 | Apple Pay merchant verification timing: M7 with Stripe, or earlier?                  | M7 with Stripe (depends on Stripe domain association file)                                                  |             |
| C15 | Status page brand stance — be the only consumer-health peer with public status page? | YES — trust signal differentiator                                                                           |             |

---

## Section D — M1.5 sprint plan (sequenced, gated on Section C answers)

### Sprint shape

- **~15-20 atomic commits** over ~6-8 working days
- Same per-commit QA loop as M1 (Pass A: 2 parallel agents → fix → Pass B: 1 agent → fix → commit)
- Push held until sprint boundary per `feedback_push_per_phase`
- Final 6-agent QA sweep at end (typescript + a11y + hipaa-csp + perf-bundle + seo-meta + sst-iac)

### Sequenced commit plan

| #   | Commit subject                                                                                          | Scope                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `chore(arch): bootstrap modular monolith — pnpm workspaces + 10 packages`                               | `pnpm-workspace.yaml`, `packages/*/package.json` + `tsconfig.json` skeleton for all 10 packages, ESLint adapter-boundary tightening (D78), dependency-cruiser graph rule (D79)                                                                                            |
| 2   | `refactor(observability): extract apps/web/lib/observability → packages/observability`                  | Move existing code into hexagonal shape: `ports.ts` + `domain/{track, log-error, logger, flag}.ts` + `adapters/{sentry-error-reporter, amplitude-analytics, cloudwatch-logger}.ts`. Composition root (`apps/web/composition.ts`) wires adapters. Tests move with package. |
| 3   | `refactor(security): extract apps/web/lib/security → packages/security`                                 | `ports.ts` (`Sanitizer`, `CspBuilder`, `HeadersBuilder`, `RedirectValidator`) + `domain/*` + adapters. `proxy.ts` consumes via composition.                                                                                                                               |
| 4   | `refactor(seo): extract apps/web/lib/seo → packages/seo`                                                | Schema.org builders + JsonLd component (with safeStringify in domain).                                                                                                                                                                                                    |
| 5   | `refactor(content): extract apps/web/lib/content + components/blocks → packages/content`                | Velite + Zod schemas + BlockRenderer; ports for content loading.                                                                                                                                                                                                          |
| 6   | `feat(consent): packages/consent + native cookie banner UI + taxonomy v1`                               | D95-D98. DynamoDB-backed `ConsentStore` adapter (stub at M1.5; DDB table provisioning in next-sprint AWS work). Native banner React component with GPC integration.                                                                                                       |
| 7   | `feat(captcha): packages/captcha + Turnstile adapter skeleton`                                          | Port + adapter; verify with composition root. No form consumers yet (forms land later in sprint).                                                                                                                                                                         |
| 8   | `feat(rate-limit): packages/rate-limit + DynamoDB adapter skeleton`                                     | Same shape.                                                                                                                                                                                                                                                               |
| 9   | `feat(email): packages/email + SES adapter skeleton + EmailSender PHI chokepoint`                       | D67 extension (D67 revision). M3 fills with real templates.                                                                                                                                                                                                               |
| 10  | `feat(auth): packages/auth + Authenticator/SessionStore port skeletons`                                 | Skeleton only; M6 ships adapters. Reserves namespace + composition wiring.                                                                                                                                                                                                |
| 11  | `fix(web): resolve 5 production bugs (A.3.1-A.3.5)`                                                     | Manifest icons, AASA paths, AASA components, sst.config.ts tag drift, D9 wording fix                                                                                                                                                                                      |
| 12  | `feat(web): technical routes (favicon family, security.txt, change-password, gpc.json, manifest depth)` | D111-D116. Plus CI gate for security.txt Expires (D133).                                                                                                                                                                                                                  |
| 13  | `feat(web): per-route-group error.tsx + loading.tsx (9 files) + 410/451/503 handling`                   | D123, D124.                                                                                                                                                                                                                                                               |
| 14  | `feat(web): typed Server Action Result envelope + validateRedirect utility + auth URL surface lock`     | D118, D121, D122. RHF + Zod + Server Actions canonical pattern wired into a real form: `/contact` (M1.5's first working form).                                                                                                                                            |
| 15  | `feat(legal): accessibility statement + DSAR pages + sub-processor list`                                | D99, D100, D97. Legal placeholders ready for M8 lawyer fill.                                                                                                                                                                                                              |
| 16  | `chore(strategy): commit revisions to D6/D9/D11/D45/D52/D63/D67/D68 + add D75-D135 + U9-U20`            | Strategy doc update. New ADR-0008 (modular monolith), ADR-0009 (hexagonal per package), ADR-0010 (composition root), ADR-0011 (port/adapter naming).                                                                                                                      |
| 17  | `chore(monitoring): wire Sentry Uptime + Crons + cost alerts + status subdomain reservation`            | D102-D110. AWS Phase 0 security baseline is `quilty-aws/` work next sprint.                                                                                                                                                                                               |
| 18  | `chore: round 6 final-QA fixes`                                                                         | After 6-agent QA sweep.                                                                                                                                                                                                                                                   |
| 19  | `docs: M1.5 verification report + post-sprint checklist`                                                | Mirror M1 verification report style.                                                                                                                                                                                                                                      |

Estimated wall-clock: 6-8 working days. Estimated agent invocations: ~60 (per-commit × 3 each + final 6-agent sweep).

### Out of scope for M1.5 (deferred to M2-M9 by trigger)

- AWS deploy + DNS records + Cognito custom domain flip + ACM cert provisioning → **next sprint** (`quilty-aws/` work)
- `quilty-aws/website-baseline/` Terraform layer → **next sprint**
- Real Cognito Authenticator adapter wiring → **M6**
- Real Stripe PaymentProcessor adapter → **M7**
- Real content (MDX in `apps/web/content/`) → **M3-M4**
- Brand identity + favicon final art + OG default image final art → **M3**
- Marketing email activation (Customer.io Premium) → **M3 waitlist trigger**
- BIMI + VMC → post-USPTO-trademark
- HSTS preload submission → **M8 launch gate**
- CSP enforce flip (from report-only) → **M8**
- Trusted Types enforce flip → **M6 / M8**
- Status page activation (Instatus Pro) → **M2-M3**
- HIPAA Breach runbook documents → **before M8**
- AWS Phase 0 security baseline activation → **after `quilty-aws/website-baseline/`**

---

## Section E — Appendix

### Agent reports inventory

| #   | Report                                     | Location                                      |
| --- | ------------------------------------------ | --------------------------------------------- |
| 01  | AWS infra recon                            | `_raw/01-aws-infra-recon.md`                  |
| 02  | Mobile stack recon                         | `_raw/02-mobile-stack-recon.md`               |
| 03  | Technical routes + discoverability         | `_raw/03-technical-routes-discoverability.md` |
| 04  | Email deliverability                       | `_raw/04-email-deliverability.md`             |
| 05  | Consent + privacy + legal                  | `_raw/05-consent-privacy-legal.md`            |
| 06  | Forms + bots + reputation                  | `_raw/06-forms-bots-reputation.md`            |
| 07  | Deeplinks + error resilience               | `_raw/07-deeplinks-error-resilience.md`       |
| 08  | Service-stack coherence                    | `_raw/08-service-stack-coherence.md`          |
| 09  | Monitoring + status + incident             | `_raw/09-monitoring-status-incident.md`       |
| 10  | quilty-auth package verification (Explore) | `_raw/10-quilty-auth-package-verification.md` |
| 11  | AWS auth-layer verification (Explore)      | `_raw/11-quilty-aws-auth-verification.md`     |

### Architectural reference

Mobile `quilty_auth` package (path: `/Users/d1rect0r_interneta/AppBuilding/quilty/packages/quilty_auth/`) is the canonical hexagonal-architecture reference:

- 33 ports + 27 fakes + 9 cubits + 1 main BLoC
- 2,466 tests / 85.2% coverage / 0 analyzer issues
- Branch `feature/auth-v2-supabase-rip` (Supabase intentionally torn out)
- Production smoke tests green vs `api.my-quilty.app` 2026-05-14
- ADR-0025 (RxDart BehaviorSubject replay-1 contract)

### Decision-numbering audit

- D1-D74 existed before Round 6
- Round 6 net-new decisions: **D75-D135** (61 new decisions)
- Round 6 revisions: **D9, D11, D45, D52, D63, D67, D68** (7 revisions)
- New ADRs: **0008 (modular monolith), 0009 (hexagonal per package), 0010 (composition root), 0011 (port/adapter naming)**
- New U-sequencing locks: **U9-U20** (placeholders; consolidate from agent reports during commit 16)

### Audit timeline

- 2026-05-19 09:00 — Audit Round 6 launched (7 Wave 1 agents)
- 2026-05-19 14:30 — Wave 1 complete (7/7)
- 2026-05-19 15:00 — Wave 2 launched (2 agents)
- 2026-05-19 17:00 — Wave 2 complete + Explore verification probes launched (2 agents)
- 2026-05-19 19:30 — Explore probes complete
- 2026-05-19 21:00 — Synthesis-and-decisions doc written (this file)

---

## Response protocol

To lock decisions: answer Section C inline (edit this file in your branch + comment / reply / direct-edit; whichever workflow you prefer). Once Section C is answered I commit Section B + revisions to the strategy doc, write ADRs 0008-0011, and start the M1.5 sprint per Section D.

If Section B contains anything you want to revise (vs accept-as-recommended), flag the specific D-number with the revision.

The chat stays clean from here. All decision-resolution conversation happens in this document.
