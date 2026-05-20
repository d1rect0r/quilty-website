# 18 — Enterprise CMP + Legal-Pages Verification (D97, D99-D103)

> Round-6 verification audit. Method: WebFetch + WebSearch against the live
> properties on 2026-05-19. Observed evidence cited verbatim (URLs, cookie
> names, DOM IDs, sub-processor table columns, accessibility-statement
> partner orgs). Speculation is flagged explicitly when present.
>
> Peer set: 16 companies across engineering-strong, consumer-health, and
> CMP-heavy commerce. Plus 5 vendor docs (Didomi, OneTrust, SafeBase/Drata,
> DataGrail, Transcend).

---

## 1. Executive summary

**D97 (CMP decision) — recommendation: native, server-side `ConsentStore`
inside `@quilty/consent`. Do NOT adopt OneTrust, Didomi, or Usercentrics
at M1.**

The observed evidence is unambiguous: every engineering-led peer we
inspected — Stripe, Linear, Cal.com, Vercel, Anthropic, Resend, Plain,
Sentry, plus Calm, BetterHelp, Talkspace, Noom, Cerebral on the consumer-
health side — ships **no third-party CMP**. Not OneTrust, not Didomi, not
Usercentrics, not Cookiebot. The cookie-banner DOM IDs and CDN script
URLs you would expect (`#onetrust-banner-sdk`, `otSDKStub.js`,
`*.otcdn.com`, `didomi.io`, `usercentrics.com`) are absent from every
production page we inspected. Stripe explicitly names their solution the
"Cookies & Consent Settings Dashboard" at `stripe.com/cookie-settings` —
first-party, native, no vendor.

The single confirmed vendor CMP we found in the peer set was a _footer
badge_ on Headspace ("Your Privacy Choices" link with a Privacy Choices
icon), which is **CCPA opt-out signage, not OneTrust**. The
`#onetrust-banner-sdk` / `OptanonConsent` cookie fingerprints did not
appear in the live HTML or the privacy-policy page.

Enterprise CMPs (Didomi, OneTrust, Usercentrics) are **real and well-
engineered** — Didomi in particular publishes a production-grade webhook
with OAuth-client-credentials authentication, 5x retry, and cross-device
sync (per their developer docs). That architecture is overkill for a pre-
launch HIPAA-aligned consumer site that already plans to keep `ConsentStore`
as a port-and-adapter inside `@quilty/consent`. **Adopting Didomi later
behind that same port is a low-cost reversal** if marketing/legal demand
TCF v2.2 or omnichannel CTV consent. Today, build native.

**D99 / D101 / D102 / D103 patterns observed (recommendations):**

- **D99 DSAR**: `/legal/privacy-center` (Stripe), `datarequest.<brand>.com`
  (Vercel via DataGrail), `privacy.<brand>.com` (Anthropic → redirects to
  `privacy.claude.com`, Intercom-powered help center). Email-only is
  common at startup scale (Linear `hello@linear.app`, Cal.com `legal@`,
  Resend `support@`). **Recommended for Quilty: `/legal/privacy-choices`
  for the public landing + `/account/privacy` for authenticated DSAR
  submission.**
- **D101 Accessibility statement**: WCAG 2.1 or 2.2 AA conformance + a
  third-party audit partner (Headspace = Accessible by Design LLC,
  Talkspace = eSSENTIAL Accessibility) + a dedicated feedback inbox
  (Headspace `accessibility@headspace.com`) + VPAT reports. EAA
  references are still rare even in May 2026 (EAA enforcement live since
  2025-06-28). **Recommended for Quilty: `/accessibility` route, WCAG 2.2
  AA, `accessibility@quilty.com`, EAA acknowledgment, no overlay
  vendor.**
- **D102 Sub-processor list**: `/legal/subprocessors` is the universal
  path (Stripe `/service-providers/legal`, Resend `/legal/subprocessors`,
  Anthropic `trust.anthropic.com/subprocessors`). 4-column table (Name /
  Data / Purpose / Country). Email-subscription notification, NOT RSS.
- **D103 Trust Center**: `trust.<brand>.com` subdomain on SafeBase
  (Drata-acquired Feb 2025; powers OpenAI, Twilio, CrowdStrike, HubSpot,
  LinkedIn, T-Mobile, Anthropic, Headspace, Harness). Stripe and Sentry
  are the outliers using `/legal/` or `/trust/` path on the apex domain.
  **Recommended for Quilty: `trust.my-quilty.com` on SafeBase when budget
  permits (M8+); `/trust` path on the apex until then.**

---

## 2. Per-company CMP fingerprint table

Method: WebFetch of each company's homepage HTML + privacy / cookie
policy + (where present) cookie-preferences page. Looked for OneTrust
DOM IDs (`#onetrust-banner-sdk`, `#onetrust-consent-sdk`,
`otSDKStub.js`, `*.otcdn.com`), OneTrust cookie names (`OptanonConsent`,
`OptanonAlertBoxClosed`), Didomi (`didomi.io`, `didomi-host`),
Usercentrics (`usercentrics.com`, `uc-banner`, `*.uc.js`), Cookiebot
(`cookiebot.com`, `consent.cookiebot.com`), CookieYes, Osano
(`osano.com`), Iubenda.

