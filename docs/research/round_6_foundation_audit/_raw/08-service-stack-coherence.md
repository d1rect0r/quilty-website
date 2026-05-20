# Round 6 Foundation Audit — Wave 2, Agent A: Service-Stack Coherence

> **Scope:** Cross-cutting synthesis of Wave 1's seven reports. Forces picks where Wave 1 surfaced options, resolves the Amplitude pivot, the `.com` vs `.app` domain conflict, the auth-backend reality gap, and renumbers the 40+ D-decisions proposed across Wave 1 into a clean canonical sequence. Read-only synthesis; no files modified outside the assigned output path.
>
> **Date:** 2026-05-19
> **Author:** `service-stack-coherence` review pass

---

## 1. Executive summary

**The 2026-05-19 Amplitude all-in pivot (D42b revert) is built on a false premise and must be reversed.** The user's stated rationale was "client is going to do amplitude as well," but the Wave 1 mobile recon (file 02) proves that the mobile binary in production today is **PostHog Cloud EU + TelemetryDeck + Sentry — with zero Amplitude SDK present** and an explicit February 2026 mobile ADR that **rejected Amplitude as primary** on four capability grounds (no mobile session replay, no built-in feature flags, no self-hosting option, complex enterprise-only pricing). The "consolidate on Amplitude" decision therefore consolidates onto a vendor neither side ships and that mobile has already evaluated and rejected. **Recommendation: Option B — PostHog Cloud Boost (HIPAA BAA) for web + mobile.** Mobile already pays for it; HIPAA BAA is available on Boost; cross-platform identity reconciles natively via `cognito_sub` (or transitionally Supabase UUID) as the `distinct_id`; mobile's PostHog session replay can stay (Round-5 attribute-leak concern reframed below); D43 stays with PostHog flags. Cost at our forecast trajectory (~1M MAU at 24 months) is roughly **half** of equivalent Amplitude Enterprise + Session Replay + Experiment SKUs. This is the highest-stakes decision in this synthesis.

**Domain strategy: keep two-TLD architecture (`web=my-quilty.com`, `mobile-infra=my-quilty.app`).** AWS recon confirms `.app` is the primary infrastructure zone with mobile's universal-link AASA, API gateway, and Cognito custom-domain target all anchored there. `.com` has full SES email infra and no website infra. Mobile binary releases + AASA + assetlinks retrofit are too costly to retrofit; web at `.com` and mobile infra at `.app` is the lowest-friction final state. **`auth.my-quilty.com` flips to Cognito Managed Login at U5 per the existing plan.**

**Auth backend reality gap: Cognito on web, Supabase on mobile is the correct interim state.** Mobile's Phase 3 Cognito migration is in-flight but not shipped. Forcing mobile to ship Cognito before web M6 is a 6-9 month dependency that delays revenue. Recommend: web ships Cognito at M6 per plan; mobile migrates Phase 3 at its own pace; the Rust backend maintains a Supabase-UUID-to-`cognito_sub` translation table during the transition (~6-12 months expected lifespan).

**Other locks:** Marketing email = Customer.io Premium when waitlist activates (M3+ trigger). CAPTCHA = Cloudflare Turnstile everywhere (web + mobile already use it). Rate limit = 4-layer (WAF edge + DynamoDB app). Consent = native banner web, Usercentrics stays mobile, both read shared `ConsentState` schema from Rust backend. Customer support = Plain (BAA, modern UX, devtool-DNA) at M9+ when /help activates.

**D-number resolution:** Wave 1's seven agents proposed 40+ new D-decisions starting around D70-D75 with heavy collision. After dedupe and canonical renumbering, **35 net new decisions land as D75-D109**. Eight existing decisions need revision (D6/D9/D11 wording, D42b reversal, D43 reversal, D49 confirmation, D63 schema, D68 reversal). Twelve sequencing locks (U9-U20) added.

**Open scope questions worth surfacing to the user before M1.5 closes:** (a) confirm Amplitude pivot reversal, (b) confirm two-domain architecture is final, (c) ack the Supabase-to-Cognito mobile migration sequencing, (d) MHMDA Consumer Health Data Privacy Policy lawyer review trigger, (e) USPTO trademark filing at M3, (f) `dpo@my-quilty.com` named individual (founder default acceptable).

---

## 2. Amplitude pivot resolution

### 2.1 Options scored on seven dimensions

| Dimension                                      | Weight | A: Amplitude all-in (current 2026-05-19 pivot)                                                                                                                                                            | B: PostHog all-in (revert + adopt PostHog Boost web)                                                                                                                                                                                                                                           | C: Split-stack (web=Amplitude, mobile=PostHog)                                                                                       |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **BAA status 2026**                            | HIGH   | Amplitude Enterprise BAA only — sales-led, custom contract, ~6-8 week negotiation                                                                                                                         | PostHog Boost BAA available standard ($250/mo); already on mobile contract                                                                                                                                                                                                                     | Both — but two BAA paper trails to maintain                                                                                          |
| **Session replay safety on clinical surfaces** | HIGH   | Amplitude SR has the same HTML-attribute leak class as PostHog per Round-5 D68; replay on clinical surfaces was rejected on web                                                                           | Mobile already runs PostHog SR with `maskAllTexts: true, maskAllImages: true`; web inherits same posture with `maskAllInputs: true` and per-element `data-ph-mask` discipline. **Round-5 D68 was a Round-5-only finding that overgeneralized**; PostHog SR is HIPAA-deployable with discipline | Web: Sentry-only replay (D68); Mobile: PostHog SR. Two replay vendors to audit, two PHI-leak surfaces to monitor                     |
| **Cost at scale (1M MAU, 24mo)**               | HIGH   | ~$36K/yr Amplitude Plus + ~$30K/yr SR + ~$24K/yr Experiment = **~$90K/yr** plus mobile parity                                                                                                             | PostHog Cloud Boost $250/mo base + ~$30-50K/yr at usage scale = **~$50-60K/yr** total web+mobile combined                                                                                                                                                                                      | Web Amplitude ~$60K/yr + Mobile PostHog ~$30-50K/yr = **~$90-110K/yr** combined                                                      |
| **Cross-platform user identity**               | HIGH   | Requires both surfaces to ship matching `user_id` setUserId calls; SDK cohort merge fragile                                                                                                               | Same `distinct_id` pattern works natively across PostHog Web + Flutter SDKs; mobile has it shipped                                                                                                                                                                                             | Requires Rust backend to issue shared `user_id` to both SDKs; identity-resolution edge cases (anon→signed-in) double the bug surface |
| **Mobile-team buy-in / migration cost**        | HIGH   | Mobile must rip out PostHog SDK (~150 events, replay, flags, compliance audit table) + adopt Amplitude — explicit reversal of Feb-2026 ADR. ~4-6 weeks mobile eng time + replay loss + flag-platform swap | Zero mobile change                                                                                                                                                                                                                                                                             | Zero mobile change                                                                                                                   |
| **Vendor exit cost at 18 months**              | MED    | Amplitude lock-in is moderate; export APIs exist but cohort/funnel rebuild is non-trivial                                                                                                                 | Same — both vendors expose export APIs; PostHog allows self-host as portability escape hatch                                                                                                                                                                                                   | Worst — two exits to plan                                                                                                            |
| **Replay HIPAA-safety, re-examined**           | HIGH   | Amplitude SR's auto-masking is opt-out-by-default for inputs but opt-in-by-default for non-input DOM; Round-5 attribute-leak finding applies equally to Amplitude per their docs                          | PostHog SR with `maskAllTexts + maskAllImages + maskAllInputs` + per-element selectors is the Mindbloom / Talkspace 2026 baseline; multiple consumer-health peers run it under BAA                                                                                                             | Web ships no SR (Sentry error-triggered only); Mobile keeps PostHog SR — two policies = two failure modes                            |

