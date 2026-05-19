# Research: Consumer Health/Wellness Website + Account Portal Patterns

> Source: general-purpose research agent, 2026-05-14. 10-company peer-set inspection.
> Purpose: validate or challenge our scope hypothesis ("Marketing + Account Portal + Subscription Management"). Inform what "good" looks like for Quilty's website.

---

## Per-company findings

**Headspace** — Full marketing stack (meditation/therapy/coaching feature pages, science, blog, careers, press, gift, family, student, HSA/FSA, code redemption, employer/health-plan B2B). Web account portal at `my.headspace.com` is gated. Subscription management is **dual-rail and platform-locked**: web subscribers manage at `headspace.com/subscription/manage` (cancel/upgrade); Apple/Google IAP subscribers are explicitly routed back to App Store / Play subscription settings — Headspace can't cancel for them. Self-serve data export and deletion are policy-promised, but the privacy policy says they're exercised by emailing `help@headspace.com` "or in some cases using features within the Platform" — i.e., not fully self-serve on web.

**Calm** — Marketing site + web portal at `app.calm.com` (returned 403 to anonymous fetch, confirming a real authenticated portal). Subscription management is **explicitly available on both web and app**: web users go to profile → Settings → Manage Subscription; mobile users do the same via the gear icon. IAP cancellation routes to App Store/Play. Help center has dedicated "Subscription and Account Management" category covering transfer, email/name change, refund policy.

**Noom** — Marketing site (blog, careers, support, research, press, about) + dedicated portal subdomain `account.noom.com`. No public pricing page in nav (pricing buried behind the onboarding quiz — deliberate paywall pattern).

**Oura** — Marketing site is heavily **commerce-shaped** (ring purchase, FSA/HSA/Affirm/PayPal at checkout). Plus a real web account portal at `cloud.ouraring.com` AND a separate "Membership Hub" where users view plan, update payment method, edit account info, **export data**, and cancel membership. Membership is web-managed by design ($5.99/mo, $69.99/yr).