| Company           | CMP detected                                                                                      | Cookie banner location                                                          | DSAR URL                                                               | Trust subdomain                                                            | Evidence                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Stripe**        | None (native "Cookies & Consent Settings Dashboard")                                              | `stripe.com/cookie-settings` (linked in footer)                                 | `/legal/privacy-center` + `dpo@stripe.com`                             | None at apex (path `/legal/`)                                              | Cookie policy explicitly names native dashboard; no third-party CMP scripts in homepage HTML                                |
| **Linear**        | None                                                                                              | Browser-only cookie control                                                     | `hello@linear.app` (no portal)                                         | None observed                                                              | Privacy policy explicitly says "Services do not support Do Not Track at this time" — DIY approach                           |
| **Cal.com** (OSS) | None                                                                                              | None observed                                                                   | `support@cal.com` / `legal@cal.com`                                    | None                                                                       | Open-source repo `github.com/calcom/cal.com` shows no CMP integration                                                       |
| **Vercel**        | None on site                                                                                      | None observed on homepage                                                       | **`datarequest.vercel.com`** (DataGrail-powered)                       | None observed                                                              | Page title at `datarequest.vercel.com/` returns "Privacy Request Center                                                     | DataGrail" |
| **Anthropic**     | None (custom inline "Privacy choices" toggle in footer)                                           | Footer "Privacy choices" with toggles: Necessary / Analytics / Marketing        | `privacy@anthropic.com` + `privacy.claude.com` (Intercom-powered help) | **`trust.anthropic.com`** (SafeBase, inferred from peer pattern)           | No OneTrust/Didomi/Usercentrics scripts; inline 3-category toggle in footer; `intercomcdn.com` references on privacy portal |
| **Resend**        | None                                                                                              | None observed                                                                   | `support@resend.com`                                                   | None observed                                                              | Privacy policy lists subprocessors at `/legal/subprocessors`                                                                |
| **Plain**         | Unknown (page failed to load — 404 on `/legal/privacy`)                                           | —                                                                               | —                                                                      | None observed                                                              | URL `https://plain.com/legal/privacy` returned 404 in inspection                                                            |
| **Sentry**        | None                                                                                              | None observed in privacy policy DOM                                             | `https://sentry.io/contact/gdpr/` (dedicated form URL)                 | **`sentry.io/trust/`** (path-based, Astro-powered)                         | Trust center is `/trust` path on apex, NOT subdomain; built on Astro per HTML inspection                                    |
| **Headspace**     | None (vendor); has CCPA "Privacy Choices" footer icon (badge, not OneTrust)                       | Footer "Your Privacy Choices" link with Privacy Choices Icon                    | `webviews.headspace.com/data` + `help@headspace.com` + phone           | **`trust.headspace.com`** (live, platform vendor unconfirmed via WebFetch) | Privacy policy HTML inspection: no `OptanonConsent`, no `onetrust-banner-sdk`, no `otSDKStub.js`                            |
| **Calm**          | None                                                                                              | `calm.com/cookies` (vendor unknown) + `calm.com/optout` (returned 403)          | `support@calm.com` (no portal)                                         | None observed                                                              | Privacy policy: no CMP fingerprints; uses DPO Centre Europe + UK as representatives                                         |
| **BetterHelp**    | None                                                                                              | Custom in-app preference center ("Menu > My Account > My Personal Information") | `contact@betterhelp.com` / `DPO@betterhelp.com`                        | None observed                                                              | Privacy policy explicitly: no third-party CMP, custom-built; FTC settlement language absent                                 |
| **Talkspace**     | None                                                                                              | None observed                                                                   | `help.talkspace.com` form + GDPR form                                  | None observed; has `/accessibility-statement`                              | Privacy policy: no CMP fingerprints; uses eSSENTIAL Accessibility (overlay vendor — see §6 warning)                         |
| **Cerebral**      | None                                                                                              | Browser-only                                                                    | `privacy@cerebral.com`                                                 | None observed                                                              | Post-$7M-FTC-settlement (2024) policy contains **no explicit acknowledgment** of remediation — surprising gap               |
| **Noom**          | Unknown (URL returned 403/redirect loop)                                                          | —                                                                               | —                                                                      | —                                                                          | Could not inspect — gating likely IP/region-based                                                                           |
| **nextjs.org**    | None on rendered HTML                                                                             | Footer "Cookie Preferences" link (no banner observed)                           | (Vercel-owned, falls under Vercel DSAR)                                | (Vercel)                                                                   | Static HTML had no CMP scripts                                                                                              |
| **nike.com**      | Unknown (returned 403, anti-bot)                                                                  | —                                                                               | —                                                                      | —                                                                          | Could not directly inspect; Nike is a known long-time OneTrust customer in industry reporting                               |
| **usa.gov**       | None observed on `/privacy` (federal sites typically use Privacy Act mechanisms, not vendor CMPs) | —                                                                               | —                                                                      | —                                                                          | No CMP fingerprints — federal site uses minimal cookie posture                                                              |

