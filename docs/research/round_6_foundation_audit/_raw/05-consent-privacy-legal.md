# Round 6 — Track 2 Agent C: Consent + Privacy + Legal UI Audit

**Date:** 2026-05-19
**Scope:** The consent, privacy, and legal-surface foundation that converts our server-side `ConsentState` primitive (`apps/web/lib/observability/consent.ts`) into a usable, defensible US + EU launch posture.
**Sources:** 2025–2026 only (regulator releases, FTC settlements, EDPB/CNIL guidance, CPPA finalized rulemaking, EAA implementation, peer SaaS trust centers).

---

## 1. Executive summary

We have a denial-by-default server-side `ConsentState` reader gated to `server-only`, three legal-page stubs (`/legal/{privacy,terms,cookies}`), one account-data stub (`/account/data`), and zero UI to actually capture, surface, or honor consent. That leaves us missing nine foundation pieces before we can ship to either a US-launch (where CCPA §7025(c)(6) GpcHonoredIndicator went mandatory on Jan 1, 2026, with a coordinated CA-CO-CT enforcement sweep already underway) or an EU launch (where the EAA Accessibility Statement requirement went enforceable on June 28, 2025 and CNIL has issued €475M of cookie-banner fines in a single 2025 day).

The two foundation locks that grandfather hardest and must close in M1.5 — before any analytics SDK ships behind the consent gate — are (1) the cookie taxonomy schema (which versions every consent record thereafter), and (2) the DSAR URL structure (which binds regulator filings and DPA annex pointers). Everything else fans out from those two anchors.

Critical posture pivot needed: under California's CPRA, "personal information collected and analyzed concerning a consumer's health" is **Sensitive Personal Information** — and Washington MHMDA classifies the same data as **Consumer Health Data** requiring affirmative **opt-in**, not the opt-out posture CPRA defaults to. Quilty is squarely in both categories. The opt-in floor wins.

---

## 2. Cookie banner + ConsentState UI design (the M1.5 build)

### 2.1 Component contract

`<ConsentBanner />` is a Client Component (`"use client"`) rendered from the root `[locale]/layout.tsx`. It reads initial `ConsentState` from a small Server Component wrapper (`<ConsentBootstrap>`) that injects the server-resolved state as a serialized prop. This avoids the React-hydration flash where the banner pops up for a returning consenter, and lets the server stay the source of truth.

```
<ConsentBootstrap>           // RSC; calls getConsentState()
  └─ <ConsentBanner          // Client; receives initial state
       initialState={...}
       gpcDetected={...}
       locale={...}
    />
```

The banner has **three render modes** driven by initial state:

| Mode          | Trigger                                               | UI                                                               |
| ------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| `hidden`      | Cookie exists AND no policy version bump              | render nothing                                                   |
| `gpc-honored` | `gpcDetected === true` AND no explicit consent record | render the CCPA §7025(c)(6) GpcHonoredIndicator strip (see §2.4) |
| `banner`      | No cookie, GPC not set                                | render the full banner                                           |

### 2.2 Banner anatomy (first layer — no modal)

A bottom-aligned banner (not full-screen overlay — 76% of users bounce when content is blocked, per 2026 DataGrail study; CNIL has also flagged blocking overlays as obstructive dark patterns). Three buttons of strictly identical size, color, contrast, font weight, and placement:

```
[ Accept all ]   [ Reject all ]   [ Customize ]
```

This is non-negotiable under 2026 enforcement. Button-parity violations drove CNIL's €325M Google fine and €150M Shein fine, both September 2025. EDPB Guidelines 2/2023 (final October 2024) and Guidelines 3/2022 codify asymmetric buttons as "Stirring" / "Obstructing" dark patterns.

Microcopy is conversational, not legalese:

> "We use cookies to keep you signed in and to understand how the site is used. You can accept all, reject all but the strictly necessary ones, or customize."

A small `[View cookie list]` text link expands to an inline table of every cookie + purpose + duration + party — required disclosure under MHMDA and recommended by CNIL.

### 2.3 Preference center (second layer — modal)

`[Customize]` opens a modal with one row per category. Each row has a toggle, a label, a one-line description, and a `[Show cookies (N)]` expander. Five categories:

1. **Strictly necessary** — toggle disabled, always on. Session, CSRF, `__Host-quilty_consent` itself, GPC-honored indicator, locale, theme.
2. **Functional** — preferences (font size, contrast mode, dyslexia-friendly font), reduced-motion override.
3. **Analytics** — Amplitude `AMP_<key>` + `AMP_MKTG_<key>` (D42b reverted to Amplitude 2026-05-19; previous PostHog ID cookies dropped).
4. **Marketing** — empty at launch. Reserved category — declaring it now and shipping with the toggle visible-but-empty grandfathers the schema cleanly for whenever it lights up.
5. **Personalization** — empty at launch. Same grandfathering rationale.

Bottom of modal: `[Save preferences]` + `[Accept all]` + `[Reject all]` — again, all three identical in weight.

### 2.4 GpcHonoredIndicator (CCPA §7025(c)(6), mandatory 2026-01-01)

When `gpc_detected === true` and no explicit consent record exists, the banner is **replaced** with a non-dismissable strip:

> "We detected your Global Privacy Control signal. We've opted you out of the sale or sharing of your personal information and limited use of your sensitive personal information. [Manage preferences]"

This is the CPPA-published example wording for the §7025(c)(6) confirmation, almost verbatim. The `[Manage preferences]` link opens the preference center modal — the user can still up-consent specific categories despite the GPC signal (because GPC is a sale/share opt-out, not a global cookie-rejection signal, per the September 2025 multi-state enforcement guidance).

