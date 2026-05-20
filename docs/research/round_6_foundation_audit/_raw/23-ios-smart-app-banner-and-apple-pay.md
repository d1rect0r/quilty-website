# 23 — iOS Smart App Banner + Apple Pay merchant verification + iOS-specific web patterns

**Round 6 foundation audit — C13 / C14 + iOS-domain completeness scan**
**Date:** 2026-05-19
**Scope:** Read-only research. Outputs default recommendations for C13 + C14 and surfaces iOS-specific web patterns not yet captured in the decision log.

---

## 1. Executive summary

**C13 — Smart App Banner (`<meta name="apple-itunes-app">`):** Recommend **defer to M9+** and ship **App Links meta (`al:ios:app_store_id` / `al:android:package`) at M2 instead**. Peer evidence is decisive: of 12 consumer mental-health / consumer-health peers surveyed (Headspace, Calm, BetterHelp, Talkspace, Cerebral, Mindbloom, Noom, Brightline, Spring Health, Modern Health, Aura, Insight Timer, Replika, Wysa, Woebot, Ginger), **only Talkspace ships a Smart App Banner on its homepage.** Headspace — the category leader — explicitly chose Facebook App Links over Smart App Banners. Universal Links (which our AASA already enables once mobile is verified) gives us a non-dismissable banner automatically when the app is installed, so the Smart App Banner's only marginal value is "promote install to users who don't have the app" — and that's the exact copy decision we said should defer to brand identity (M3). Until brand identity is locked, shipping a generic Smart App Banner adds CLS risk, dilutes hero impressions on mobile (the banner steals ~70px above the fold on iPhone), and forces a copy decision before voice is settled.

**C14 — Apple Pay merchant verification (`/.well-known/apple-developer-merchantid-domain-association`):** Recommend **M7 with Stripe, no earlier**. The file is Stripe-owned (same bytes for every Stripe merchant) and gets injected via Stripe's **Payment Method Domains API** when we register the domain — there is no value to shipping it pre-Stripe. Doing it earlier just adds a file to track that proves nothing about our merchant readiness. The whole flow takes ~10 minutes when M7 starts.

---

## 2. Smart App Banner peer survey — raw data (curl with iOS Safari UA, 2026-05-19)

| Peer                          | Smart App Banner?                                                       | App Links meta?                       | apple-touch-icon                           | apple-mobile-web-app-\*                                                   | theme-color     |
| ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- | --------------- |
| **Headspace**                 | NO                                                                      | YES (`al:ios:app_store_id=493145008`) | (favicon only — no apple-touch-icon found) | NO                                                                        | NO              |
| **Calm**                      | NO                                                                      | (not found in head)                   | YES (`/apple-icon.png`)                    | NO                                                                        | NO              |
| **BetterHelp**                | NO                                                                      | (not found)                           | YES (precomposed, 120x120)                 | NO                                                                        | NO              |
| **Talkspace**                 | **YES — `app-id=661829386, app-argument=https://app.adjust.io/29i9b5`** | NO                                    | YES (Webflow CDN webclip.png)              | YES (`apple-mobile-web-app-title=Talkspace`)                              | NO              |
| **Cerebral**                  | NO                                                                      | NO                                    | NO                                         | NO                                                                        | NO              |
| **Mindbloom**                 | NO                                                                      | NO                                    | YES (Webflow webclip.png)                  | NO                                                                        | NO              |
| **Noom**                      | NO                                                                      | NO                                    | YES (180x180)                              | NO                                                                        | NO              |
| **Brightline**                | NO                                                                      | NO                                    | NO                                         | YES (`apple-mobile-web-app-title=Brightline`, `status-bar-style=default`) | NO              |
| **Spring Health**             | NO                                                                      | NO                                    | NO                                         | NO                                                                        | NO              |
| **Modern Health**             | NO                                                                      | NO                                    | YES (Webflow webclip.png)                  | NO                                                                        | NO              |
| **Aura Health**               | NO                                                                      | NO                                    | YES (Webflow)                              | NO                                                                        | NO              |
| **Insight Timer**             | NO                                                                      | NO                                    | NO                                         | NO                                                                        | YES (`#000000`) |
| **Replika**                   | NO                                                                      | NO                                    | YES (`/apple-icon.png` 180x180)            | NO                                                                        | YES (`#FFFFFF`) |
| **Wysa**                      | NO                                                                      | NO                                    | YES (Strikingly CDN, 58x58)                | NO                                                                        | NO              |
| **Woebot**                    | NO                                                                      | NO                                    | YES (WordPress, 180x180)                   | NO                                                                        | NO              |
| **Ginger (Headspace Health)** | NO                                                                      | NO                                    | YES (Webflow)                              | NO                                                                        | NO              |