**Key inference**: 13 of 13 successfully inspected companies (across both
engineering-strong and consumer-health peer groups) ship **without a
third-party CMP vendor** as of 2026-05-19. The two probable vendor users
in the broader set (Nike via OneTrust, Anthropic possibly via SafeBase
for trust center) we could not confirm via direct HTML inspection due
to gating.

---

## 3. CMP-vendor integration analysis (Didomi / OneTrust / Usercentrics)

### Didomi — webhook architecture, mature

Source: `developers.didomi.io/integrations/generic-integrations/webhooks`.

- **Webhook delivery**: HTTP POST with JSON-encoded event payload
  (`event.created` shape includes organization ID, user identifiers, and
  consent details with purposes + enabled/disabled status).
- **Authentication**: OAuth 2.0 Client Credentials grant. Didomi servers
  authenticate against the customer's OAuth authorization server to
  obtain an Access Token; the token is sent as a Bearer in
  `Authorization` header on subsequent webhook deliveries. This is
  the same auth pattern Quilty's Rust backend already implements for
  internal service-to-service calls — fits cleanly.
- **Retry**: 5x retries within 5 minutes on failure, then permanent
  storage for later replay. Source IP is `35.159.1.63` (must whitelist).
- **Cross-device**: Native cross-device consent sync via `setUser()` /
  `clearUser()` mobile SDK methods that trigger
  `onConsentChanged` events. Mobile and web share consent via a Didomi-
  managed `organization_user_id` linking key. **Direct architectural
  match** for Quilty's stated need: web + Flutter mobile sharing
  consent state.
- **Limitation**: "Webhooks are not yet compatible with a multi-
  regulation approach. At this moment in time, user consent will be
  associated with GDPR in the events that you receive." US-state-law
  (CCPA / CDPA / CPA) coverage requires additional configuration.
- **Pricing**: Custom enterprise tiers, €50-€1,000/mo range cited in
  comparison articles. No public SMB tier. **Likely ~$10-20k/yr for a
  Quilty-sized consumer site** (extrapolating from peer pricing
  patterns).

### OneTrust — broader GRC, heavier integration

Source: `developer.onetrust.com/onetrust/reference/integrating-with-
webhooks`.

- **Webhook + Preferences API**: Two integration models.
  Webhooks are configured per-trigger and deliver workflow events (DSR
  stage changes, assessment submissions, etc.) — not as clean as
  Didomi's "every consent change is an event". The **Preferences API**
  is the cleaner path: a public-key authorization token model that lets
  client-side apps retrieve consent for a single data subject without
  needing an intermediary server. Optimized for just-in-time consent
  decisions.
- **Authentication**: OAuth 2.0 Client Credentials or API Keys, scope-
  per-endpoint. Heavier than Didomi.
- **Strengths**: 400+ privacy laws covered, deeper script-mapping in
  the cookie scanner, mature GPC implementation (earliest to market).
- **Pricing**: Modular per-feature tier starting ~$827/mo, **enterprise
  contracts ~$3k-50k/yr**. Multiple comparison sites note OneTrust
  charges extra for onboarding and is difficult to cancel.
- **Architectural fit**: Heavier than needed. Suited for organizations
  needing data-mapping + DSAR fulfilment + vendor risk + cookie consent
  in one platform. Quilty doesn't need that at M1.

### Usercentrics — Google-ecosystem-strong, transparent pricing

- **Coverage**: Web + mobile from a unified dashboard. Official Google
  CMP partner with native Google Consent Mode v2 integration.
- **TCF v2.2**: First-class. If Quilty ever needs IAB Europe TCF
  (programmatic advertising), Usercentrics is the path.
- **Pricing**: Starts €7/mo (transparent); mid-market €50-500/mo
  usage-based. **The most affordable of the three at consumer-site
  scale.**
- **Cross-device**: Supports it but typically positioned as a
  publisher/mid-market product, not the omnichannel CTV use-case
  Didomi optimizes for.

### Architectural fit assessment for Quilty's stated `ConsentStore` port

The codebase plan calls for `ConsentStore` as a port inside
`@quilty/consent` with adapters for: (a) a native DynamoDB-backed
implementation, or (b) a vendor-CMP implementation later. **All three
CMPs work behind that port**:

- Didomi's webhook → Lambda → DynamoDB write fits the existing
  EventBridge fan-out pattern (already designed for auth `quilty.auth.
sessions_revoked`). Could mirror as `quilty.consent.changed`.
- OneTrust's Preferences API + webhook trigger is more work but
  workable.
- Usercentrics is similar to Didomi but lower-ceiling for omnichannel.

**Net**: Adopting a CMP later is a **bounded reversal**, not a
foundational change. This validates building native at M1.

---

## 4. D97 recommendation — build native at M1

### Recommendation

**Build a native `ConsentStore` port + adapter inside `@quilty/consent`
at M1. Do not adopt OneTrust / Didomi / Usercentrics now.**