Account-level GPC propagation (the Disney $2.75M failure mode, Feb 2026): once a user signs in, the server **must** propagate the GPC opt-out to their account record in DynamoDB so it persists across devices. This is a §7025(c)(2) requirement explicitly tested in the CA-CO-CT sweep.

### 2.5 Re-consent triggers

Re-prompt only when:

- The cookie taxonomy version bumps (i.e., a new category was added — `Marketing` activating from empty to populated, for instance);
- The categories of vendors materially changes (Amplitude swapped for something else, Stripe replacing RevenueCat for the web side, etc.);
- The user explicitly clicks "Cookie preferences" in the footer.

**Never** auto-reprompt on the next visit just to try to flip a "reject all" — CNIL explicitly flagged this as a dark pattern (Guideline: no re-prompt for at least six months absent material change).

### 2.6 Storage shape

`__Host-quilty_consent` cookie holds:

```json
{
  "v": 1,
  "ts": "2026-05-19T14:22:00Z",
  "necessary": true,
  "functional": false,
  "analytics": true,
  "marketing": false,
  "personalization": false,
  "method": "explicit" | "gpc-auto" | "policy-bump",
  "policy_version": "2026-05-01"
}
```

The `v` and `policy_version` fields are what makes the grandfathering work. When we add a category later, we bump `v`, the cookie reader on the next request sees `v: 1` while server-side expects `v: 2`, and the banner re-prompts only those users — instead of forcing every existing consenter to re-pick.

Mirror the consent record to DynamoDB once authenticated (`consent` PK = `cognito_sub`, range = `version` so we keep an immutable audit log per D63). Mobile reads this same record via the Rust backend so consent crosses platforms.

### 2.7 Banner library decision: build native

We should build the banner ourselves, not adopt Cookiebot / OneTrust / CookieYes / Osano. Reasons:

- Our server-side `ConsentState` is already the source of truth; vendor banners want to be that source.
- All vendor banners ship 200–800KB of JS, much of it un-tree-shakable, and inject before consent (the very dark pattern we're avoiding).
- Vendor templates default to legalese microcopy we'd rewrite anyway.
- The build cost is ~2 days; the avoided integration debt is forever.

**Specifically reject overlay-style products** (accessiBe, UserWay, AudioEye, EqualWeb) per the project's existing Overlay Prohibition Rule (Round 5 file 07; FTC accessiBe settlement April 2025; UserWay class action Feb 2026).

---

## 3. Cookie taxonomy lock (the grandfathering decision)

We lock five categories at v1, with two of them shipping empty as forward placeholders.

| Category               | At launch                        | Cookies / SDKs                                                                                                                                                        |
| ---------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Strictly necessary** | populated                        | `__Host-quilty_session`, `__Host-quilty_consent`, `__Host-quilty_csrf`, `__Host-quilty_gpc_honored`, `__Host-quilty_locale`, `__Host-quilty_theme`                    |
| **Functional**         | populated (empty if no pref set) | font-size override, contrast-mode override, motion-reduction override                                                                                                 |
| **Analytics**          | populated                        | `AMP_<10-char-api-key>`, `AMP_MKTG_<10-char-api-key>` (Amplitude SDK) + Sentry session-replay cookies (gated on `analytics === true` AND error-only sample, per D42a) |
| **Marketing**          | empty at v1                      | reserved — Meta/Google Ads pixels never go here, see §11                                                                                                              |
| **Personalization**    | empty at v1                      | reserved for in-app recommendation tuning if/when it ships                                                                                                            |

**Grandfathering rule (D-candidate, see §10):** the cookie cookie's `v` field freezes the category taxonomy a user consented to. Adding a category bumps `v` and forces those users (and only those users) into a single re-prompt. Removing a category just deletes the toggle silently and ignores the legacy bit. Renaming a category is treated as adding-plus-removing.

**Cookie audit automation:** Cookiebot's auto-detection scanner is genuinely useful but $50–$200/month and requires injecting their SDK. The DIY equivalent is a Playwright job in CI that visits the homepage with empty consent + accepts-all consent + GPC-honored, dumps all cookies via CDP, and diffs against the declared taxonomy. We should ship this as `pnpm test:cookies` in M2 — it catches drift when a new SDK silently starts setting cookies (Stripe.js's `__stripe_mid` is a frequent surprise; so is Sentry's `sentryReplaySession`).

---

## 4. DSAR flow design

### 4.1 URL structure (locks external regulator filings — hard to change later)

| URL                | Purpose                                                    | Audience      |
| ------------------ | ---------------------------------------------------------- | ------------- |
| `/account/data`    | self-serve dashboard for signed-in users                   | authenticated |
| `/privacy/request` | unauthenticated intake form (CCPA/GDPR/MHMDA)              | anyone        |
| `/privacy/choices` | CCPA "Limit Sensitive PI" + "Do Not Sell or Share" landing | anyone        |
| `/privacy/contact` | DPO + privacy email + mailing address                      | anyone        |

The `/account/data` stub already exists; the three `/privacy/*` routes need scaffolding alongside the legal stubs in M2. We deliberately use `/privacy/...` not `/legal/privacy/...` because regulator forms ask for a "privacy choices URL" and DPA annexes prefer short stable URLs.

CCPA-specific subpaths (mandated wording for the homepage link):

- "Do Not Sell or Share My Personal Information" — anchor-links into `/privacy/choices#sale`
- "Limit the Use of My Sensitive Personal Information" — anchor-links into `/privacy/choices#sensitive`

(Note: under CCPA §7025(f) "frictionless processing," honoring GPC automatically can substitute for the separate Do-Not-Sell link — but we still ship the link for accessibility, in-product education, and the non-GPC-using user base.)

### 4.2 Identity verification handshake

Two flows depending on authentication:

**Signed-in flow (`/account/data`):**

1. User clicks "Export my data" → server-action triggers the export job.
2. No additional verification (their session already authenticated them with a step-up `prompt=login` requirement per D54).
3. Job result is delivered as a signed S3 URL (60-minute TTL) emailed to the on-file address.

**Unsigned flow (`/privacy/request`):**

1. User submits the form with their email + request type (access / delete / correct / opt-out / portability / object / restrict).
2. Server emails a one-time-use verification link valid for 24h.
3. Clicking the link confirms the request and starts the SLA clock.
4. If a matching account exists, the response routes to that account's address; if not, it routes to the submitted address with a smaller, anonymized scope (we cannot say "we have no record of you" because that would leak which emails exist).

This dual-flow pattern is the SaaS norm in 2025 (DataGrail, Mine, OneTrust, Ketch all converge on it).

### 4.3 SLA matrix (codified in the DSAR job runner)

| Right                                  | Law      | Initial SLA      | Extension                                                                                |
| -------------------------------------- | -------- | ---------------- | ---------------------------------------------------------------------------------------- |
| Right of access (Art. 15)              | GDPR     | 30 cal days      | +60                                                                                      |
| Right of rectification (Art. 16)       | GDPR     | 30 cal days      | +60                                                                                      |
| Right to erasure (Art. 17)             | GDPR     | 30 cal days      | +60                                                                                      |
| Right to restriction (Art. 18)         | GDPR     | 30 cal days      | +60                                                                                      |
| Right to portability (Art. 20)         | GDPR     | 30 cal days      | +60                                                                                      |
| Right to object (Art. 21)              | GDPR     | 30 cal days      | +60                                                                                      |
| ADM disclosure (Art. 22)               | GDPR     | 30 cal days      | +60; CJEU Case C-203/22 (Feb 2025) requires genuine explanation, not just "an algorithm" |
| Know / Delete                          | CCPA     | 45 cal days      | +45                                                                                      |
| Opt-out of sale/share                  | CCPA     | 15 business days | none                                                                                     |
| Limit Sensitive PI                     | CCPA     | 15 business days | none                                                                                     |
| Access / Delete (consumer health data) | WA MHMDA | 45 cal days      | +45                                                                                      |

The job runner needs to respect the tightest SLA across all applicable jurisdictions, not the longest.

### 4.4 Right to Erasure — the mobile-data scope question (open)

The user pre-surfaced this and it deserves explicit treatment. When a Quilty mobile user invokes erasure via the website, the website tier holds essentially nothing (per D31 — zero PHI on website tier). The actual data lives in the Rust backend (HIPAA OU) and is durable across the mobile + web boundary because the join key is `cognito_sub` (D11).

**Two viable scope policies (D-candidate, see §10):**

- **(A) Web-only erasure:** the website tier deletes its consent record + any non-PHI account preferences and instructs the user to file a separate erasure with the mobile-app DPO. This keeps the BAA scope clean but is hostile UX and fails GDPR Art. 17(1) ("undue delay") if Quilty is one continuous controller.
- **(B) Unified erasure:** the web `/privacy/request?type=erase` calls the Rust backend's `RevokeIdentity` API, which cascades through Cognito (user delete), DynamoDB (account record), and the HIPAA bucket (encrypted PHI). This is the GDPR-correct posture but requires cross-account IAM + audit logging across the BAA boundary.

**Recommendation:** ship (B) but with a confirmation step that explicitly enumerates _what_ will be erased ("Your Quilty account, all session data, all in-app journals…"). This is also what BetterHelp's $7.8M FTC consent decree effectively requires.

---

## 5. Jurisdictional matrix table

Which laws apply to a pre-launch US-first consumer mental-health app with EU+UK as Phase 2, where to surface controls, and which provisions are stricter than CCPA (the implementation floor).

| Law                     | Effective                           | Stricter than CCPA?                        | Where surfaced                                                                                             |
| ----------------------- | ----------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **EU GDPR**             | 2018-05-25                          | Yes (opt-in for analytics)                 | banner + `/privacy/request` + DPA self-serve                                                               |
| **UK GDPR / DPA 2018**  | 2018; updated by DUAA 2025          | Same as EU GDPR                            | folded into EU flow                                                                                        |
| **CCPA / CPRA**         | 2020-01-01 / 2023 + 2026 amendments | implementation floor                       | `/privacy/choices` + GpcHonoredIndicator + Sensitive-PI limit link                                         |
| **VCDPA (Virginia)**    | 2023-01-01                          | Sensitive opt-in                           | folded into US opt-in                                                                                      |
| **CPA (Colorado)**      | 2023-07-01                          | Sensitive opt-in + UOOM                    | folded; included in Sept 2025 GPC sweep                                                                    |
| **CTDPA (Connecticut)** | 2023-07-01                          | Sensitive opt-in + UOOM                    | folded; included in Sept 2025 GPC sweep                                                                    |
| **UCPA (Utah)**         | 2023-12-31                          | No                                         | folded into US opt-out                                                                                     |
| **TDPSA (Texas)**       | 2024-07-01                          | Yes (opt-in for sensitive)                 | folded; first enforcement Jan 2025 against Allstate/Arity                                                  |
| **OCPA (Oregon)**       | 2024-07-01 (501c3 2025-07-01)       | Sensitive opt-in                           | folded                                                                                                     |
| **FDBR (Florida)**      | 2024-07-01                          | $1B revenue threshold — likely N/A         | monitor                                                                                                    |
| **MCDPA (Montana)**     | 2024-10-01                          | Sensitive opt-in                           | folded                                                                                                     |
| **WA MHMDA**            | 2024-03-31 (small biz 2024-06-30)   | **YES — strictest**                        | dedicated section in privacy policy + dual opt-in (collection + share) + standalone consumer health policy |
| **TIPA (Tennessee)**    | 2025-07-01                          | Yes                                        | folded                                                                                                     |
| **Iowa CDPA**           | 2025-01-01                          | No                                         | folded                                                                                                     |
| **Delaware DPDPA**      | 2025-01-01                          | Sensitive opt-in                           | folded                                                                                                     |
| **Nebraska NDPA**       | 2025-01-01                          | Sensitive opt-in                           | folded                                                                                                     |
| **New Hampshire NHPA**  | 2025-01-01                          | Sensitive opt-in                           | folded                                                                                                     |
| **New Jersey NJCPA**    | 2025-01-01                          | Sensitive opt-in + UOOM                    | folded                                                                                                     |
| **Minnesota CDPA**      | 2025-07-31                          | Sensitive opt-in                           | folded                                                                                                     |
| **Maryland MODPA**      | 2025-10-01                          | Yes — data minimization, no sensitive sale | folded; consumer health data treated like MHMDA                                                            |
| **Nevada SB220**        | health data law 2024                | Yes (consumer health)                      | folded with MHMDA                                                                                          |
| **Quebec Law 25**       | phased 2022–2024                    | Yes (consent)                              | folded for Canadian users post-Phase 2                                                                     |
| **LGPD (Brazil)**       | 2020                                | Similar to GDPR                            | folded; defer until Brazil traffic warrants                                                                |
| **PIPL (China)**        | 2021                                | Strict — usually requires no-China posture | block China at the edge                                                                                    |

### 5.1 Posture: universal opt-in floor

Because (a) WA MHMDA requires affirmative opt-in for consumer health data collection AND a separate opt-in for sharing, (b) seven+ US state laws require opt-in for sensitive PI (which under CPRA includes "personal information collected and analyzed concerning a consumer's health"), and (c) GDPR + UK GDPR require opt-in for non-essential analytics, we ship a **single universal opt-in posture** regardless of geo. Geo-detection adds operational cost without compliance benefit; the floor is the strictest applicable rule.

Geo-aware flows are still required for two narrow purposes: (1) showing the GpcHonoredIndicator only when the request comes from a US IP (or has GPC set, which is the operative signal anyway), and (2) showing the EAA Accessibility Statement enforcement-authority contact appropriate to the user's EU member state.

### 5.2 WA MHMDA-specific obligations (the strictest applicable law)

MHMDA earns its own dedicated treatment because Quilty is squarely a "consumer health data" entity under its definition. Concrete obligations:

- **Standalone Consumer Health Data Privacy Policy** linked from the homepage — separate from the main Privacy Policy, with no marketing language, listing the specific affiliates and categories of third parties receiving CHD.
- **Two separate opt-ins** — one for collection, one for sharing (the latter must not be bundled with the former).
- **Standalone written authorization** for any sale, with one-year expiration, retained for six years.
- **45-day rights response** with one possible 45-day extension.
- **Geofencing ban** — no location targeting within 2,000 feet of any healthcare facility. We have no advertising program at launch, but this binds any future Meta/Google Ads pixels and any future SDK in the mobile app that collects location.
- **Penalties:** $7,500 per violation under the WA Consumer Protection Act, per-se violation framework, **private right of action with treble damages up to $25,000**. First class action filed Feb 10, 2025 against an online retailer for SDK location collection — directly relevant precedent.

---

## 6. Sub-processor + Trust Center strategy

### 6.1 Initial sub-processor list

A single page at `/legal/subprocessors` lists every vendor that processes personal data on Quilty's behalf. Initial list at M1.5:

| Vendor              | Service                                                                 | Data category                                                                          | Region                        | DPA URL                                 |
| ------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------- |
| Amazon Web Services | hosting (CloudFront, Lambda, DynamoDB, S3, Cognito)                     | all categories                                                                         | us-east-1, us-east-2          | aws.amazon.com/service-terms/           |
| Sentry              | error monitoring + RUM                                                  | technical telemetry, optional session replay (gated on analytics consent + error-only) | US (Sentry Business tier)     | sentry.io/legal/dpa/                    |
| Amplitude           | product analytics + experimentation + replay + flags                    | usage events, device id (after consent)                                                | US (with EU residency option) | amplitude.com/legal/dpa                 |
| Stripe              | payment processing                                                      | name, email, card metadata, billing address                                            | US                            | stripe.com/legal/dpa                    |
| RevenueCat          | mobile IAP receipt validation (mobile-only; mentioned for completeness) | purchase events                                                                        | US                            | revenuecat.com/dpa                      |
| Cloudflare          | DNS, edge security                                                      | technical telemetry                                                                    | global                        | cloudflare.com/cloudflare-customer-dpa/ |
| Linear              | internal issue tracking (incident response)                             | only if user files a support request                                                   | US                            | linear.app/dpa                          |
| 1Password           | secrets management (no user data)                                       | internal-only                                                                          | US                            | 1password.com/legal/dpa/                |

**Subscribe-to-changes mechanism (D-candidate, see §10):** maintain `/legal/subprocessors.rss` with one entry per addition, plus an email list users can subscribe to from `/legal/subprocessors?subscribe=email`. 30-day notice before a sub-processor change becomes effective — this is the GDPR Article 28 norm and the standard SaaS DPA promise (Stripe, Cloudflare, HubSpot all use 30 days).

### 6.2 Trust Center — `trust.my-quilty.com` subdomain

The Linear / Stripe / Anthropic / Vercel pattern is converging on a dedicated `trust.<brand>` subdomain hosting:

- SOC 2 / HIPAA / ISO posture (downloadable reports under NDA)
- Sub-processor list (mirrors `/legal/subprocessors`)
- DPA download (PDF + clickwrap version)
- Security overview (incident history, pen test summary, encryption details)
- Vulnerability disclosure policy (links to `/.well-known/security.txt`)
- Status page link

**Recommendation:** use the SafeBase or Vanta-hosted Trust Center pattern but **not the hosted product** — at our scale (solo team, pre-revenue) the $15K+/year SafeBase line item or the Vanta-Trust-Center bundle is premature. Instead, scaffold `trust.my-quilty.com` as a static Next.js site in the same monorepo under `apps/trust/` (deferred to M5/M6 when the first DPA gets signed). Reserved subdomain now via DNS placeholder; nothing else ships at M1.

This also gives us a clean migration path: when we hit ~50 enterprise prospects we move to SafeBase, redirect the static site, and the URL structure doesn't change.

### 6.3 DPA self-serve (M5+ trigger)

Clickwrap DPA per the Cloudflare / Stripe / HubSpot pattern. Deferred until `/for-business` page actually accepts signups. At that point: `/legal/dpa` hosts a pre-filled DPA with EU SCCs Module 2 (Controller-to-Processor) and Module 3 (Processor-to-Processor) incorporated by reference. Acceptance is a checkbox at B2B signup with the "binding authority" warranty (per Cloudflare's model). The signed DPA gets a timestamped UUID emailed to the signing user + stored in DynamoDB.

---

## 7. Accessibility Statement template (EAA 2025-ready)

`/legal/accessibility` (alias `/accessibility` for SEO + regulator forms — both routes serve the same content, both indexed). Required because the EAA went enforceable June 28, 2025 for any service offered to EU consumers; we don't qualify for the micro-enterprise exemption (turnover under €2M is ambiguous pre-launch, and once it's clearly above we'd have to add the statement anyway — easier to ship now).

**Template:**

> **Accessibility Statement for my-quilty.com**
>
> Last reviewed: 2026-05-19
> Last tested: [DATE]
>
> **Our commitment**
> Quilty is committed to ensuring digital accessibility for people with disabilities. We continually work to improve the user experience for everyone, and we apply the relevant accessibility standards.
>
> **Conformance status**
> This website aims to conform to the **Web Content Accessibility Guidelines (WCAG) 2.2 Level AA**. WCAG 2.2 defines requirements to make web content more accessible to people with disabilities.
>
> [Current status — pick one]: - '**Fully conforms** with WCAG 2.2 Level AA.'
>
> - "**Partially conforms** with WCAG 2.2 Level AA. The known accessibility issues are listed below."
>
> **Known accessibility issues**
> [list — be honest; the EU's own statement names specific issues by URL]
>
> **Feedback**
> We welcome your feedback on the accessibility of my-quilty.com. Please let us know if you encounter accessibility barriers:
>
> - Email: accessibility@my-quilty.com
> - Web form: /contact?topic=accessibility
>   We aim to respond within **15 business days**.
>
> **Enforcement procedure**
> If you are not satisfied with our response, you may contact the supervisory authority in your EU member state. A list of national authorities is available at [link to the European Commission's authority list].
>
> **Preparation of this statement**
> This statement was prepared on 2026-05-19. It was last reviewed on 2026-05-19. It is based on a self-assessment using a combination of automated testing (axe-core in CI, per D22-D23) and manual review.

**Operational requirements:**

- `accessibility@my-quilty.com` must route to a human inbox (M2 deliverable).
- 15-business-day response SLA is documented in the internal runbook (modeled on the EU's own statement).
- Statement gets a `Last reviewed` bump at each major release that touches the user-facing UI; quarterly review minimum even if nothing visible changed.

**VPAT / ACR:** maintain a Voluntary Product Accessibility Template for any enterprise sales. Defer until first procurement request.

---

## 8. Gap list classified

### TIER A — Foundation, must close before M2 ships

| Gap                                                 | Why now                                                            | Estimate                    |
| --------------------------------------------------- | ------------------------------------------------------------------ | --------------------------- |
| Cookie banner + preference center                   | Cannot load Amplitude or Sentry replay legally without it          | 5 days                      |
| Cookie taxonomy lock at v1                          | Grandfathers every future consent record                           | 1 day (mostly decision)     |
| GpcHonoredIndicator                                 | Mandatory CCPA §7025(c)(6) since 2026-01-01; CA-CO-CT sweep active | 1 day                       |
| `/privacy/request` intake form + DSAR URL structure | Binds external regulator filings                                   | 3 days                      |
| `/legal/subprocessors` page + initial list          | DPA prerequisite; Article 28 baseline                              | 1 day                       |
| `/legal/accessibility` statement                    | EAA enforceable since 2025-06-28                                   | 1 day                       |
| Server-side ConsentState mirror to DynamoDB on auth | D63 lock; required for cross-device consent (Disney $2.75M lesson) | 2 days (depends on M6 auth) |

### TIER B — Should close before public launch (M4–M6)

| Gap                                                                      | Estimate                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------- |
| MHMDA standalone Consumer Health Data Privacy Policy                     | 1 day + lawyer review                              |
| `/privacy/choices` + "Limit Sensitive PI" + "Do Not Sell or Share" links | 2 days                                             |
| Right-to-Erasure unified flow (scope decision per §4.4)                  | 3–5 days; depends on Rust backend `RevokeIdentity` |
| Cookie audit CI job (`pnpm test:cookies`)                                | 1 day                                              |
| Re-consent on policy bump (`policy_version` versioning)                  | 1 day                                              |
| Trust Center static site reserved at `trust.my-quilty.com`               | DNS placeholder only at M1                         |
| 30-day sub-processor change notice mechanism                             | 1 day                                              |
| Privacy Policy rewrite per §11 anti-overclaim discipline                 | lawyer milestone (M8)                              |
| Cookie Policy: per-cookie disclosure table                               | 1 day                                              |

### TIER C — Trigger-driven (M7+)

| Gap                                                           | Trigger                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| DPA self-serve clickwrap at `/legal/dpa`                      | First B2B signup at `/for-business`                                                 |
| `trust.my-quilty.com` populated content                       | First enterprise procurement request OR ~50 B2B prospects                           |
| VPAT / ACR                                                    | First enterprise procurement RFP                                                    |
| Age gate (COPPA mixed-audience analysis)                      | If site traffic shows >5% likely-under-18 patterns, OR if marketing to teens begins |
| LGPD posture (Portuguese localization + Brazil flow)          | Brazil traffic >1%                                                                  |
| Quebec Law 25 posture (French-CA localization)                | Canada traffic >1%                                                                  |
| Data Protection Impact Assessment (DPIA) template + first run | New feature touching sensitive data; or pre-launch as a one-off                     |
| Incident notification runbook (GDPR 72-hour)                  | First incident — but template should be drafted at M6                               |
| Authorized agent flow (CCPA)                                  | First authorized-agent request                                                      |
| Children-product policy                                       | If any feature ever targets <18                                                     |

---

## 9. Conflicts with existing D-decisions

1. **D35 + this report:** D35 says ConsentState is the single source of truth. This report extends to say the cookie banner UI is a _projection_ of that state, not a parallel source. No conflict — but D35 implementation language should be updated to mention the cookie-banner projection rule.

2. **D42b reversion to Amplitude (2026-05-19):** Round 5 had locked PostHog Cloud Boost in D42b/D43; this audit notes the pivot back to Amplitude. The cookie taxonomy table in §3 now lists `AMP_<key>` + `AMP_MKTG_<key>` cookies; the PostHog cookies (`ph_*`) should be removed from any in-flight planning. **D43 (feature flags) also needs revision** — the in-prep plan was PostHog flags-at-trigger. With Amplitude reverted, the flag trigger should switch to Amplitude Experiment (or a build-flag-from-env-vars-only posture if Experiment isn't budget-approved). Noted as a flag for the strategy-doc update.

3. **D62 visible GpcHonoredIndicator:** D62 locked this; this report just specifies the component contract. No conflict.

4. **D63 DynamoDB-backed ConsentState:** D63 says DynamoDB for audit. This report specifies the auth-time mirror handshake and the version-bump grandfathering. No conflict — but D63 implementation must include the `policy_version` field.

5. **D31 zero PHI in website tier:** Erasure scope §4.4 surfaces a tension. Option B (unified erasure) crosses the BAA boundary via Rust backend API call. The boundary stays clean _if_ the website tier only ever holds the request UUID and the Rust backend does the actual deletion. Operationally fine; needs to be explicit in the runbook.

6. **D67 PHI sanitizer chokepoint:** No direct conflict — the consent banner is by definition non-PHI. But the DSAR intake form (`/privacy/request`) collects email + freeform text. The freeform text MUST be sanitized through the existing `lib/observability/sanitize.ts` before it goes into any log line or Sentry breadcrumb.

7. **CLAUDE.md "NEVER" list — accessibility overlays:** Reinforced. The accessibility statement explicitly self-assesses against WCAG 2.2 AA via axe-core + manual review; no overlay involvement, no "compliance achieved by widget" language.

---

## 10. Recommended new D-decisions

To bring back to the strategy doc as locked decisions:

- **D70 — Cookie banner is built native, not vendor-procured.** Reject Cookiebot/OneTrust/CookieYes/Osano/Consent-Hub. Rationale: vendor banners want to be the ConsentState source of truth (conflicts with D35); their JS payload (200–800KB) is hostile to performance; vendor microcopy defaults to legalese (conflicts with the conversational-microcopy posture). Build cost is ~5 days; integration debt avoided is forever.

- **D71 — Cookie taxonomy v1 lock with five categories.** Strictly necessary / Functional / Analytics / Marketing / Personalization. Marketing + Personalization ship visible-but-empty to grandfather the schema. Adding a category bumps `v` and triggers re-prompt only for affected users.

- **D72 — Consent record schema includes `policy_version`.** Re-prompt triggers only on `v` bump or `policy_version` bump; never on plain revisit. Honors CNIL "no re-prompt for at least six months absent material change" guideline.

- **D73 — DSAR URL canonical structure.** `/account/data` (auth), `/privacy/request` (no-auth), `/privacy/choices`, `/privacy/contact`. Locks external regulator filings + DPA annex pointers. Aliases `/accessibility` → `/legal/accessibility` for SEO + regulator forms.

- **D74 — Right-to-Erasure scope: unified (Option B).** Web `/privacy/request?type=erase` calls Rust backend `RevokeIdentity` API. Cross-account IAM + audit logging required, but the GDPR-Art-17 + MHMDA + BetterHelp-consent-decree posture is correct. Confirmation step must enumerate exactly what will be erased.

- **D75 — Universal opt-in floor regardless of geo.** Single posture; no geo gating of the consent banner. Geo-detection is reserved for (a) GpcHonoredIndicator US-only display, (b) EAA enforcement-authority contact selection.

- **D76 — Sub-processor 30-day notice + RSS + email subscribe.** `/legal/subprocessors.rss` + email list. 30-day notice before any sub-processor change becomes effective. Matches Stripe/Cloudflare/HubSpot SaaS norm.

- **D77 — Accessibility Statement at `/legal/accessibility` with `/accessibility` alias.** WCAG 2.2 AA target. 15-business-day feedback SLA. `accessibility@my-quilty.com` routes to human inbox. Updated at every major UI release.

- **D78 — Trust Center deferred to `trust.my-quilty.com` static site (M5/M6 scaffold trigger).** DNS placeholder now. SafeBase/Vanta-hosted product deferred until ~50 enterprise prospects or first procurement RFP. Migration path: static Next.js → SafeBase redirect with zero URL break.

- **D79 — DPA self-serve clickwrap deferred until `/for-business` accepts signups.** EU SCCs Module 2 + Module 3 incorporated by reference. Pre-filled annexes. Binding-authority warranty per Cloudflare model. Stored with timestamped UUID in DynamoDB.

- **D80 — WA MHMDA standalone Consumer Health Data Privacy Policy at `/legal/consumer-health`.** Separate from main Privacy Policy, no marketing language, listing specific affiliates + categories of third parties receiving CHD. Dual opt-in (collection + share). 45-day rights response with one 45-day extension. Standalone written authorization for any sale with one-year expiration, retained six years.

- **D81 — Anti-overclaim language discipline in marketing.** No "100% private," no "HIPAA-compliant" before BAA signed, no "bank-grade security" without specifics. Mirror Apple's principles-first language ("we believe…"). Direct enforcement risk per FTC/Cerebral and FTC/BetterHelp consent decrees.

- **D82 — Cookie audit CI job.** Playwright job in CI visits homepage with empty / accept-all / GPC-honored consent states, dumps cookies via CDP, diffs against declared taxonomy. Fails the build on drift.

---

## 11. Open scope questions

These need user disposition; defaults are stated to enable autonomous progress if no answer.

1. **GDPR export — mobile data scope?** (User pre-surfaced.) When a signed-in user clicks "Export my data" on the website, does the export include data the mobile app holds (journals, mood logs, voice notes)?
   - **Default if no answer:** Yes — unified export, cross-BAA-boundary, via Rust backend `Export` API. Same architectural pattern as D74 erasure. The website tier collects only the request UUID; the Rust backend assembles the export and delivers a signed S3 URL.
   - **Counter-argument:** the BAA boundary could prefer that the mobile app handles its own data export to keep PHI out of website-account principals entirely. But that's hostile UX and arguably violates GDPR Art. 20 portability if Quilty is one continuous controller.

2. **DSAR identity verification — how strict for opt-out requests?** GDPR allows challenging requests when identity cannot be verified, but the CCPA "frictionless processing" rule (§7025(f)) penalizes friction. Are signed verification emails enough, or do we need additional checks for the riskier requests (erasure)?
   - **Default if no answer:** Email-link verification is sufficient for all request types except erasure of signed-in accounts, which requires the existing `prompt=login` step-up (D54).

3. **Anti-overclaim marketing language — pre-lawyer or post-lawyer?** §11 / D81 says no "HIPAA-compliant" claims before BAA signed. Some marketing copy in `apps/web/app/[locale]/(marketing)/science/` and `for-business/` may already reach toward this language pre-M8.
   - **Default if no answer:** Pre-launch copy must use "we follow HIPAA-aligned practices" or "designed with HIPAA principles in mind" — not "HIPAA-compliant." Locked into a M2 copy-review checklist.

4. **Age gate now or never-unless-triggered?** COPPA "directedness" analysis hangs on whether the site is "primarily directed to children." Adult-targeted mental health is not, but if marketing ever pivots to teens (which it well might — depression rates in 15-19 cohort are the highest in any age band) the age gate becomes mandatory.
   - **Default if no answer:** No age gate at M1. Reserved as Tier C trigger. Include "you must be 18 or older" in the Terms now to anchor the contractual posture.

5. **Geofencing posture for future advertising?** WA MHMDA's 2,000-foot ban around healthcare facilities is absolute (no consent exception). If we ever ship Meta or Google Ads pixels, this needs to be encoded into the targeting rules.
   - **Default if no answer:** D80 explicitly notes this. No advertising at M1 means no immediate work, but the no-advertising-via-pixel posture should be locked as D-candidate to prevent regression.

6. **Where does the `/accessibility` ↔ `/legal/accessibility` aliasing go — redirect or shared rendering?** Both pages need to serve the same content for regulator-discoverability and SEO.
   - **Default if no answer:** `/accessibility` 301-redirects to `/legal/accessibility`. The latter is the canonical URL. Avoids duplicate content. Robots.txt allows both.

7. **Cookie banner localization — English at M1, but what about other locales for the EU phase?** EAA requires accessibility statement in the languages we serve. Same logic should extend to the cookie banner.
   - **Default if no answer:** English-only at M1 per D14 + D25. When `/[locale]/...` expands to additional locales (M5+), the banner microcopy + cookie taxonomy descriptions + DSAR intake form become translation deliverables, not the consent record itself (which is structured JSON, locale-independent).

8. **Sentry session replay — opt-in even with denial-by-default?** Sentry session replay (D42a, error-triggered) implicitly captures DOM state. Even gated on `analytics === true`, this raises the question of whether the user opted into replay specifically.
   - **Default if no answer:** Replay is sub-gated on `analytics === true` AND a separate flag in the preference center labeled "Help us debug errors by recording session activity when an error occurs." Default off even when analytics is on. This is stricter than Amplitude's own best-practices guide recommends — the upside is we're never the test case for FTC enforcement on the consumer-health-app replay surface.

---

## Sources

**MHMDA (Washington):**

- Washington My Health My Data Act FAQ Part Two, Cooley (cdp.cooley.com/washington-states-my-health-my-data-act-faq-part-two-requirements/)
- Washington's My Health, My Data Act overview, IAPP (iapp.org/resources/article/washington-my-health-my-data-act-overview)
- MHMDA Compliance Guide, Accountable HQ (accountablehq.com/post/washington-my-health-my-data-act-mhmda-summary-key-requirements-and-compliance-guide)
- Washington AG enforcement page (atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy)

**EAA + WCAG 2.2:**

- AccessibleEU: EAA comes into effect June 2025 (accessible-eu-centre.ec.europa.eu)
- Bird & Bird EAA navigation guide (twobirds.com/en/insights/2025/a-guide-to-navigating-the-european-accessibility-act)
- Deque EAA top 20 FAQs (deque.com/blog/european-accessibility-act-eaa-top-20-key-questions-answered/)
- iubenda EAA Accessibility Statement template (iubenda.com/en/blog/european-accessibility-act-eaa-accessibility-statement-guide-template-2/)
- EU's own accessibility statement (european-union.europa.eu/accessibility-statement_en)
- W3C WCAG 2.2 (w3.org/TR/WCAG22/)

**CCPA §7025(c)(6) + GPC:**

- CPPA finalized rules approved Sept 23, 2025 (gtlaw.com/en/insights/2025/9/revised-and-new-ccpa-regulations-set-to-take-effect-on-jan-1-2026)
- Multistate Privacy Enforcement Sweep, Goodwin (goodwinlaw.com/en/insights/publications/2025/09/alerts-technology-dpc-multistate-privacy-enforcement-sweep)
- GPC compliance 2026, Didomi (didomi.io/blog/global-privacy-control-gpc-2026)
- California AG GPC page (oag.ca.gov/privacy/ccpa/gpc)
- Disney + Ford GPC enforcement settlements (Consenteo overview)

**Cookie banner UX + CNIL enforcement:**

- DataGrail Cookie Consent Style Guide (datagrail.io/blog/data-privacy/cookie-consent-style-guide-best-practices)
- Secure Privacy: How to Design High-Performing Cookie Banners in 2026 (secureprivacy.ai/blog/cookie-banner-design-2026)
- Cookie Information: CNIL's enforcement is real (cookieinformation.com/blog/cnil-formal-notice-dark-patterns-website-cookie-banners/)
- Consenteo GDPR Cookie Consent in 2026 (consenteo.com/knowledge-hub/GDPR/gdpr_cookie_consent_2026)
- EDPB Guidelines 2/2023 (final October 2024) and 3/2022 deceptive design patterns

**DSAR + state laws:**

- BigID DSAR overview (bigid.com/blog/what-is-dsar/)
- Didomi DSAR complete guide (didomi.io/blog/data-subject-access-request-dsar-the-complete-guide)
- DataGrail glossary (datagrail.io/glossary/data-subject-access-request-dsar/)
- Termly state-by-state tracker (termly.io/us-data-privacy-laws/)
- TrustArc state laws 2025 update (trustarc.com/resource/us-consumer-privacy-laws-2025-update/)
- Sidley state law effective-dates timeline PDF

**CPRA sensitive PI:**

- IAPP: New categories, new rights — the CPRA's opt-out provision for sensitive data (iapp.org/news/a/new-categories-new-rights-the-cpras-opt-out-provision-for-sensitive-data)
- Osano: How to Navigate the CPRA's 'Limit the Use of My Sensitive Personal Information' Mandate
- CookieYes: What is CPRA Sensitive Personal Information

**FTC enforcement (the Cerebral lesson):**

- FTC/Cerebral + FTC/Monument April 2024 announcements (ftc.gov/news-events/news/press-releases/2024/04/...)
- Davis Wright Tremaine: FTC Targets Tracking Pixels
- Privado AI: FTC's Health Privacy Crackdown 5 Key Lessons
- Feroot: Pixel Tracking Violations Cost US Healthcare $100M+

**Sub-processors + Trust Centers:**

- Anthropic Trust Center (trust.anthropic.com/subprocessors)
- Vanta Trust Center docs (help.vanta.com/en/articles/11345469-vanta-trust-center)
- ComplyJet: Is the Vanta Trust Center Worth It? (complyjet.com/blog/vanta-trust-center)
- Cloudflare DPA (cloudflare.com/cloudflare-customer-dpa/)
- Stripe DPA (stripe.com/legal/dpa)

**Privacy policy structure:**

- TermsBox standard privacy policy 2026 (termsbox.com/blog/standard-privacy-policy-for-website)
- Enzuzo privacy policy examples 2026 (enzuzo.com/blog/best-privacy-policy-examples)
- Apple Consumer Health Personal Data Privacy Policy (apple.com/legal/privacy/consumer-health-personal-data/en-ww/)
- Stripe Privacy Center (stripe.com/legal/privacy-center)

**Amplitude consent:**

- Amplitude Cookies and Consent Management JavaScript SDK (amplitude.com/docs/sdks/analytics/browser/cookies-and-consent-management-javascript-sdk)
- Amplitude best practices for managing user consent (Session Replay) (amplitude.com/docs/session-replay/best-practices-for-managing-user-consent)

**Next.js + RSC cookie banner pattern:**

- Build with Matija: Next.js Cookie Consent Banner (buildwithmatija.com/blog/build-cookie-consent-banner-nextjs-15-server-client)
- PostHog Next.js cookie banner tutorial (posthog.com/tutorials/nextjs-cookie-banner)
- Cookietrust React/Next.js GDPR guide

**COPPA 2025:**

- Loeb & Loeb: Children's Online Privacy in 2025: The Amended COPPA Rule
- Promise Legal COPPA 2025 practical guide (blog.promise.legal/startup-central/coppa-compliance-in-2025-a-practical-guide-for-tech-edtech-and-kids-apps/)
- Mayer Brown: Little Users, Big Rules tracker (Jan 2026)

**DPA clickwrap:**

- Ironclad: What Is a Clickwrap Agreement? (ironcladapp.com/journal/contract-management/what-is-a-clickwrap-agreement)
- Promise Legal DPA template 2025 (promise.legal/templates/dpa)
- Hyperstart DPA guide 2026 (hyperstart.com/blog/dpa-agreement/)