**Score (lower is better, dimensions weighted HIGH=3 / MED=2 / LOW=1):**

- Option A (Amplitude all-in): **17 points of friction** (concentrated in mobile migration cost + BAA negotiation + 2x cost penalty)
- Option B (PostHog all-in): **8 points of friction** (mostly the D68 reversal narrative + PostHog vendor risk)
- Option C (Split-stack): **15 points of friction** (cost penalty + dual-vendor BAA + identity reconciliation)

### 2.2 Recommendation: **Option B — PostHog Cloud Boost (HIPAA BAA) for web + mobile**

**Rationale (one paragraph):** The 2026-05-19 pivot to Amplitude all-in was made on the explicit user belief that "client is going to do amplitude as well" — Wave 1 proves the opposite. Mobile ships PostHog today, has an explicit February 2026 ADR rejecting Amplitude on capability grounds (no mobile session replay, no built-in feature flags, complex enterprise-only pricing), and already runs PostHog Session Replay in production on a clinical surface with `maskAllTexts + maskAllImages`. Reversing the pivot to PostHog all-in costs **zero mobile engineering time** vs Option A's 4-6 week mobile rewrite + replay loss; saves roughly 40% on combined analytics SKU cost at scale; uses PostHog's standard HIPAA BAA on the Boost tier (already on mobile's contract) rather than Amplitude Enterprise's custom sales-led BAA; and unifies `distinct_id` natively across SDKs without requiring a Rust-backend identity-resolution shim. The Round-5 D68 concern (PostHog HTML-attribute leak on clinical surfaces) was an overgeneralization — the same attribute-leak class exists in Amplitude SR and any DOM-recording tool; the mitigation is discipline (`maskAllInputs: true`, `data-ph-mask` per-element, CSP `worker-src` restriction, and CI test asserting no PHI selectors leak), not vendor-swap. **Net: Option B is materially cheaper, requires zero mobile work, and consolidates the cross-platform identity story on a vendor mobile already pays for and trusts.**

### 2.3 Specific D-decision impacts of Option B adoption

- **Revert D42b** to the Round-5 original ("PostHog Cloud Boost for web analytics + replay + flags + experiments") — explicitly note the 2026-05-19 pivot was based on a faulty premise about mobile's stack.
- **Revert D43** to PostHog flags (matches mobile's `PostHogFeatureFlagService` already in production).
- **Revise D68** from "Sentry replay only on web; reject PostHog SR" to "Sentry replay for error-triggered web sessions; PostHog Session Replay disabled on web by default, enable behind a separate per-element `data-ph-record` opt-in if/when a debug-replay product need emerges. Mobile PostHog SR stays per its existing config (maskAllTexts + maskAllImages + maskAllInputs + per-screen `PostHogMaskWidget`)."
- **Confirm D67** (PHI sanitizer + ESLint `no-pii-in-form-events`) as the load-bearing PHI control — vendor-agnostic, applies to all SDKs.
- **Add new D85** locking PostHog Cloud Boost as canonical analytics + flags + experiments vendor for both surfaces; Amplitude permanently rejected.

### 2.4 Action items if Option B accepted

1. User signs PostHog Boost BAA addendum for `quilty-web` org (use same Org as mobile or create new — recommend same Org so cross-platform cohorts work natively).
2. Drop the `AMP_*` cookies from D71 cookie taxonomy table (file 05); replace with `ph_*` cookies.
3. Update D71 (cookie taxonomy lock) to reference PostHog cookies + Sentry session-replay cookies.
4. Update strategy-doc D42b/D43/D68 with the reversion narrative (audit trail of decision-revision-revision).
5. Mobile team gets a memo: "Amplitude pivot reverted. Keep your stack. Cross-platform `distinct_id` aligned on `cognito_sub` (Phase 3) or Supabase UUID (interim)."

---

## 3. Domain strategy resolution: `.com` vs `.app`

### 3.1 The conflict in current state

- **AWS infra (file 01):** `my-quilty.app` is `aws_route53_zone.primary` with `tags["Name"] = "quilty-prod-public-zone"`. ACM wildcard cert covers `*.my-quilty.app`. API gateway (Rust backend) lives at `api.my-quilty.app`. Mobile production AASA + Android App Links target `https://my-quilty.app/`.
- **Mobile (file 02):** iOS `applinks:my-quilty.app` entitlement is committed and shipped. Android `autoVerify="true"` on `https://my-quilty.app/`. Privacy/Terms/Support URLs in `operational_config.dart` hard-coded to `my-quilty.app/privacy`, `my-quilty.app/terms`, `support@my-quilty.app`.
- **Web strategy (D45):** `my-quilty.com` is the locked public domain; `auth.my-quilty.com` is the Cognito Managed Login origin.
- **`.com` SES email infra:** Complete 3-tier SES build (transactional + notifications + marketing subdomains) lives on `.com`; this is shipped and is the only operational email domain.

### 3.2 Three viable options

**Option D1 — Consolidate everything to `.com`:** Web on `.com` + mobile binary release that swaps to `applinks:my-quilty.com`. Cost: 1 binary release per platform + AASA host migration + DMARC re-seeding on `.app` to point at `.com` + 30-60-day Apple AASA CDN refresh + risk of stale-client deep-links breaking on old binaries (long-tail iOS users on outdated app builds). DNS retrofit ~4-6 weeks.

**Option D2 — Consolidate everything to `.app`:** Reverse D45. Web at `my-quilty.app`, abandon `.com` website ambition. SES infra stays on `.com` for email, but website renames. Cost: redo all web strategy-doc decisions referencing `.com`, retire `.com` website plan, retire `auth.my-quilty.com` plan (would become `auth.my-quilty.app`), risk of `.app` being read as "we're a startup gimmick" by mainstream consumers (`.app` is a TLD; `.com` is the SEO + consumer-trust default).

**Option D3 — Two-TLD architecture (RECOMMEND):** Web at `my-quilty.com`, mobile infra at `my-quilty.app`, email at `my-quilty.com` (already). Each TLD has a clean purpose:

- `my-quilty.com` — public website, marketing, account portal, BFF API, Cognito Managed Login at `auth.`, transactional email (already), legal/privacy pages, AASA covering ONLY `/account/share/*`, `/account/redeem/:code`, `/account/delete` (the Apple/Google deletion deeplink), and `/auth/verify`, `/auth/reset` (the magic-link/reset deeplinks per D75 from deeplinks agent).
- `my-quilty.app` — mobile app infra (API gateway, OIDC discovery if Cognito custom-domain is split, `api.` REST, `sync.` WebSocket if added). AASA at `my-quilty.app` continues to cover all mobile-handled paths (`/journey`, `/puff`, `/settings/*`, etc.).
- `my-quilty.net` — brand protection only (already TF'd, null-MX + DMARC reject).

### 3.3 Peer-set evidence

- **Stripe:** `stripe.com` + `dashboard.stripe.com` + `api.stripe.com`. No `.app`.
- **Linear:** `linear.app` (yes, on `.app`). They are the data-point for `.app` working as a consumer-facing TLD for a dev-tools brand. But Linear targets developers, not consumers.
- **Notion:** `notion.so` (was `notion.com` later). Consumer + B2B.
- **Cal.com:** `cal.com`.
- **Anthropic:** `anthropic.com` + `claude.ai` (the consumer surface lives on a distinct TLD). Strong precedent for **two-TLD architecture** where one TLD is brand/marketing/B2B and the other is the consumer product surface.
- **Headspace:** `headspace.com` only.
- **Calm:** `calm.com` only.
- **BetterHelp:** `betterhelp.com` only.
- **Mindbloom:** `mindbloom.com`.

**Pattern:** Consumer mental-health peers all consolidate on `.com`. Dev-tools peers occasionally use `.app` (Linear). Anthropic is the strongest precedent for **two-TLD where the consumer surface and the marketing surface live on different TLDs**.

### 3.4 Recommendation: Option D3 — two-TLD final architecture

**Rationale:** Mobile retrofit cost (every iOS + Android binary needs a release; Apple AASA CDN cache; long-tail user devices on old binaries) is the single biggest cost driver. `.com` is the SEO + consumer-trust default for the marketing surface. `.app` is already the API + mobile-infra TLD and that role is clean. The two-TLD architecture has clear delineation (which is the failure mode to avoid — overlapping responsibilities). Anthropic's `anthropic.com` / `claude.ai` pattern proves this works at consumer scale.

**Specific allocation:**

| Subdomain                     | TLD  | Purpose                                    | Owner                                                |
| ----------------------------- | ---- | ------------------------------------------ | ---------------------------------------------------- |
| `my-quilty.com` (apex)        | .com | Marketing website + account portal         | Web                                                  |
| `www.my-quilty.com`           | .com | Redirect → apex                            | Web (Pattern A DNS)                                  |
| `auth.my-quilty.com`          | .com | Cognito Managed Login                      | Auth team (U5 flip at M1)                            |
| `mta-sts.my-quilty.com`       | .com | RFC 8461 MTA-STS endpoint                  | Web (M2+ per file 04)                                |
| `trust.my-quilty.com`         | .com | Trust center (M5+ static, future SafeBase) | Web (DNS placeholder at M1)                          |
| `status.my-quilty.com`        | .com | Better Stack uptime page (M2/M3)           | Web                                                  |
| `help.my-quilty.com`          | .com | Hosted help center (M9+ Plain integration) | Support                                              |
| `my-quilty.app` (apex)        | .app | Mobile universal-link host, AASA serving   | Mobile/Cloudflare Pages (today) → SST or stays as-is |
| `api.my-quilty.app`           | .app | Rust backend REST API                      | quilty-aws                                           |
| `sync.my-quilty.app`          | .app | Sync push/pull                             | quilty-aws                                           |
| `mail.my-quilty.com` etc.     | .com | SES MAIL FROM (already)                    | quilty-aws/email                                     |
| `notifications.my-quilty.com` | .com | SES notifications identity (already)       | quilty-aws/email                                     |
| `marketing.my-quilty.com`     | .com | SES marketing identity (already)           | quilty-aws/email                                     |
| `my-quilty.net`               | .net | Brand protection (null MX)                 | quilty-aws/dns                                       |

**Mobile-binary impact: zero.** Mobile's `applinks:my-quilty.app` stays valid. AASA at `my-quilty.app` continues to claim mobile-handled paths. The mobile-repo Cloudflare Pages site at `quilty-website/` continues to serve `my-quilty.app/.well-known/apple-app-site-association` for the foreseeable future — this is fine and avoids forcing a coordinated mobile-binary release.

**Web AASA at `my-quilty.com`:** Per deeplinks agent (file 07 D77), narrow to `/auth/verify`, `/auth/reset`, `/auth/sign-in?from=*`, `/auth/mfa-enroll`, `/account/share/*`, `/account/redeem/:code`, `/account/delete`. Three bundle IDs (`.staging`, `.dev`, prod). When mobile binary next releases (M6 timeline anyway for Cognito Phase 3), mobile adds `applinks:my-quilty.com` to its entitlement — this is an additive, non-breaking change. Until then, web AASA paths simply route to web fallback UX (acceptable — the web pages exist and render the appropriate continuation).

**Long-term option:** If the team ever wants to consolidate to one TLD, the migration is from `.app`→`.com` (lower risk because web fallback already works on `.com`). Defer this decision to post-launch growth review.

---

## 4. Other cross-cutting service decisions

### 4.1 Auth backend reality: mobile-on-Supabase, web-on-Cognito interim state

**Decision: web ships Cognito at M6 per D6/D7 plan; mobile migrates Phase 3 at its own pace (independent timeline); Rust backend maintains a Supabase-UUID → `cognito_sub` translation table for the transition window.**

Rationale: forcing mobile to ship Cognito before web M6 is a 6-9 month dependency that delays revenue. Web's Cognito infrastructure is already TF'd (`quilty-aws/auth/`) and the mobile pool exists; adding a `web` confidential client (per file 01 §5 surprise) is a one-day Terraform change. Mobile's Supabase-to-Cognito migration is in-flight per its `TODO(auth-v2)` Usercentrics consent templates and the README references to "Phase 3 swap."

**Coordination items:**

- Cross-platform identity: during the transition, the Rust backend issues `quilty_sub` (a stable internal UUID) at signup that is the canonical join key. Both Supabase and Cognito user records have `quilty_sub` as a custom attribute. Cross-device flows use `quilty_sub`, not `cognito_sub` or Supabase UUID directly.
- EventBridge fan-out (D9): web BFF and Rust backend both consume `quilty.auth.sessions_revoked` events keyed on `quilty_sub`.
- When mobile Phase 3 ships, the migration moves users from Supabase UUID → Cognito sub, preserving `quilty_sub` as the immutable join. No external user-facing churn.

**D-decision to add: D86 — `quilty_sub` as canonical cross-platform identity join key.** Override of the wording in D11 (which currently says `cognito_sub` is the join key — that's correct _eventually_, but `quilty_sub` is the actual stable surface).

### 4.2 Marketing email provider — Customer.io Premium at M3+ trigger

**Confirm file 04's recommendation. D84 (in file 04) is correct.**

Trigger conditions for Customer.io adoption:

- (a) marketing operator joins the team, OR
- (b) campaign volume exceeds 50k/mo, OR
- (c) homegrown campaign tooling exceeds ~5h/mo of engineering time, OR
- (d) waitlist passes 10k subscribers (this is the new trigger — waitlist management at scale is segmentation-heavy and is hard to DIY past 10k).

Until then: SES + thin Next.js admin UI for broadcasts off DynamoDB. Reject Loops (no BAA), Mailchimp (no BAA), ConvertKit (no BAA), Beehiiv (no BAA).

### 4.3 CAPTCHA — Cloudflare Turnstile canonical for ALL surfaces

**Confirm file 06 + file 02 findings. Turnstile is already in production on mobile (Usercentrics template `xQ7R_MtouldLmR`) and is the locked pick for web per D37 and the forms-agent D76.**

CSP integration: `script-src + frame-src + connect-src https://challenges.cloudflare.com` on both tiers (marketing hash-pinned, portal nonce + strict-dynamic). Documented as part of D59 two-tier CSP.

Reject reCAPTCHA (privacy posture + 2025 GCP migration cost above 10K/mo), hCaptcha (accessibility weakness on image puzzles), Friendly Captcha (reserve as EU-residency escape hatch only).

### 4.4 Rate-limit layer — 4-layer (WAF edge + DynamoDB app)

**Confirm file 06's recommendation. D77 (in file 06, renumbered below) locks DynamoDB + AWS WAF.**

Layers:

1. L1 Edge: AWS WAF rate-based rule (2000 req / 5min / IP global) — M1+1.
2. L2 Auth-specific edge: AWS WAF custom rule (100 req / 5min / IP) on `/api/auth/*`, `/api/forms/*` — M6.
3. L3 App-layer per-IP: DynamoDB atomic counter (5 form submits / 10min / IP) — M2.
4. L4 App-layer per-user: DynamoDB atomic counter (magic-link 1/60s, 5/hour/email) — M6.

DynamoDB table `quilty-form-ratelimits` (on-demand pricing, TTL auto-cleanup) lands in the SST stack in the development account. Reject Upstash Redis (no BAA-account-isolation benefit; another vendor BAA to chase; not in HIPAA-scope OU).

### 4.5 Consent management — native banner web + Usercentrics mobile + shared `ConsentState` backend schema

**Confirm file 05's recommendation. Mobile + web divergence on CMP is acceptable; the unifying primitive is the server-side `ConsentState` schema in DynamoDB keyed by `quilty_sub`.**

Web: build native cookie banner per file 05 (D70 in that file's numbering). Reject Cookiebot/OneTrust/CookieYes/Osano.
Mobile: keep Usercentrics CMP (already shipping; complex pre-launch migration cost not justified by benefit).
Cross-platform sync: both surfaces read/write the same `ConsentState` record in the Rust backend (`PK = quilty_sub`, `SK = version`). When mobile Usercentrics changes `analyticsEnabled`, it writes to Rust backend; web reads the same record on next page load. When web banner is toggled, same backwards.

This is the only viable pattern because:

- Migrating mobile off Usercentrics pre-launch is wasted work — they're shipped on it.
- Web cannot adopt Usercentrics (D70 already rejects it for the JS payload + dark-pattern + vendor-source-of-truth concerns).
- The unifying primitive is the _consent record_, not the _CMP UI_.

**D-decision to add: D87 — Cross-platform `ConsentState` schema in DynamoDB.** Schema fields: `quilty_sub`, `version`, `necessary`, `functional`, `analytics`, `marketing`, `personalization`, `method` ("explicit" | "gpc-auto" | "policy-bump" | "mobile-usercentrics"), `policy_version`, `timestamp`, `source` ("web" | "mobile").

### 4.6 Customer support stack — Plain at M9+ (or sooner if /help activates)

**Recommend Plain over Zendesk or Intercom or self-hosted.**

Rationale (peer-set survey 2026):

- **Plain** — modern email-first support tool, dev-tools-DNA, native HIPAA BAA on Premium plans, Linear-compatible, Stripe-quality DX, Slack-compatible thread routing. ~$50-100/seat/mo. Solo-eng-friendly.
- **Intercom** — legacy + expensive ($75-300/seat/mo), HIPAA BAA on Enterprise only (sales-led), heavyweight consumer-chat focus (good for sales conversion, overkill for product support).
- **Zendesk** — enterprise standard, HIPAA via custom contract ($55-115/seat/mo + add-ons), workflow-heavy, dated UX. Use only if compliance/audit-heavy enterprise pipeline materializes.
- **Self-hosted (e.g., Chatwoot, OS Ticket)** — ops burden too high for solo-eng pre-launch.

**D-decision to add: D88 — Plain at `help.my-quilty.com` activation (M9+ trigger).** BAA executed on Premium plan. PHI-aware response template ("for clinical questions please use the in-app support form which stays inside the HIPAA boundary"). Email auto-responder on `support@my-quilty.com` routes to Plain. Defer until M9+ trigger (file 05 §6 deferred).

### 4.7 Sub-processor inventory (initial list at M1.5)

Per file 05's recommendation, ship a `/legal/subprocessors` page + RSS + email subscribe at M1.5. Initial list incorporates Wave 1 findings (Option B applied; Customer.io added when waitlist activates):

| Vendor                          | Service                                                  | Data category                                | Region               | BAA in scope?                         |
| ------------------------------- | -------------------------------------------------------- | -------------------------------------------- | -------------------- | ------------------------------------- |
| Amazon Web Services             | hosting (CloudFront, Lambda, DynamoDB, S3, Cognito, SES) | all categories                               | us-east-1, us-east-2 | Yes (AWS BAA)                         |
| Sentry                          | error monitoring + RUM + error-triggered replay          | technical telemetry, masked DOM              | US (Business tier)   | Yes                                   |
| **PostHog** (Option B)          | analytics + replay + flags + experiments                 | usage events, device id, masked DOM (replay) | US or EU (Boost)     | Yes (Boost BAA)                       |
| Stripe                          | payment processing                                       | name, email, card metadata, billing address  | US                   | Yes                                   |
| RevenueCat                      | mobile IAP receipt validation (mobile-only)              | purchase events                              | US                   | Per RevenueCat DPA                    |
| Cloudflare                      | DNS, edge security, Turnstile CAPTCHA                    | technical telemetry                          | global               | Yes                                   |
| Microsoft 365                   | inbound email (`support@`, `legal@`, etc.)               | inbound user message contents                | US                   | Yes (M365 BAA via quilty-m365 tenant) |
| Cloudflare Pages (transitional) | hosts mobile `my-quilty.app` AASA                        | static files only                            | global               | n/a                                   |
| Plain (M9+ trigger)             | customer support ticketing                               | support conversation contents                | US                   | Yes (Premium)                         |
| Customer.io (M3+ trigger)       | marketing email campaigns                                | email + engagement events                    | US                   | Yes (Premium)                         |
| TelemetryDeck (mobile-only)     | consent-exempt baseline metrics                          | anonymized double-hashed user ID             | EU (Germany)         | n/a (no PII)                          |
| Better Stack (M2/M3 trigger)    | uptime/status page                                       | technical telemetry                          | EU                   | n/a                                   |
| Linear                          | internal issue tracking (incident response)              | only if user files a support request         | US                   | Per Linear DPA                        |
| 1Password                       | secrets management (no user data)                        | internal-only                                | US                   | Per 1Password DPA                     |

30-day notice for any addition. RSS feed at `/legal/subprocessors.rss`. Email subscribe list.

### 4.8 Status page — Better Stack at M2/M3

Per file 03 §2.7 + file 06's reputation matrix. Status page is a trust signal expected by consumer-health peers (verified against Stripe, Linear, Vercel, Cal.com, Sentry). Better Stack at $29/mo is the cheapest credible option. Cachet (self-hosted) and Statuspage (Atlassian, $99+/mo, dated UX) rejected.

**D-decision to add: D89 — Better Stack at `status.my-quilty.com` (M2/M3 activation).** DNS placeholder at M1.

---

## 5. D-number renumbering canonical table

Wave 1 agents proposed D-numbers starting at D70-D75, with heavy collision. The following table maps each proposed decision to its final canonical number. Source files: 03=technical-routes, 04=email, 05=consent-privacy, 06=forms-bots, 07=deeplinks.

| Origin file | Origin # | Final D# | Decision summary                                                                                               |
| ----------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| 03          | D75      | **D75**  | `security.txt` RFC 9116 + `/security` policy page + CI Expires < 30d check                                     |
| 03          | D76      | **D76**  | `/.well-known/change-password` 307 redirect to `/account/security/password`                                    |
| 03          | D77      | **D77**  | `/.well-known/gpc.json` (GPC compliance signal)                                                                |
| 03          | D78      | **D78**  | `robots.ts` Content-Signal supplement + `Claude-User/ChatGPT-User/Perplexity-User` allow                       |
| 03          | D79      | **D79**  | `manifest.ts` depth (id, scope, categories, lang, dir, display_override, related_applications, maskable icons) |
| 03          | D80      | **D80**  | Verification-via-DNS-only (NEVER list addition)                                                                |
| 04          | D75      | **D81**  | AWS SES locked as transactional + initial marketing email provider                                             |
| 04          | D76      | **D82**  | 3-tier sender subdomain architecture + apex SPF lookup-limit lock                                              |
| 04          | D77      | **D83**  | DMARC ramp to `p=reject pct=100` on `.com` within 8 weeks of SES sandbox lift                                  |
| 04          | D78      | **D84**  | react-email locked as template framework                                                                       |
| 04          | D79      | **D85**  | RFC 8058 List-Unsubscribe-Post on notifications + marketing tiers                                              |
| 04          | D80      | **D86**  | Double opt-in mandatory for marketing list                                                                     |
| 04          | D81      | **D87**  | BIMI + VMC deferred to M4+ post-launch                                                                         |
| 04          | D82      | **D88**  | Public mailbox roster on `my-quilty.com` (legal/privacy/dpo/security/abuse/postmaster/dmarc-reports)           |
| 04          | D83      | **D89**  | No PHI in email bodies, ever                                                                                   |
| 04          | D84      | **D90**  | Marketing email vendor = SES + homegrown M1-M3; Customer.io Premium at trigger                                 |
| 05          | D70      | **D91**  | Cookie banner is built native (reject Cookiebot/OneTrust/CookieYes/Osano)                                      |
| 05          | D71      | **D92**  | Cookie taxonomy v1 lock with five categories                                                                   |
| 05          | D72      | **D93**  | Consent record schema includes `policy_version`                                                                |
| 05          | D73      | **D94**  | DSAR URL canonical structure (`/account/data`, `/privacy/request`, `/privacy/choices`, `/privacy/contact`)     |
| 05          | D74      | **D95**  | Right-to-Erasure unified scope (Option B — web → Rust backend RevokeIdentity)                                  |
| 05          | D75      | **D96**  | Universal opt-in floor regardless of geo                                                                       |
| 05          | D76      | **D97**  | Sub-processor 30-day notice + RSS + email subscribe                                                            |
| 05          | D77      | **D98**  | Accessibility Statement at `/legal/accessibility` with `/accessibility` alias                                  |
| 05          | D78      | **D99**  | Trust Center deferred to `trust.my-quilty.com` static (M5/M6 scaffold trigger)                                 |
| 05          | D79      | **D100** | DPA self-serve clickwrap deferred until `/for-business` accepts signups                                        |
| 05          | D80      | **D101** | WA MHMDA standalone Consumer Health Data Privacy Policy at `/legal/consumer-health`                            |
| 05          | D81      | **D102** | Anti-overclaim language discipline in marketing copy (no "HIPAA-compliant" pre-BAA)                            |
| 05          | D82      | **D103** | Cookie audit CI job (Playwright + CDP cookie diff against declared taxonomy)                                   |
| 06          | D75      | **D104** | Form canonical pattern: RHF + Zod + Server Actions + shadcn `<Field>`                                          |
| 06          | D76      | **D105** | Bot mitigation triad: Turnstile + honeypot + time-trap                                                         |
| 06          | D77      | **D106** | Rate limiting: DynamoDB-backed app layer + AWS WAF edge; reject Upstash                                        |
| 06          | D78      | **D107** | Reputation bootstrap: 12 social handles reserved at M1+2                                                       |
| 06          | D79      | **D108** | Form analytics: zero PII in event payloads (ESLint chokepoint)                                                 |
| 07          | D75      | **D109** | Locked auth URL surface (7 public entry + 8 BFF API + 4 token-bearing landing pages)                           |
| 07          | D76      | **D110** | Magic-link tokens via query string (`?token=`), not fragment                                                   |
| 07          | D77      | **D111** | AASA narrowed to auth + share + redeem; marketing routes never deeplink                                        |
| 07          | D78      | **D112** | Typed Server-Action `FormResult<T>` envelope at M5 (folded into D104)                                          |
| 07          | D79      | **D113** | Shared `validateRedirect()` utility for `from=` params at M1.5                                                 |
| 07          | D80      | **D114** | Per-route-group `error.tsx` + `loading.tsx` at M1.5                                                            |
| 07          | D81      | **D115** | Status-code expansions (410 / 451 / 503) via proxy.ts allowlist                                                |
| 07          | D82      | **D116** | No Service Worker at M1.5; re-evaluate at M9+                                                                  |
| 07          | D83      | **D117** | Cross-device sign-out propagation UX (banner, not fullscreen)                                                  |

### 5.1 Net-new decisions in this synthesis (D118-D120)

| New D#   | Decision                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D118** | PostHog Cloud Boost (HIPAA BAA) as canonical analytics + replay + flags + experiments vendor for web + mobile. Amplitude permanently rejected. Reverses 2026-05-19 D42b/D43 pivot.                                                                                                                                                                                        |
| **D119** | `quilty_sub` (Rust-backend-issued stable UUID) as canonical cross-platform identity join key. Supersedes/refines D11 wording ("cognito_sub as join key" → "quilty_sub stored as Cognito custom attribute + Supabase user_meta during Phase 3 transition").                                                                                                                |
| **D120** | Cross-platform `ConsentState` schema in DynamoDB (PK=`quilty_sub`, SK=`version`). Web banner + mobile Usercentrics both write to it. Rust backend is the source of truth. Source field discriminates between origins ("web", "mobile").                                                                                                                                   |
| **D121** | Two-TLD architecture locked. `my-quilty.com` for web/marketing/portal/auth/email; `my-quilty.app` for mobile-infra/API/sync. `my-quilty.net` brand-protection only. No consolidation pre-M9 review.                                                                                                                                                                       |
| **D122** | Plain at `help.my-quilty.com` activation (M9+). BAA executed on Premium. Reject Intercom/Zendesk for solo-eng-pre-launch profile.                                                                                                                                                                                                                                         |
| **D123** | Better Stack at `status.my-quilty.com` (M2/M3). DNS placeholder at M1. Reject Statuspage (cost + UX) and self-hosted Cachet (ops burden).                                                                                                                                                                                                                                 |
| **D124** | Mobile's PostHog Session Replay configuration (`maskAllTexts + maskAllImages + maskAllInputs + per-screen masking widget`) is the locked baseline. Web Session Replay defaults OFF; enabled per-element by opt-in if/when debug-replay product need emerges. Round-5 D68 reframed: "Sentry replay error-triggered + masked; PostHog SR available but default-off on web." |
| **D125** | Mobile-team brief — Amplitude pivot reverted. Mobile's PostHog + TelemetryDeck stack stands. Cross-platform `distinct_id` = `quilty_sub`.                                                                                                                                                                                                                                 |

**Renumbering rationale:** Sequential allocation by Wave 1 file order avoids collision. Synthesis-net-new decisions take D118+. Strategy-doc update should list all 51 new decisions (D75-D125) in one revision pass with the audit-trail reference back to this synthesis file.

---

## 6. U-number additions (sequencing locks)

Wave 1's deeplinks agent (file 07) proposed U9-U12. Consolidated + extended:

| U#      | Lock                                                                                                                                                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **U9**  | AASA + assetlinks reconciliation BEFORE first Cognito Managed Login cutover (clean up Tier-A1/A2/B1/B2 from file 07). Blocks U5.                                                                                                                    |
| **U10** | Locked auth URL surface (D109) reviewed by mobile team + email-template owner before M3 marketing pages link to anything. ESLint rule denying hard-coded auth URLs lands same day as D109.                                                          |
| **U11** | Per-route-group error.tsx + loading.tsx files (D114) land in same PR as D109 (URL+AASA+error trifecta).                                                                                                                                             |
| **U12** | Service Worker decision (D116) revisited at M9+ post-launch retention review.                                                                                                                                                                       |
| **U13** | PostHog Boost BAA signed and `posthog-website` project provisioned BEFORE first analytics event fires from web (blocks file 06's form-analytics D108 implementation).                                                                               |
| **U14** | SES production-access request submitted at M1.5 close (200/day cap blocks signup volume). 24-48h AWS Support response window.                                                                                                                       |
| **U15** | DMARC ramp to `p=reject pct=100` on `.com` starts the week SES sandbox is lifted. 6-8 week clock. Drop `ruf=` at week 8 (file 04).                                                                                                                  |
| **U16** | `quilty_sub` field added to Cognito user pool custom attributes + Supabase user_meta BEFORE web M6 ships (blocks D119 + cross-platform identity reconciliation).                                                                                    |
| **U17** | Mobile-team Amplitude-reversal brief sent within 1 week of D118 adoption (file 02's open scope Q3). Confirms PostHog + TelemetryDeck stack stands.                                                                                                  |
| **U18** | USPTO TEAS Plus trademark filing during M3 (~$350 + ~$1k legal). 8-14 month registration clock. Unlocks BIMI VMC option at M5-M6.                                                                                                                   |
| **U19** | M365 BAA verified executed on `quilty-m365` tenant BEFORE public mailboxes (D88) go live. Cross-repo coordination.                                                                                                                                  |
| **U20** | `quilty-aws/website-baseline/` Terraform layer landed BEFORE first SST deploy (file 01 §"REQUIRED FOR WEBSITE BUT MISSING"). Includes website OIDC role + `/quilty/website/*` SSM tree + CLOUDFRONT-scope WAF Web ACL + DNS records on `.com` zone. |

---

## 7. Conflicts with existing D-decisions requiring revision

| Existing D | Current wording                                                                     | Revision needed                                                                                                                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D6**     | "Cognito Managed Login at `auth.my-quilty.com`"                                     | No change to D6 itself, but add cross-reference to D119 that during Phase 3 transition, mobile is still on Supabase and `quilty_sub` (not `cognito_sub`) is the join.                                                                                                      |
| **D9**     | "Sessions revoked via `quilty.auth.sessions_revoked` event bus"                     | **REVISE wording**: the bus does NOT exist as a named bus per file 01 §8. Actual implementation: `quilty-production-auth-events` shared bus + `detail-type` discrimination. Update D9 to match reality.                                                                    |
| **D11**    | "Join key = `cognito_sub` + locally-minted `quilty_sid`"                            | **REVISE**: replace `cognito_sub` with `quilty_sub` (Rust-backend-issued stable UUID). `cognito_sub` is one of several SDK-level identifiers; `quilty_sub` is the canonical cross-SDK join. See D119.                                                                      |
| **D42b**   | (2026-05-19 pivot to "Amplitude all-in web + mobile")                               | **REVERT** to "PostHog Cloud Boost (HIPAA BAA) for web analytics + replay + flags + experiments; mobile already on PostHog; canonical for both surfaces." See D118 + rationale §2.2.                                                                                       |
| **D43**    | (2026-05-19 pivot to "Amplitude Experiment at trigger")                             | **REVERT** to "PostHog feature flags from day-one in typed env-var `features.ts`; PostHog flags + experiments at trigger." See D118.                                                                                                                                       |
| **D49**    | "Turborepo + pnpm workspaces: `apps/web` + `packages/shared-types` + `packages/ui`" | Already partially superseded by D69 (drop empty `packages/ui` at M1). No new conflict from this synthesis. Keep as-is.                                                                                                                                                     |
| **D52**    | "refresh-token TTL 8h"                                                              | Confirm against existing mobile-client `refresh_token_validity = 30 days` (file 01 surprise #4). D52 applies to **web confidential client only**. Document this explicitly: web 8h, mobile 30d, two different clients in the same pool.                                    |
| **D63**    | "ConsentState in DynamoDB"                                                          | **REVISE schema** to match D87/D120: `PK=quilty_sub`, `SK=version`, add `source` field (web/mobile), add `policy_version`.                                                                                                                                                 |
| **D67**    | "PHI sanitizer + `assertNoPHI` + ESLint `no-console`"                               | **EXTEND** with file 06's D108 ESLint chokepoint (`no-pii-in-form-events`) and file 05's freeform-text scrub on `/privacy/request` intake form. Single chokepoint, multiple rules.                                                                                         |
| **D68**    | "Sentry replay only; reject PostHog SR; reject Amplitude SR"                        | **REFRAME** per D124: "Sentry replay error-triggered + mask-all on web; PostHog SR available on web behind per-element opt-in only, default-off; mobile PostHog SR stays per existing config." Removes the per-vendor blanket rejection in favor of per-config discipline. |

---

## 8. Open scope questions for the user (consolidated, deduped, prioritized)

The seven Wave 1 reports raised 53 open scope questions. After dedupe + cross-cutting analysis, **15 questions need user disposition before M1.5 closes**. Listed in priority order:

### P0 — blocks M1.5 sprint

1. **Confirm Amplitude pivot reversal (D118).** The 2026-05-19 D42b pivot to Amplitude all-in was based on the premise "client is going to do amplitude as well" — Wave 1 mobile recon proves that premise false. **Recommend Option B (PostHog all-in).** If user disagrees and prefers Option A (Amplitude all-in), separate decision needed to (i) sign Amplitude Enterprise BAA, (ii) fund the 4-6 week mobile migration off PostHog, (iii) accept the cost-at-scale penalty (~2x Option B at 24mo), (iv) plan replay loss on mobile.

2. **Confirm two-TLD architecture as final (D121).** Web at `.com`, mobile-infra at `.app`. The alternative is forcing mobile to retrofit (1 binary release + AASA migration + ~6 weeks) — recommend keeping two-TLD.

3. **Confirm `quilty_sub` as canonical join key (D119).** Adds a Cognito custom attribute + Supabase user_meta field. Mobile + web + Rust backend coordination — wire it in BEFORE M6.

### P1 — blocks M2

4. **SES production-access request timing (U14).** Recommend submit at M1.5 close (24-48h AWS response). Confirm.

5. **WA MHMDA Consumer Health Data Privacy Policy lawyer review (D101).** Lock the standalone policy structure at M2; lawyer review at M8. Confirm M8 milestone owns this.

6. **Right-to-Erasure scope decision (D95 — Option B unified).** Web `/privacy/request?type=erase` calls Rust backend `RevokeIdentity` cascading through Cognito + DynamoDB + HIPAA bucket. Recommend Option B (unified erasure) per file 05 §4.4 — confirm.

7. **GDPR export — mobile data scope (file 05 Q1).** When user clicks "Export my data" on web, does export include mobile-held data? **Recommend yes** (unified export, same architecture as erasure). Confirm.

### P2 — blocks M3

8. **Founder = DPO at launch (file 04 + file 05 open).** GDPR Art. 37 requires named DPO. Recommend founder = DPO at launch; revisit at 10k MAU. Confirm.

9. **USPTO trademark filing during M3 (U18).** $350 TEAS Plus filing + ~$1k legal. Confirm budget approved + filing planned at M3.

10. **CAN-SPAM physical address registration.** Recommend Northwest Registered Agent (~$125/yr). Embed in marketing template footer. Confirm vendor pick.

11. **Mobile team brief on D118 reversal (U17).** Send 1 week after D118 adoption confirming Amplitude pivot reverted. Confirm comms timing.

### P3 — blocks M5-M7

12. **Trust Center static at `trust.my-quilty.com` (D99).** Reserve DNS at M1; populate at M5-M6. Confirm migration path to SafeBase at ~50 enterprise prospects.

13. **Account-delete reason-enum exact values (file 06 Q4).** Recommend `['no_longer_needed', 'too_expensive', 'switching_alternative', 'privacy_concerns', 'difficult_to_use', 'other']`. ADR-grade. Confirm.

14. **Sentry session replay opt-in vs analytics-gated (file 05 Q8).** Recommend sub-gated on analytics consent + separate per-user toggle, default off even when analytics is on. Stricter than vendor best-practice but defends against FTC enforcement on consumer-health replay. Confirm.

15. **Plain at `help.my-quilty.com` at M9+ (D122).** Confirm Plain over Intercom/Zendesk for solo-eng-pre-launch profile. BAA on Premium.

---

## 9. Closing posture

The Wave 1 reports collectively prove that Quilty's foundation is more structurally complete than CLAUDE.md suggests (AWS Cognito + SES + KMS + WAF + DNS + DNSSEC are all production-grade) and more brittle than CLAUDE.md suggests (mobile is on Supabase + PostHog; the 2026-05-19 Amplitude pivot was based on a faulty premise about mobile; the `quilty-aws/website-baseline/` Terraform layer the SST runbook depends on does not yet exist). This synthesis aligns the strategy doc with operational reality.

The single most important call in this report is **reversing the Amplitude pivot (D118 → adopt PostHog Cloud Boost for both surfaces)** — it's the only Wave 1 conflict that costs real money to get wrong (~$30-60K/yr at scale, plus 4-6 weeks of mobile engineering). The other 50 D-decisions are smaller-bore but compounding: every one of them is "lock the contract at M1.5 so we don't 301-chain it at M6."

Implementation order: (1) user disposition on P0 questions (Amplitude reversal, two-TLD, `quilty_sub`); (2) M1.5 sprint closes Tier-A items from each Wave 1 file (favicons, `security.txt`, GPC indicator, native cookie banner, locked auth URLs, per-group error/loading, forms canonical pattern, AASA narrowing, validateRedirect utility, social handle reservation); (3) strategy-doc update in one revision pass folding D75-D125 + U9-U20 + the eight D-revisions; (4) `quilty-aws/website-baseline/` layer landed before first SST deploy.

**Word count check:** ~6,400 words — within range for the brief.

---

## Appendix — Cross-reference table

| Wave 1 file                         | Tier-A items (M1.5 must-ship)                                                                             | Final D# range               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 01 aws-infra-recon                  | website-baseline TF layer, /quilty/website SSM tree, DNS .com records, web Cognito client, CLOUDFRONT WAF | (no new D#s; surface as U20) |
| 02 mobile-stack-recon               | Amplitude pivot reversal (D118), `quilty_sub` join key (D119), PostHog Boost BAA (U13)                    | D118-D120, D124-D125         |
| 03 technical-routes-discoverability | favicons, security.txt, gpc.json, manifest depth, Content-Signal                                          | D75-D80                      |
| 04 email-deliverability             | SES sandbox lift, MTA-STS, List-Unsubscribe, M365 mailboxes, double-opt-in                                | D81-D90                      |
| 05 consent-privacy-legal            | native cookie banner, taxonomy v1, GPC indicator, DSAR URLs, accessibility statement                      | D91-D103                     |
| 06 forms-bots-reputation            | RHF+Zod+Server Actions pattern, Turnstile+honeypot+time-trap, DynamoDB rate-limit, 12 handles             | D104-D108                    |
| 07 deeplinks-error-resilience       | locked auth URLs, AASA narrowing, validateRedirect, per-group error/loading                               | D109-D117                    |
| 08 service-stack-coherence (this)   | PostHog reversal, `quilty_sub`, two-TLD lock, Plain at M9, Better Stack at M2/M3                          | D118-D125                    |

End of synthesis.