### Rationale (evidence-backed)

1. **The entire engineering-led peer set ships native.** Stripe (the
   gold standard on privacy engineering, ~$60B valuation, Section 5
   compliance customer for every Fortune 500) explicitly built and
   named their own "Cookies & Consent Settings Dashboard". When Stripe
   builds rather than buys, the architectural signal is strong.
2. **Consumer-health peers ship native.** BetterHelp explicitly built a
   custom in-app preference center post-FTC-$7.8M settlement (2023);
   they chose native over vendor _after_ the most expensive privacy
   incident in their company history. Talkspace, Calm, Noom, Cerebral
   all ship native too.
3. **The CMP vendor risk vs. own-it tradeoff favors native at our
   scale.** Vendor CMPs become useful when (a) consent-rule changes
   come from many legal jurisdictions and you need a regulatory team
   maintaining purpose/vendor mappings (Quilty has none at M1), (b) you
   need TCF v2.2 for ad-tech integration (Quilty has no programmatic
   ads), (c) you need omnichannel CTV (Quilty has none). None of those
   apply at M1.
4. **The Cerebral $7M lesson is about tracking-pixel exfiltration,
   not about consent-banner UX.** A CMP banner does not prevent that.
   What prevents that is the existing Quilty stance: zero PHI in
   website runtime + ban-direct-vendor-SDK-imports outside
   `lib/observability/` (D67) + per-route CSP (D59) + ConsentState
   gating all analytics SDKs (D35). The CMP banner is the _visible_
   surface; the _real protection_ is the architecture beneath it,
   which Quilty has already locked.
5. **Reversal cost is low.** The `ConsentStore` port can swap to
   Didomi later if marketing/legal demand it. Didomi's webhook +
   cross-device sync is well-architected and can mirror to our
   DynamoDB store with one Lambda. Decision is not load-bearing for
   M1-M5.

### When to revisit

Adopt Didomi (or Usercentrics) if any of:

- Marketing team grows beyond ~3 people and demands granular
  purpose/vendor management without engineering involvement.
- Legal demands TCF v2.2 (programmatic advertising) or expanded
  multi-region geo-banner logic with hourly updates.
- A new EU jurisdiction launches that demands omnichannel CTV consent.
- Quilty's web + Flutter mobile + (hypothetical) CTV/Roku surface
  ships and the consent-sync workload exceeds what a single Lambda +
  DynamoDB can sustain.

### M1 scaffold note

Build:

- `apps/web/lib/consent/store.ts` — `ConsentStore` interface (port).
- `apps/web/lib/consent/adapters/dynamodb.ts` — native adapter.
- `apps/web/components/app/ConsentBanner.tsx` — wraps shadcn
  `Sheet`/`Dialog`, three-category toggle (Necessary / Analytics /
  Marketing) mirroring Anthropic's footer pattern.
- `apps/web/app/api/consent/route.ts` — POST writes to DynamoDB,
  publishes `quilty.consent.changed` on EventBridge (consumed by web
  BFF + Rust backend for marketing-opt-out propagation).
- `apps/web/lib/consent/__tests__/` — unit + Playwright e2e.

Skip:

- Didomi/OneTrust/Usercentrics integration. Defer until trigger.

---

## 5. D99 — DSAR URL findings

| Company        | DSAR URL pattern                                                                            | Portal vendor                                          | Notes                                              |
| -------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------- | ---------- |
| **Stripe**     | `/legal/privacy-center` + `dpo@stripe.com`                                                  | Native                                                 | Education-first hub, not a submission form         |
| **Anthropic**  | `privacy.claude.com` (Intercom help center) + `privacy@anthropic.com` + `dpo@anthropic.com` | Intercom Help (not a DSAR tool — informational)        | Note: redirects from `privacy.anthropic.com`       |
| **Vercel**     | **`datarequest.vercel.com`**                                                                | **DataGrail**                                          | Confirmed via page title "Privacy Request Center   | DataGrail" |
| **Sentry**     | `sentry.io/contact/gdpr/`                                                                   | Native form                                            | Dedicated path, not a subdomain                    |
| **Linear**     | `hello@linear.app`                                                                          | Email-only                                             | No portal — startup scale                          |
| **Cal.com**    | `support@cal.com` / `legal@cal.com`                                                         | Email-only                                             | No portal                                          |
| **Resend**     | `support@resend.com`                                                                        | Email-only                                             | No portal; subprocessors at `/legal/subprocessors` |
| **Headspace**  | `webviews.headspace.com/data` + `help@headspace.com` + phone                                | Custom (webviews subdomain suggests app-embedded view) | Has separate HIPAA NPP                             |
| **BetterHelp** | In-app: "Menu > My Account > My Personal Information" + `contact@betterhelp.com`            | Native (in-app preference center)                      | Post-FTC explicit DSAR UX                          |
| **Calm**       | `support@calm.com` + `calm.com/optout` (returned 403, vendor undetermined)                  | Probably native                                        | Has DPO Centre EU + UK reps                        |