**Single peer using Smart App Banner: Talkspace (1/16 = 6%).** And Talkspace's `app-argument` points at an Adjust attribution URL (`app.adjust.io/29i9b5`), which means they're treating it primarily as an attribution channel, not a UX upgrade.

**Headspace's choice is the strongest signal.** Headspace ships:

- `<meta property="al:ios:app_store_id" content="493145008">`
- `<meta property="al:ios:app_name" content="Headspace">`
- `<meta property="al:android:package" content="com.getsomeheadspace.android">`
- `<meta property="al:android:app_name" content="Headspace">`

This is **Facebook's App Links protocol** — it makes deep linking work from Facebook / Instagram / WhatsApp / iMessage in-app browsers (which Smart App Banner cannot reach because they're not Safari) without imposing Safari's Smart App Banner UI on the homepage.

---

## 3. Smart App Banner UX evolution 2024-2026

**The meta tag itself is not deprecated.** Apple's WebKit documentation still references it as of April 2025 ([Apple Developer: Promoting Apps with Smart App Banners](https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners)). The July 2024 "App Store Package XML decommissioning" is unrelated (it's the back-end metadata pipeline, not the HTML meta tag).

**But adoption is collapsing.** Three trends converge:

1. **Universal Links banner overlaps the use case.** Since iOS 9, if the app is installed AND the URL matches an AASA pattern, Safari draws a smaller persistent "Open in [App]" banner automatically — and **this banner cannot be disabled**. ([Apple Developer Forums thread 105129](https://developer.apple.com/forums/thread/105129)) So once we ship AASA correctly, the "user has app installed" path is already served. Smart App Banner only adds value for "user does NOT have app installed."

2. **The 'install' path is increasingly handled by paid Apple Search Ads + AdAttributionKit/SKAN.** As of April 2025, Apple Ads registered with AdAttributionKit ([Singular blog](https://www.singular.net/blog/apple-search-ads-skadnetwork/), [PPC Land](https://ppc.land/apple-search-ads-to-adopt-adattributionkit-for-unified-app-attribution/)), unifying ASA with SKAN. Marketing teams now optimize install acquisition via ASA + paid social rather than Smart App Banner organic conversion.

3. **In-app browsers eat the Smart App Banner.** Most mobile-web traffic to consumer apps now arrives via Facebook / Instagram / TikTok / Threads in-app browsers, which are **not Safari and do not render the Smart App Banner**. Facebook's App Links protocol (`al:ios:app_store_id`, etc.) is what those in-app browsers consume. This is why Headspace prioritized App Links.

**Sticky dismissal:** Once a user taps the "x" on the Smart App Banner, Safari suppresses it for that domain forever unless the user clears Safari history. So the banner gets one shot per user. This makes copy-quality critical and confirms our preference to defer until brand voice is locked.

**iOS 26 wrinkle (Sept 2025):** Safari 26 + iOS 26's new "Add to Home Screen → open as web app by default" toggle ([brainhub.eu](https://brainhub.eu/library/pwa-on-ios), [mobiloud blog](https://www.mobiloud.com/blog/progressive-web-apps-ios)) does NOT replace Smart App Banner — it's an orthogonal "save the website as a PWA" path. Users who add Quilty marketing site to home screen get a PWA shortcut, not an app install.

---

## 4. Apple Pay merchant verification flow with Stripe

**The file:** `/.well-known/apple-developer-merchantid-domain-association` — a static cryptographic signature file, served with `Content-Type: text/plain` (or `application/octet-stream`; Stripe doesn't enforce, but Apple's verifier expects plaintext bytes).

**The Stripe-specific twist:** The file is **Stripe's, not ours.** All Stripe merchants serve the same bytes — it proves "this domain is registered with Stripe's Apple Pay merchant ID," which is sufficient because Stripe acts as the merchant of record for Apple Pay validation. The file is published at [https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association](https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association). Reference copies exist in [stripe/elements-examples GitHub](https://github.com/stripe/elements-examples/blob/master/.well-known/apple-developer-merchantid-domain-association) and the WooCommerce Stripe plugin repo.

**Two paths to register the domain:**

1. **Stripe Dashboard (manual, one-time per domain):** Settings → Payment Method Domains → Add new domain → Stripe pings `https://my-quilty.com/.well-known/apple-developer-merchantid-domain-association`, verifies bytes match, and registers the domain with Apple on our behalf. Stripe handles Apple merchant validation behind the scenes — we never see an Apple Merchant ID or CSR. ([Stripe docs: register domains for payment methods](https://docs.stripe.com/payments/payment-methods/pmd-registration))

2. **Stripe Payment Method Domains API (programmatic):** `POST /v1/payment_method_domains` with `{ "domain_name": "my-quilty.com" }`. Same outcome, scriptable. Returns a domain status object showing `apple_pay.status: "active"` once verification clears.

**Domains needed at M7:**

- `my-quilty.com` (apex)
- `www.my-quilty.com` (if we keep www subdomain — currently not in DNS plan)
- `app.my-quilty.com` (only if we ever surface Apple Pay in account portal; not in scope at M7)
- **Sandbox/preview:** Stripe automatically also registers in sandboxes when registered in live mode, but SST preview URLs (`*.preview.my-quilty.com` if we use them) need separate registration per environment.

**Timing:** This is a **10-minute operation at M7** once Stripe account is set up. There is **zero benefit** to filing it earlier:

- Apple Pay button does NOT render in Stripe Elements / Express Checkout Element unless the domain is registered AND Stripe Elements detects an Apple-Pay-capable device (Safari on iOS/macOS with a card in Wallet).
- The file alone (without Stripe registration) does nothing — Apple's verifier is only invoked when Stripe registers the domain.
- The file IS static bytes we can serve from the Next.js `public/.well-known/` directory or from a Route Handler returning the bytes — either works.

**Express Checkout Element vs Payment Request Button vs PaymentRequest API:**
Stripe's 2025 recommendation is **Express Checkout Element** (multi-wallet: Apple Pay + Google Pay + Link in one component), with **Payment Element** for cards. ([Stripe docs: Apple Pay on web](https://docs.stripe.com/apple-pay?platform=web), [Stripe docs: Payment Element](https://docs.stripe.com/payments/payment-element)). The older Payment Request Button is legacy and imposes Apple's "Apple Pay must be the primary payment option" guideline that's more restrictive. Direct browser PaymentRequest API is not recommended for Stripe (loses Stripe's merchant-validation handling).

**Recurring/subscription consideration (relevant to Quilty):** Stripe recommends Apple Pay merchant tokens (MPANs) for merchant-initiated transactions like recurring subscriptions and automatic reloads. MPANs survive card-on-file changes (lost device, new card) and are critical for subscription retention. Worth enabling at M7 from day one.

---

## 5. iOS-specific web pattern gaps — surfaced from completeness scan

### 5.1 Apple Pay HSA/FSA card support — **relevant to Quilty**

Apple Pay supports HSA/FSA debit cards from major administrators (Optum Bank, HealthEquity, etc.). Cards add to Wallet like normal debit cards. ([Optum Bank: Apple Pay](https://www.optumbank.com/why/news-updates/apple-pay.html), [HealthEquity Digital Wallet FAQ](https://www2.healthequity.com/doclib/cis/faq/digital_wallet.pdf))

**Catch:** Whether the transaction actually settles depends on the merchant category code (MCC) of the Stripe-billed item. Mental-health subscriptions billed as "MCC 8099 (Health Services - Not Elsewhere Classified)" or "MCC 8011 (Doctors)" generally clear HSA/FSA cards. "MCC 5968 (Subscription Services)" generally does NOT. **Decision needed at M7:** Confirm with Stripe what MCC our subscription products carry, and whether we want to push for a health-services MCC (which can raise underwriting friction but unlocks HSA/FSA payment).

If we want HSA/FSA explicitly: requires a letter-of-medical-necessity (LMN) flow for some plans. Not in M7 scope at MVP, but worth tagging as a marketing-page claim we cannot make ("Pay with your HSA card") until validated.

### 5.2 Sign in with Apple — App Store Review Guideline 4.8

If the **Quilty Flutter app** offers any third-party social login (Google, Facebook, etc.), Guideline 4.8 requires Sign in with Apple as an equivalent option. Apple also requires **web parity** — if the website offers Google sign-in but not Apple sign-in, the iOS app can be rejected at review.

**Current state:** Cognito Managed Login at `auth.my-quilty.com` is the auth surface. Decision needed during M6: do we light up Sign in with Apple as a Cognito identity provider? Cognito supports it as a built-in IdP. Cost: free; complexity: low (it's an OIDC config in Cognito).

**New 2026 wrinkle (Korea-only):** Starting Jan 1, 2026, developers based in Korea must provide a server-to-server notification endpoint when registering a new Services ID for Sign in with Apple ([Apple Developer News, Oct 9, 2025](https://developer.apple.com/news/?id=j9zukcr6)). Quilty is US-based, but worth noting in case of future expansion.

### 5.3 Sec-GPC honoring on Safari — **important deadline**

**Safari does NOT natively send Sec-GPC in 2026.** Users on Safari need a browser extension to send the signal. Brave, DuckDuckGo, and Firefox 120+ send it natively; Chrome/Edge/Safari don't.

**HOWEVER:** California **AB 566 (signed Oct 2025)** mandates that all major browsers (including Safari) must provide native GPC settings by **January 1, 2027**. ([Smartsmssolutions blog](https://smartsmssolutions.com/resources/blog/business/global-privacy-control-gpc-compliance), [Kukie.io](https://kukie.io/blog/what-is-global-privacy-control))

**Implication for D35 (Server-side ConsentState):** Our spec already says "GPC `Sec-GPC: 1` honored at edge." Today that catches Brave / DuckDuckGo / Firefox users + Safari users with extensions. From Jan 1, 2027 onward, it will catch ~30%+ of total US traffic (the Safari share). We should:

1. Confirm the edge GPC check in our proxy.ts spec works regardless of UA (it does — header check is UA-agnostic).
2. Add a Round-6 note that GPC volume will spike in Jan 2027 as Safari turns it on by default.
3. Verify our analytics and consent telemetry will correctly attribute the spike (don't mistake it for a regression in consent acceptance).

### 5.4 Open Graph for iMessage previews

**iMessage uses `og:image` for rich link previews.** ([Apple TN3156](https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages)) Requirements:

- `og:image` ≥ 1200px wide (Apple says 900 minimum, but 1200 needed for some devices)
- PNG or JPG (no GIF)
- Full absolute URL (no protocol-relative)
- Falls back to `apple-touch-icon.png` if `og:image` missing, then favicon

**Recommendation:** Bake into our `apps/web/lib/seo/` metadata helpers from M2:

- `og:image` 1200x630 minimum (we have this for Twitter Card; same asset works)
- `apple-touch-icon` 180x180 (we should ship this — only 9/16 peers do, but it's table stakes)
- Same image bytes referenced by `apple-touch-icon` are also used by iOS Add-to-Home-Screen → so this matters for the iOS 26 default-PWA behavior too.

### 5.5 Spotlight indexing for web content

Apple's Spotlight indexes publicly-crawled web content via Applebot, but **only for sites whose corresponding native app uses `NSUserActivity` with `isEligibleForPublicIndexing = true`**. ([Apple: Core Spotlight](https://developer.apple.com/documentation/corespotlight))

**Implication:** The Flutter mobile app could (but currently does not) index Quilty content into Spotlight via NSUserActivity. The marketing-website side just needs Applebot to be unblocked in `robots.txt`. **Cross-check needed for D66 (AI crawler policy in robots.ts):** Confirm Applebot is allowlisted (it's not an AI training crawler — it's the Spotlight/Siri search crawler). [WebKit docs distinguish Applebot from Applebot-Extended](https://developer.apple.com/documentation/applesearch), where Applebot-Extended is the AI training opt-out. We want to ALLOW Applebot, DISALLOW Applebot-Extended.

### 5.6 Handoff (NSUserActivity continuation)

AASA can include an `"activitycontinuation"` block to allow webpage → native-app Handoff. ([Apple security guide: Handoff](https://support.apple.com/guide/security/handoff-security-secf78dbe639/web)) This means a user reading `my-quilty.com/features` on macOS Safari can tap a Handoff icon on their iPhone to open the Quilty app to a matched activity.

**Current state:** Our AASA scope is narrowly applinks-only per A3.3 / D118. Adding `activitycontinuation` is a 2-line change but requires the Flutter app to register NSUserActivity for matched URLs. **Defer to M9+** — low ROI until brand identity and mobile UX patterns settle. Note it in the AASA evolution backlog.

### 5.7 iPad-specific behaviors

Split View, Stage Manager (iPadOS 16+), and external display support don't require explicit web-side changes if our Tailwind breakpoints handle the layout — which they will via the standard `sm/md/lg/xl/2xl` system. **One gotcha:** iPad Safari sends `Mac` in some UA strings (since iPadOS 13's "desktop-class browsing"); our analytics + UA-sniffing should treat iPad as mobile-equivalent for consent / form sizing. The `Sec-CH-UA-Mobile` client hint is the right signal (iPad reports `?0` even when in mobile mode, which is intentional).

### 5.8 ARKit / WebXR — not applicable

Confirmed irrelevant for Quilty's mental-health surface. No AR/VR roadmap. Skip.

### 5.9 Safari Web Extensions — not applicable

Quilty doesn't ship a browser extension. Skip.

### 5.10 Apple News compatibility — explicitly defer

Apple News Partner Program requires:

- App Store presence (we have it)
- Original news content as primary app function (we don't qualify — Quilty is a mental-health platform, not a news publisher)
- Apple News Format channel maintained in AU/CA/US/UK ([Apple News Partner Program](https://developer.apple.com/apple-news/program/))

Quilty doesn't fit the program criteria. Marketing-blog content (M9+) won't qualify. **Skip indefinitely.**

### 5.11 Apple Pay UK vs EU PCI DSS implications

Stripe handles PCI DSS for us — we never touch card data directly. Apple Pay tokens are merchant-scoped and out-of-PCI-scope for the merchant. UK + EU don't change the PCI calculus when Stripe is the processor. **No action needed.**

### 5.12 Apple-specific data residency for EU users

Apple Pay transaction data flows: device → Apple's tokenization → Stripe → bank network. Apple's tokenization happens regionally (EU data is processed in Apple's EU data centers). This is invisible to our stack — Stripe handles the merchant side. **No action needed** beyond confirming Stripe's EU data residency (separate concern under D38 / GDPR).

### 5.13 iOS 18+ default browser changes

iOS 17.4+ in the EU technically allows third-party browser engines via BrowserEngineKit, but as of early 2026, **zero browsers have shipped on BrowserEngineKit** because Apple's contract terms make it economically unviable. ([mobiloud blog](https://www.mobiloud.com/blog/progressive-web-apps-ios)) iOS Safari is still effectively the only engine on iOS globally. **No action needed.**

### 5.14 Universal Clipboard — informational only

Universal Clipboard rides Handoff. If a user copies text on macOS Safari from `my-quilty.com` and paste-targets their iPhone Quilty app within 2 minutes, the paste works. This is automatic and requires no web-side configuration. **No action needed.**

### 5.15 iOS notification banner copy (for marketing push notifications)

If we ever wire up Safari Web Push (now supported via Declarative Web Push since Safari 18.4 — no service worker required), iOS treats web pushes differently from native push — they appear via Notification Center, not as native iOS banners. **Out of scope until growth marketing demands it (M9+).**

### 5.16 iOS-specific consent banner sizing

iOS Safari's bottom toolbar overlaps fixed-position elements until the user scrolls. Consent banners pinned `bottom: 0` need to honor `env(safe-area-inset-bottom)`. **Bake into our consent component spec at M5.**

---

## 6. C13 recommendation — Smart App Banner

**RECOMMEND: Defer Smart App Banner to M9+. Ship App Links meta (`al:ios:*`, `al:android:*`) at M2 instead.**

### Rationale

1. **Peer signal: 1 of 16 ships it.** Headspace (category leader) explicitly chose App Links over Smart App Banner. The cost-benefit ratio is not credible.
2. **Universal Links already covers "user has app installed" UX automatically** via the smaller persistent banner Safari draws from AASA — and we already ship AASA. Smart App Banner only adds value for "user does NOT have app installed."
3. **Copy quality matters and is one-shot.** Sticky dismissal makes the first banner copy permanent for that user. Copy decisions should happen post-M3 (brand identity), not at M2.
4. **CLS / hero-impression cost.** Banner steals ~70px above the fold on iPhone. Marketing hero photography + copy work harder without it.
5. **In-app browsers don't render it.** ~60%+ of consumer-app mobile-web acquisition is via Facebook/Instagram/TikTok in-app browsers, where Smart App Banner is invisible. App Links protocol (Facebook standard) covers those surfaces.
6. **Defer trigger:** Light it up at M9+ when (a) brand voice is locked, (b) Adjust/AppsFlyer attribution is wired, (c) we have a paid Apple Search Ads campaign running and want to A/B-test organic Smart App Banner against ASA.

### What to ship at M2 instead

In our `apps/web/lib/seo/` metadata helper, add Facebook App Links meta tags as a sibling concern to Open Graph:

```
<meta property="al:ios:app_store_id" content="<App Store ID>" />
<meta property="al:ios:app_name" content="Quilty" />
<meta property="al:ios:url" content="quilty://" />
<meta property="al:android:package" content="app.quilty.myquilty" />
<meta property="al:android:app_name" content="Quilty" />
<meta property="al:web:should_fallback" content="true" />
```

(The actual App Store ID will be filled in once iOS app submission lands; placeholder for now.)

### Reservation for the day we ship Smart App Banner

When we DO ship it (M9+), the meta tag will be:

```
<meta name="apple-itunes-app" content="app-id=<numeric ID>, app-argument=https://my-quilty.com<current path>" />
```

The `app-argument` should be the current canonical URL so Universal Links can deep-link the user to the matching in-app screen.

---

## 7. C14 recommendation — Apple Pay merchant verification

**RECOMMEND: M7 with Stripe. Not earlier.**

### Rationale

1. **The file proves nothing without Stripe registration.** Apple only verifies the file when Stripe calls `POST /v1/payment_method_domains`. Until then it's dead bytes.
2. **The file is Stripe's, not ours.** Same bytes for every Stripe merchant. No cryptographic uniqueness, no domain-binding handshake we can pre-stage.
3. **10-minute operation at M7.** Download file from `stripe.com/files/apple-pay/...`, drop in `apps/web/public/.well-known/`, call Stripe API. Done.
4. **No marketing value pre-M7.** Apple Pay button doesn't render unless (a) domain is registered with Stripe, AND (b) Stripe Elements / Express Checkout Element is in the page, AND (c) browser is Safari on Apple device with a card in Wallet. All three conditions only materialize at M7.

### M7 implementation checklist (when we get there)

1. Stripe account set up + Apple Pay enabled in dashboard (no merchant ID needed — Stripe handles it).
2. Drop `apple-developer-merchantid-domain-association` file in `apps/web/public/.well-known/` (or serve via Route Handler returning the static bytes with `Content-Type: text/plain`).
3. Register domain via Stripe Dashboard OR Payment Method Domains API.
4. Verify `apple_pay.status: "active"` in Stripe domain object.
5. Wire Express Checkout Element in subscription/checkout flow.
6. Enable Apple Pay merchant tokens (MPANs) for recurring subscription billing.
7. Confirm MCC + HSA/FSA settlement behavior with Stripe (if HSA/FSA marketing claim is desired).

### Open question for M7

**Do we want HSA/FSA card acceptance?** If yes, we need:

- Stripe MCC negotiated to health-services (8099 or 8011)
- LMN flow for plans that require it (not all do)
- Marketing-page disclaimer language
- Customer-success playbook for "my HSA card was declined"

Recommend: **Decide at M7 kickoff.** Adds revenue from a high-intent segment (people already budgeting for mental-health spend) but adds underwriting + support complexity. Defer-able to M9+ post-launch.

---

## 8. Items not in our decision log yet — explicit list

These surfaced from the iOS-domain completeness scan and are NOT currently captured in D1-D69 / U1-U8:

| #   | Item                                                                    | Recommended disposition                                                                           |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | **App Links meta tags (`al:ios:*`, `al:android:*`) at M2**              | NEW DECISION needed — propose D70-candidate. Adopt Headspace pattern.                             |
| 2   | **Smart App Banner deferred to M9+**                                    | NEW DECISION needed — propose D71-candidate.                                                      |
| 3   | **Apple Pay HSA/FSA acceptance — go/no-go at M7**                       | OPEN — defer decision to M7 kickoff.                                                              |
| 4   | **Sign in with Apple via Cognito IdP at M6**                            | If we offer Google sign-in, this is required for App Store. Propose D72-candidate.                |
| 5   | **Applebot vs Applebot-Extended distinction in robots.ts (D66)**        | D66 amendment — ALLOW Applebot (Spotlight crawler), DISALLOW Applebot-Extended (AI training).     |
| 6   | **`og:image` 1200x630 minimum + `apple-touch-icon` 180x180 ship at M2** | Baseline metadata helper requirement. Propose D73-candidate or amend D24 if it exists.            |
| 7   | **Sec-GPC volume spike Jan 1, 2027**                                    | Operational note for D35 ConsentState — add forward-looking note to consent telemetry dashboards. |
| 8   | **AASA `activitycontinuation` for Handoff — defer M9+**                 | Backlog item for AASA evolution; not a decision needed now.                                       |
| 9   | **iPad UA-sniffing → use `Sec-CH-UA-Mobile`**                           | Implementation guidance for D40 (replay mask-all).                                                |
| 10  | **Consent banner `env(safe-area-inset-bottom)` on iOS**                 | Implementation guidance for M5 consent component.                                                 |
| 11  | **Apple Pay merchant tokens (MPANs) for subscription resilience**       | M7 implementation requirement — Stripe-side flag.                                                 |
| 12  | **Express Checkout Element vs Payment Request Button**                  | M7 — pick Express Checkout Element per Stripe 2025 guidance.                                      |
| 13  | **Safari Web Push (Declarative, iOS 16.4+)**                            | M9+ growth-marketing trigger. Not now.                                                            |
| 14  | **Apple News Partner Program**                                          | OUT OF SCOPE — Quilty doesn't qualify (not a news publisher). Document as explicitly skipped.     |

---

## Sources

- [Apple Developer: Promoting Apps with Smart App Banners](https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners)
- [Apple Developer Forums: Smart App Banner and AASA](https://developer.apple.com/forums/thread/105129)
- [Branch: Set up iOS Smart App Banner](https://www.branch.io/resources/blog/how-to-setup-an-ios-and-android-smart-app-banner-with-deep-linking-and-download-tracking/)
- [Adjust: Smart Banners glossary](https://www.adjust.com/glossary/smart-banners/)
- [zhead: apple-itunes-app meta tag reference](https://zhead.dev/meta/apple-itunes-app/)
- [Stripe: Apple Pay on web](https://docs.stripe.com/apple-pay?platform=web)
- [Stripe: Register payment method domains](https://docs.stripe.com/payments/payment-methods/pmd-registration)
- [Stripe: Payment Element](https://docs.stripe.com/payments/payment-element)
- [Stripe: Payment Request Button (legacy)](https://docs.stripe.com/stripe-js/elements/payment-request-button)
- [Stripe Elements examples repo (AASA reference file)](https://github.com/stripe/elements-examples/blob/master/.well-known/apple-developer-merchantid-domain-association)
- [Apple Developer: Preparing merchant domains for verification](https://developer.apple.com/documentation/applepaywebmerchantregistrationapi/preparing-merchant-domains-for-verification)
- [Apple Developer: Choosing an API for Apple Pay on Web](https://developer.apple.com/documentation/applepayontheweb/choosing-an-api-for-implementing-apple-pay-on-your-website)
- [Optum Bank: Apple Pay with HSA cards](https://www.optumbank.com/why/news-updates/apple-pay.html)
- [HealthEquity: Digital Wallet FAQ](https://www2.healthequity.com/doclib/cis/faq/digital_wallet.pdf)
- [Apple Developer News: Sign in with Apple Korea endpoint (Oct 2025)](https://developer.apple.com/news/?id=j9zukcr6)
- [WorkOS: Sign in with Apple authentication 2025](https://workos.com/blog/apple-app-store-authentication-sign-in-with-apple-2025)
- [Apple TN3156: Create rich previews for Messages](https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages)
- [Apple Developer: Core Spotlight](https://developer.apple.com/documentation/corespotlight)
- [Apple security guide: Handoff security](https://support.apple.com/guide/security/handoff-security-secf78dbe639/web)
- [Singular: Apple Search Ads attribution (AdServices / SKAN / AdAttributionKit)](https://www.singular.net/blog/apple-search-ads-skadnetwork/)
- [PPC Land: Apple Search Ads + AdAttributionKit unified attribution](https://ppc.land/apple-search-ads-to-adopt-adattributionkit-for-unified-app-attribution/)
- [Adjust: Apple Search Ads now in SKAdNetwork](https://www.adjust.com/blog/asa-skadnetwork/)
- [Apple Ads: Attribution overview](https://ads.apple.com/app-store/help/attribution/0094-ad-attribution-overview)
- [Brainhub: PWA on iOS status 2025](https://brainhub.eu/library/pwa-on-ios)
- [Mobiloud: PWAs on iOS 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios)
- [Magicbell: PWA iOS Limitations 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Taggrs: Safari 26 tracking changes](https://taggrs.io/safari-26-tracking-changes/)
- [Billy Grace / Medium: Safari iOS 26 tracking changes](https://medium.com/billy-grace/safari-on-macos-ios-26-tracking-changes-whats-really-changing-31e2d26cb727)
- [Avenga: Apple privacy timeline](https://www.avenga.com/magazine/timeline-apple-privacy-changes/)
- [Customer Labs: Safari ITP explained](https://www.customerlabs.com/blog/understanding-safari-intelligent-tracking-prevention-apple-itp-impact/)
- [Smart SMS Solutions: GPC compliance 2025](https://smartsmssolutions.com/resources/blog/business/global-privacy-control-gpc-compliance)
- [MDN: Sec-GPC header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-GPC)
- [Kukie.io: Global Privacy Control browser opt-out signals](https://kukie.io/blog/what-is-global-privacy-control)
- [Apple Developer: News Partner Program](https://developer.apple.com/apple-news/program/)
- [Digital Bunker: AASA file explained](https://digitalbunker.dev/apple-app-site-association/)
- [Expo: Apple Handoff docs](https://docs.expo.dev/router/advanced/apple-handoff/)