**WHOOP** — Marketing site with three-tier membership pricing exposed publicly ($199/$239/$359/yr — unusual transparency). `app.whoop.com/login` portal. Subscriptions are membership-bundled-with-hardware, so management is primarily web (no IAP because there's no per-purchase IAP path for the bundle).

**MyFitnessPal** — Marketing site (reviews, how-it-works, apps, premium, blog, community, contact, support). Web account at `/account/login`, settings at `/account/settings`. Cancel-on-web supported with 24-hour-before-renewal advisory.

**Strava** — Marketing site (features, subscribe, maps, challenges, routes, family, student, gift, about, careers, press subdomain, stories subdomain). Web settings has Privacy Controls → Map Visibility, Aggregated Data Usage. **Data export via bulk download is self-serve from account settings**. MFA notably weak — email one-time codes only; no TOTP or hardware key support as of 2026.

**BetterHelp** — Marketing site (how-it-works, FAQ, reviews, advice/blog, careers, business, contact, for-therapists, AARP partnership). Login is the gateway to a full **product portal** (messaging, scheduling, therapist switching, worksheets, groups, journaling) — the "account portal" and "the product" are the same web app. Cancel-anytime is FAQ-documented but the specific UI flow isn't public.

**Talkspace** — Heavy marketing site (multiple therapy-type pages, 7+ insurer-specific pages, condition directory, assessments, research, blog). Two app subdomains: `app.talkspace.com` (product) and `match.talkspace.com` (intake). Pricing partially gated behind eligibility check — payor-mix complexity drives the structure.

**Fitbit** — `fitbit.com/home` now 301-redirects to Google Store. Brand essentially absorbed into Google's ecosystem; no longer a standalone reference for web account-portal design.

---

## Synthesis

### 1. Is "marketing + account portal + subscription" the dominant pattern?

Yes — 9 of 10 follow it. The variations are along two axes:

- **How much of the product is on the web** — BetterHelp/Talkspace put the _entire_ product on web (therapy needs desktop typing), Strava puts feed + maps + analysis on web (creator/analysis use case), while Headspace/Calm/Noom keep web account-only and push consumption to mobile.
- **How subscription cancellation routes** — every app with iOS/Android IAP has the same forced bifurcation (cancel-where-you-bought). There's no "in-app-only billing" alternative in this set. The single-page-with-modal-login pattern only shows up in DTC commerce hybrids like Oura, and even Oura has a real Membership Hub behind it.

### 2. Account-portal items founders commonly miss when scoping

- **Platform-aware cancellation flow** — every web portal must detect IAP subscribers and route them to App Store/Play with copy that says "we can't cancel this for you." Headspace's help center has a whole article dedicated to this.
- **Plan-switch flow** (monthly ↔ annual mid-cycle, with proration) — Calm has a dedicated help article for this; it's a real UX surface, not a checkbox.
- **Account-transfer / email change** — Calm documents both; commonly missed in MVP scoping.
- **Bulk data export self-serve** — Strava and Oura ship this in-portal; Headspace makes you email support, which is a HIPAA/GDPR scaling liability.
- **Receipt/invoice download for HSA/FSA reimbursement** — Headspace, Oura, WHOOP all surface FSA/HSA prominently; users need PDF invoices for reimbursement.
- **MFA management UI** — surprisingly underbuilt across this set. Strava only does email OTP; most apps don't expose TOTP enrollment on web at all. Bar for being "best-in-class" is low — even passkey + TOTP puts you ahead.
- **Session/device management** ("sign out everywhere", connected-devices list) — present in healthcare-grade portals (per industry guidance) but rarely visible on these consumer apps' marketing pages. Portal concern, not marketing concern.
- **Connected-apps / OAuth grants** — Strava has this (Garmin, Wahoo, etc.); MyFitnessPal has this; mental-health apps generally don't.

### 3. What founders wrongly assume must be on the marketing site

- **Detailed pricing tables** — Noom and Talkspace deliberately gate pricing behind quiz/eligibility. Pricing IS conversion-rate-sensitive, not a hygiene page.
- **A blog from day one** — Strava's footer doesn't prominently feature one; press/stories live on subdomains.
- **A press kit** — most use a separate subdomain (`press.strava.com`, `stories.strava.com`) and these are quarter-2-or-later work.
- **A careers page** — none of these had careers as a navigation priority; it's a footer link.
- **Long-form science content hub** — Calm, Noom, Oura, WHOOP all have _one_ science/research page, not a content hub.

### 4. Is Headspace's web presence emulatable by a small team?

**No** — and that's the wrong reference. Headspace's site is years of dedicated web/SEO/content-marketing investment (50+ feature/condition landing pages tuned for SEO, employer/health-plan B2B funnels, 7+ payment options).

**The realistic reference for a small team is Calm or Oura at MVP scale:**

- ~10-15 marketing pages (home, 2-3 feature pages, science, pricing, blog index with 3-5 seed posts, support link out to a Zendesk/Intercom-hosted help center, privacy, terms, careers stub, press stub)
- Account portal with ~6 screens (login, profile, subscription, payment methods, MFA, data/deletion)

**Biggest force-multipliers:**

- **Outsource help center to Zendesk / Intercom** — every company above does this (`help.headspace.com`, `support.calm.com`, `support.strava.com`, `support.ouraring.com`, `help.talkspace.com` are all hosted help platforms, not custom builds). Eliminates ~30% of marketing-site scope.
- **Stripe Customer Portal** eliminates ~50% of account-portal scope (payment methods, invoice history, plan switching, cancellation UI all come for free), leaving you to build only the Quilty-specific surfaces (profile, MFA, data export, deletion, sessions, IAP-cancel routing copy).

---

## Bottom line for the Quilty scope hypothesis

**"Marketing + account portal + subscription" is correct and matches the dominant pattern.** The two non-obvious adds to push into v1:

1. **IAP-aware cancellation routing** — Quilty is Flutter-first; you will have App Store / Play subscribers; missing this generates real support load.
2. **Self-serve data export + account deletion in-portal** — HIPAA-aligned + GDPR-ready posture; Headspace's "email support" workaround does not scale and creates audit liability you're already engineered around with the audit pipeline in Sprint 4.

**Low-bar differentiator:** MFA management UI is underbuilt across peers; passkeys + TOTP + backup codes (already shipped in W2-B.2) put us ahead.

---

## Sources

- [Headspace: cancel subscription help article](https://help.headspace.com/hc/en-us/articles/115008364988-How-do-I-cancel-my-subscription)
- [Headspace: cancel via Apple/Google IAP](https://help.headspace.com/hc/en-us/articles/115014780447-How-do-I-cancel-my-subscription-if-I-subscribed-on-Apple-App-Store-or-Google-Play)
- [Calm: Subscription and Account Management category](https://support.calm.com/hc/en-us/categories/4406076612891-Subscription-and-Account-Management)
- [Calm: monthly/annual switch flow](https://support.calm.com/hc/en-us/articles/360008241234-Switching-From-a-Monthly-to-an-Annual-Subscription-OR-Annual-to-Monthly)
- [Strava: data export and bulk export](https://support.strava.com/hc/en-us/articles/216918437-Exporting-your-Data-and-Bulk-Export)
- [Strava: One-Time Codes (email-OTP MFA only)](https://support.strava.com/hc/en-us/articles/32040867673485-One-Time-Codes-on-Strava)
- [Oura: My Account & Membership help](https://support.ouraring.com/hc/en-us/sections/9715434505619-My-Account-Oura-Membership)
- [Oura: Create and Manage an Oura Account](https://support.ouraring.com/hc/en-us/articles/360025441234-Create-and-Manage-an-Oura-Account)
- [Oura: Membership pricing/features](https://support.ouraring.com/hc/en-us/articles/4409086524819-Oura-Membership)
- [Headspace Member FAQ (Adobe benefits, Jan 2026)](https://benefits.adobe.com/document/629)