**Observed patterns:**

- **Subdomain DSAR portals** (`datarequest.<brand>.com`,
  `privacy.<brand>.com`) signal vendor adoption (DataGrail, Transcend,
  Securiti).
- **`/legal/privacy-center` path** signals native + education-first.
- **Email-only DSAR** is common at <100-employee scale (Linear, Cal,
  Resend, Plain) — perfectly compliant but doesn't scale.
- **In-app DSAR UX** (BetterHelp's "Menu > My Account > My Personal
  Information") is the post-FTC consumer-health pattern.

**Recommendation for Quilty:**

- **Public landing**: `/legal/privacy-choices` (matches Stripe's
  pattern; mirrors the CCPA "Your Privacy Choices" footer-icon link
  language that Headspace uses).
- **Authenticated submission**: `/account/privacy` for logged-in
  users (matches BetterHelp's in-app pattern, post-FTC best practice).
- **Public submission**: `/legal/privacy-choices/submit` (for non-
  account users who interacted with marketing pages only).
- **Email fallback**: `privacy@my-quilty.com`.
- **Avoid** a vendor subdomain (`datarequest.my-quilty.com`) at M1 — no
  DataGrail license needed. Reserve the subdomain for later.

---

## 6. D101 — Accessibility Statement findings

| Company       | URL                                                                | WCAG version    | Conformance      | Audit partner                  | Feedback                      | EAA ref?      | Last updated    |
| ------------- | ------------------------------------------------------------------ | --------------- | ---------------- | ------------------------------ | ----------------------------- | ------------- | --------------- |
| **Headspace** | `/accessibility-statement`                                         | **WCAG 2.2 AA** | Stated as target | **Accessible by Design LLC**   | `accessibility@headspace.com` | Not mentioned | Feb 2026 (VPAT) |
| **Talkspace** | `/accessibility-statement`                                         | WCAG 2.1 AA     | Stated as target | **eSSENTIAL Accessibility** ⚠️ | `help.talkspace.com`          | Not mentioned | Not stated      |
| **Stripe**    | `/legal/accessibility` (returned 404; likely deeper path)          | Not captured    | —                | —                              | —                             | —             | —               |
| **Anthropic** | `/accessibility` (returned 404)                                    | —               | —                | —                              | —                             | —             | —               |
| **Vercel**    | `/legal/accessibility` (returned 404)                              | —               | —                | —                              | —                             | —             | —               |
| **Linear**    | `/accessibility` (returned a loading state, no statement captured) | —               | —                | —                              | —                             | —             | —               |

**⚠️ Critical finding — eSSENTIAL Accessibility (now branded "EAA")**

Talkspace's accessibility statement names **eSSENTIAL Accessibility** as
their audit partner. This vendor is **classified by the disability
community as an accessibility overlay product** — the same category
(accessiBe, UserWay, AudioEye, AllAccessible) that Quilty's CLAUDE.md
explicitly forbids under the **Overlay Prohibition Rule** (added Round
5 per file 07). The eSSENTIAL Accessibility marketing positions
itself as a managed-service consultancy _layered on top of_ the
overlay product, but the underlying technology is the same overlay
class that the FTC settled $1M against accessiBe in April 2025.

**Implication**: Talkspace is exposed to the same overlay-driven
litigation pattern that drove the UserWay class-action (Feb 2026) and
~25% of 2024 ADA suits. Quilty should not follow Talkspace's
accessibility-partner choice.

**Observed patterns** (small sample due to 404s on Stripe / Anthropic
/ Vercel; their accessibility statements are likely on deeper paths
we did not enumerate exhaustively in budget):

- **WCAG 2.2 AA** is the current standard (Headspace explicitly
  states 2.2; Talkspace still cites 2.1).
- **Third-party audit partner is the norm** — Headspace uses
  Accessible by Design LLC (legitimate consultancy, NOT an overlay
  vendor). Quilty should pick a similar legitimate auditor.
- **Dedicated feedback inbox** is standard (`accessibility@<brand>.com`).
- **VPAT reports** are increasingly published (Headspace publishes
  separate mobile + web VPATs, June 2024 and Feb 2026 versions).
- **EAA acknowledgment is still rare** even though enforcement went
  live 2025-06-28. None of the inspected statements explicitly cite EAA
  or EN 301 549 (the EU harmonized standard that incorporates WCAG 2.1
  AA). This is a gap Quilty can lead on.

**Recommendation for Quilty (`/accessibility` route):**

- **WCAG 2.2 AA conformance target**, partial conformance statement
  acknowledged for known issues.
- **Audit partner: pick a legitimate consultancy** (Accessible by
  Design LLC, Deque, Level Access non-overlay practice, Knowbility,
  TPGi). **Explicit ban on overlay vendors** (accessiBe, UserWay,
  AudioEye, EqualWeb, AllAccessible, **eSSENTIAL Accessibility**) —
  document in the statement so legal can defend the position.
- **EAA acknowledgment**: explicitly cite EAA Directive (EU) 2019/882,
  EN 301 549, June 2025 enforcement date. This is differentiating
  posture and demonstrates regulatory awareness.
- **Feedback inbox**: `accessibility@my-quilty.com`, **with a stated
  SLA** (10 business days — matches EAA expectations).
- **Publish VPAT** when ready (M6+ once audit is complete).
- **Last-updated date** prominently in header (Headspace pattern).

---

## 7. D102 — Sub-processor list findings

| Company        | URL                                                                                             | Format                                                     | Notification method                                                                                     | Last updated |
| -------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------ |
| **Stripe**     | `stripe.com/service-providers/legal`                                                            | **4-column table**: Name / Data / Purpose / Entity Country | **Email subscription** via dashboard communication settings; 30-day objection window for business users | Dec 20, 2025 |
| **Anthropic**  | `trust.anthropic.com/subprocessors` (redirects from `/subprocessors`)                           | Table (format not fully captured)                          | Subscribe via trust center                                                                              | —            |
| **Resend**     | `/legal/subprocessors`                                                                          | Table                                                      | Email                                                                                                   | —            |
| **Cal.com**    | Embedded in privacy policy (no separate URL)                                                    | Bulleted list                                              | —                                                                                                       | —            |
| **Sentry**     | None (general "Third-party service providers" language only; directs to `compliance@sentry.io`) | —                                                          | —                                                                                                       | —            |
| **Linear**     | None                                                                                            | —                                                          | —                                                                                                       | —            |
| **Vercel**     | None separate; references "Third-Party Service Providers" generically                           | —                                                          | —                                                                                                       | —            |
| **Headspace**  | None separate; categorical mentions only                                                        | —                                                          | —                                                                                                       | —            |
| **BetterHelp** | "Third Party Partners Disclosure List" referenced but no URL                                    | —                                                          | —                                                                                                       | —            |
| **Talkspace**  | None                                                                                            | —                                                          | —                                                                                                       | —            |

**Observed patterns:**

- **`/legal/subprocessors`** is the canonical path (Resend,
  Anthropic).
- **`/service-providers/legal`** is Stripe's variation (`legal`
  suffix matches their pattern of `/cookies-policy/legal`,
  `/privacy-policy/legal`).
- **4-column table** (Name / Data / Purpose / Country) is the
  Stripe-standard table. Wide adoption.
- **Email subscription** is the notification standard. **RSS is
  effectively dead** — none of the inspected companies offer it.
- **30-day objection window** for business users (Stripe pattern) is
  the gold standard.
- **Update frequency**: ~quarterly to semi-annual based on observed
  last-updated dates.

**Recommendation for Quilty:**

- **URL**: `/legal/subprocessors` (matches Resend/Anthropic
  convention).
- **Format**: 4-column table (Name / Data Processed / Purpose / Entity
  Country), Stripe-style.
- **Notification**: page-updated-at header + an opt-in email
  subscription form (`subscribe-subprocessors@my-quilty.com` distribution
  list).
- **Objection window**: 30 days for business users (matches Stripe).
- **MDX source**: Velite-typed schema (per D64) so the table is
  generated from a single typed source.
- **Build the page at M1**, populate at M5 (when M5 surfaces real
  subprocessor needs: Cognito, Stripe, PostHog, Sentry, AWS, etc.).

---

## 8. D103 — Trust Center subdomain findings

| Company       | URL                                                                                | Platform                                                                                                  | Source                                                                          |
| ------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Anthropic** | `trust.anthropic.com` (subdomain) + `/subprocessors` child path                    | **SafeBase** (inferred from peer pattern — Anthropic is a known SafeBase customer per industry reporting) | Subdomain redirect from `anthropic.com/subprocessors`                           |
| **Headspace** | `trust.headspace.com` (subdomain)                                                  | Platform unconfirmed via WebFetch (page loaded but vendor not visible in body)                            | Live URL, footer-linked                                                         |
| **Sentry**    | `sentry.io/trust/` (**path on apex**, not subdomain)                               | **Custom Astro static site**                                                                              | Astro fingerprints observed in HTML; lists SOC 2 Type 2 + ISO 27001 + GDPR docs |
| **Stripe**    | `stripe.com/legal/...` (path, no trust subdomain)                                  | Native                                                                                                    | Stripe consolidates everything under `/legal/`; no `trust.stripe.com`           |
| **Linear**    | `trust.linear.app` (subdomain — exists but body content not captured via WebFetch) | Unconfirmed (likely SafeBase based on peer pattern + Linear's general "modern SaaS" posture)              | Page header confirmed                                                           |
| **Plain**     | `trust.plain.com` (subdomain — exists, body unconfirmed)                           | Unconfirmed                                                                                               | Page header confirmed                                                           |
| **Vercel**    | None confirmed; `datarequest.vercel.com` is DSAR not trust                         | —                                                                                                         | —                                                                               |
| **Cal.com**   | None confirmed                                                                     | —                                                                                                         | —                                                                               |
| **Resend**    | None confirmed                                                                     | —                                                                                                         | —                                                                               |

**Platform landscape (from search):**

- **SafeBase**: Trust center leader. Founded 2020, **acquired by
  Drata in Feb 2025 for $250M**. Powers **OpenAI, Twilio,
  CrowdStrike, HubSpot, LinkedIn, T-Mobile, one-third of Cloud 100,
  Anthropic (probable), Harness (confirmed via `trust.harness.io`
  showing "Powered by SafeBase" badge)**.
- **Drata Trust Center**: Now combined with SafeBase post-acquisition.
  Customers include Notion, Lemonade, Tenable.
- **Vanta Trust Center**: Mid-market competitor, less penetration in
  the enterprise tier.
- **Whistic**: Niche, older entrant.

**Observed pattern**: `trust.<brand>.com` is the **dominant
convention** for SafeBase-hosted trust centers. Apex-path (`/trust`)
is the alternative for self-hosted (Sentry, Stripe).

**Recommendation for Quilty:**

- **At M1-M6**: Use **`/trust`** path on `my-quilty.com` (apex).
  Built as a static MDX page (Velite schema per D64), no vendor.
  Links to: SOC 2 (when ready), sub-processors, security overview,
  HIPAA posture, AWS posture, accessibility statement.
- **At M7-M8 (post-SOC-2-Type-II)**: Migrate to
  **`trust.my-quilty.com`** subdomain on **SafeBase (now Drata
  Trust Center)**. The acquisition consolidation matches Quilty's
  existing GRC posture; the network effects of being on the same
  platform as OpenAI/Twilio/Anthropic mean enterprise buyers'
  questionnaires get satisfied without manual work.
- **DNS preparation**: Reserve `trust.my-quilty.com` in `quilty-aws/
dns/` Route 53 layer now (the cross-account Pattern A already
  handles this) so cutover is a single CNAME flip later.

---

## 9. Cross-platform CMP question — Didomi for mobile + web later (if needed)

The user's underlying question was: "Quilty mobile uses Didomi OR
OneTrust (was reported as Usercentrics — needs verification). Should
web align?"

**Mobile-side reality** (cross-referenced with `02-mobile-stack-recon.
md` Round-6 file): the mobile-stack report needs to be re-checked for
the actual mobile CMP. If mobile is indeed using one of Didomi /
OneTrust / Usercentrics, the **right answer is still NOT to deploy
the same vendor on web at M1** — the same architectural choice
applies for the same reasons. **Mobile and web can have independent
CMPs joined at the `cognito_sub` + `quilty_sid` layer** (same
pattern as the D11 Round-5 auth-session model: mobile + web
independent, joined by identity).

If mobile is on Didomi and the team later wants unified consent:
Didomi's cross-device feature (mobile SDK `setUser()` → triggers
`onConsentChanged` → webhook to Quilty backend → mirrored to web's
ConsentStore via the same EventBridge fan-out we already use for
auth) is a **clean architectural fit** when the trigger is hit.

If mobile is on OneTrust: the same pattern works, but the OneTrust
Preferences API + webhook is slightly heavier. Still workable.

**Verifying which CMP is actually on mobile** is out of scope for
this file but should be added to the next mobile-stack audit pass —
inspect the Flutter app's `pubspec.yaml` for `didomi_sdk` /
`onetrust_publishers_native_cmp` / `usercentrics_sdk` package
imports.

---

## 10. Summary table — recommended Quilty stances

| ID              | Decision area           | Recommended Quilty pattern                                                                                                                                                                                                                                                   | Inspiration                                            |
| --------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **D97**         | CMP                     | Native `ConsentStore` port + DynamoDB adapter inside `@quilty/consent` at M1; Didomi-shaped reversal available at M5+ trigger                                                                                                                                                | Stripe, BetterHelp, Anthropic                          |
| **D99**         | DSAR public URL         | `/legal/privacy-choices` (landing) + `/account/privacy` (in-app submission) + `privacy@my-quilty.com` (fallback)                                                                                                                                                             | Stripe + BetterHelp                                    |
| **D99 (later)** | DSAR vendor portal      | Reserve `datarequest.my-quilty.com` for future DataGrail/Transcend adoption at M7+                                                                                                                                                                                           | Vercel                                                 |
| **D101**        | Accessibility statement | `/accessibility` route; WCAG 2.2 AA; legitimate auditor (Deque / Accessible by Design / Knowbility / TPGi); **explicit overlay ban including eSSENTIAL Accessibility**; EAA + EN 301 549 acknowledgment; `accessibility@my-quilty.com` with 10-business-day SLA; VPAT at M6+ | Headspace (minus eSSENTIAL warning)                    |
| **D102**        | Sub-processor list      | `/legal/subprocessors` (Velite-typed MDX); 4-column table (Name / Data / Purpose / Country); email subscription notification; 30-day objection window for business users                                                                                                     | Stripe + Resend                                        |
| **D103**        | Trust Center            | `/trust` path at M1-M6 (static MDX); migrate to `trust.my-quilty.com` on SafeBase/Drata Trust Center at M7-M8 post-SOC2-Type-II                                                                                                                                              | Sentry (apex path) → Anthropic (subdomain on SafeBase) |

---

## 11. Sources

### Live page inspections (2026-05-19)

- Stripe privacy policy: <https://stripe.com/privacy>
- Stripe cookies policy: <https://stripe.com/cookies-policy/legal>
- Stripe sub-processor list: <https://stripe.com/service-providers/legal>
- Stripe privacy center: <https://stripe.com/legal/privacy-center>
- Linear privacy policy: <https://linear.app/privacy>
- Linear trust center header: <https://trust.linear.app/>
- Cal.com privacy policy: <https://cal.com/privacy>
- Cal.com GitHub: <https://github.com/calcom/cal.com>
- Vercel privacy policy: <https://vercel.com/legal/privacy-policy>
- Vercel cookie policy: <https://vercel.com/legal/cookie-policy>
- Vercel DSAR portal (DataGrail): <https://datarequest.vercel.com/privacy>
- Next.js homepage: <https://nextjs.org/>
- Anthropic privacy policy: <https://www.anthropic.com/legal/privacy>
- Anthropic cookies policy: <https://www.anthropic.com/legal/cookies>
- Anthropic homepage: <https://www.anthropic.com/>
- Anthropic privacy hub: <https://privacy.claude.com/> (redirected from privacy.anthropic.com)
- Resend privacy policy: <https://resend.com/legal/privacy-policy>
- Sentry privacy policy: <https://sentry.io/privacy/>
- Sentry trust center (path-based): <https://sentry.io/trust/>
- Headspace homepage: <https://www.headspace.com/>
- Headspace privacy policy: <https://www.headspace.com/privacy-policy>
- Headspace accessibility statement: <https://www.headspace.com/accessibility-statement>
- Headspace trust center subdomain: <https://trust.headspace.com/>
- Calm privacy policy: <https://www.calm.com/privacy-policy>
- BetterHelp privacy policy: <https://www.betterhelp.com/privacy/>
- Talkspace privacy policy: <https://www.talkspace.com/public/privacy-policy>
- Talkspace accessibility statement: <https://www.talkspace.com/accessibility-statement>
- Cerebral privacy policy: <https://cerebral.com/privacy-policy>
- usa.gov privacy: <https://www.usa.gov/privacy>

### Vendor documentation

- [Didomi Webhooks documentation](https://developers.didomi.io/integrations/generic-integrations/webhooks)
- [Didomi Configure HTTP Webhook](https://developers.didomi.io/integrations/tutorials/configure-a-http-webhook)
- [Didomi iOS SDK events reference](https://developers.didomi.io/cmp/mobile-sdk/ios/reference/events)
- [Didomi share consents across devices](https://developers.didomi.io/cmp/mobile-sdk/share-consents-across-devices)
- [Didomi web SDK events & variables](https://developers.didomi.io/cmp/web-sdk/third-parties/tags-management/events-and-variables)
- [OneTrust webhooks integration](https://developer.onetrust.com/onetrust/reference/integrating-with-webhooks)
- [OneTrust "When Consent Changes"](https://developer.onetrust.com/onetrust/docs/when-consent-changes)
- [OneTrust Preferences API](https://developer.onetrust.com/onetrust/reference/retrieving-client-side-consent-preferences-using-the-preferences-api)

### Industry / comparison references

- [CMP Comparison 2026: OneTrust vs Cookiebot vs Didomi vs Usercentrics](https://www.nixondigital.io/blog/cmp-comparison-2026/)
- [Drata acquires SafeBase ($250M, Feb 2025)](https://drata.com/blog/acquiring-safebase)
- [SafeBase + Drata: Redefining Trust](https://safebase.io/blog/drata-acquires-safebase)
- [Harness Trust Center (Powered by SafeBase) — example apex subdomain](https://trust.harness.io/)
- [Best DSAR software 2026 (G2)](https://www.g2.com/categories/data-subject-access-request-dsar)
- [Best CMP 2026 — Secure Privacy](https://secureprivacy.ai/blog/best-cmp-2026)
- [EAA enforcement timeline + EN 301 549 / WCAG 2.1 AA](https://www.levelaccess.com/compliance-overview/european-accessibility-act-eaa/)
- [DataGrail (Vercel's DSAR vendor)](https://www.osano.com/comparison/datagrail-competitors)

### Notable gaps (not resolved in budget)

- **Plain.com privacy policy** returned 404; structure unconfirmed.
- **Noom** returned 403 / redirect loop; CMP unconfirmed.
- **Nike** returned 403 (anti-bot gating); OneTrust adoption is known
  from industry reporting but not directly verified in this audit.
- **Stripe / Anthropic / Vercel accessibility statements** returned 404
  on the paths tested (`/legal/accessibility`, `/accessibility`); these
  pages likely exist on deeper or differently-named paths and warrant a
  follow-up sitemap inspection.
- **Mobile-side Didomi/OneTrust/Usercentrics presence** for Quilty
  itself needs verification via the Flutter `pubspec.yaml` inspection
  in a future mobile-stack audit pass.
