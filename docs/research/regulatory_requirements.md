# Research: Regulatory + App-Store + Payment-Provider Website Requirements

> Source: general-purpose research agent, 2026-05-14.
> Purpose: define the **floor** the website must clear. We design for target quality (Calm/Oura at MVP); the floor is automatically satisfied as a byproduct.

---

## 1. Apple App Store Review Guidelines (current 2025-2026)

- **5.1.1(i) Privacy Policy** — Privacy policy URL is required in **both** App Store Connect metadata **and** in-app. Must disclose data collected, third-party sharing, retention, deletion + consent revocation mechanism. *Hard blocker.*
- **5.1.1(v) Account Deletion** — Must be initiated **within the app**. A pure web URL is **not** an acceptable substitute — even if account creation happens via web browser, the app must still offer in-app deletion. **However**, if completion of the deletion requires a web step, the app **must link directly to the deletion page on your website** (not a generic support page). A web view inside the app is acceptable; opening Safari is not. *Hard blocker. Implies: a deep-linkable `/account/delete` URL must exist on the website.*
- **5.1.1(ix) Highly Regulated** — Industries listed: banking/financial, healthcare, gambling, legal cannabis, air travel, crypto. Mental-health/wellness consumer apps **arguably qualify under "healthcare"** if the app is sold by a covered entity. Apps in this carve-out **may add customer-service confirmation steps** for deletion, and **must be submitted by a legal entity, not an individual**.
- **1.5 Developer Information** — Support URL required in metadata, must include an easy way to contact you. *Hard blocker.*
- **Marketing URL** — App Store Connect field exists but is **optional**. *Soft expectation only.*
- **Data export** — Not in App Review Guidelines; pulled in by GDPR Art. 20 (see below). *Soft from Apple, hard from GDPR.*

## 2. Google Play Developer Policy (current)

- **Account & Data Deletion** — Developer must provide **two paths**: in-app **and** an out-of-app web URL ("for example, by visiting your website"). The web URL is **declared in Play Console's Data safety form**, must let users request deletion **without re-installing the app**, and must delete both account AND associated user data. Temporary deactivation does NOT satisfy. *Hard blocker.*
- **Privacy Policy URL** required in Play Console + in-app for any app collecting personal/sensitive data (which includes health). *Hard blocker.*
- **Support contact** (email at minimum) required for any "Health" category app. *Hard blocker.*

## 3. GDPR Articles 13/14/17/20

Most practical implementation is a privacy notice on the website covering:
- **Art. 13/14** — Identity of controller + DPO, purposes, **lawful basis** (one of Art. 6's six: consent / contract / legal obligation / vital interests / public task / legitimate interest), recipients, retention periods, data subject rights, right to lodge complaint with supervisory authority, source of data (Art. 14 only). *Hard expectation under any EU traffic.*
- **Art. 17 (erasure)** — Mechanism must be exposed; typically the deletion URL doubles for this.
- **Art. 20 (portability)** — Export mechanism for data provided by consent or contract, in a machine-readable format. Usually a `/account/export` flow or DSAR form.
- **Special category data (Art. 9)** — Mental-health data is special category; explicit consent or another Art. 9(2) basis must be **disclosed in the notice**.

## 4. CCPA / CPRA (California)

- **"Do Not Sell or Share My Personal Information" link** — Clear, conspicuous, on **homepage + privacy policy + every page that collects PI**; alternative single-link label **"Your Privacy Choices"** with the official toggle icon. Two submission methods required, one of which must be an **interactive web form**.
- **"Limit the Use of My Sensitive Personal Information"** link — separate or combined into Your Privacy Choices. **Mental-health data is sensitive PI** under CPRA — this link is effectively required.
- **Privacy Policy** must enumerate categories collected/disclosed and consumer rights. Must respect **Global Privacy Control** opt-out signals (not a substitute for the link — both required).
- *Hard blocker if any California traffic; in practice everyone implements it.*

## 5. Stripe full activation (vs sandbox)

Sandbox/test mode: works with email only. **Live mode / payouts** requires KYC + the **website checklist** (`docs.stripe.com/get-started/checklist/website`):

1. Clear product/service description
2. Purchase currency explicit
3. **Customer service contact info** (multi-channel — email + phone or chat; not just a form)
4. **Fulfillment policies bundle**: refund policy + delivery/fulfillment policy + return policy + **cancellation policy** (the subscription one is what catches mental-health apps)
5. Legal/export restrictions disclosed
6. **Privacy policy** linked
7. Business address
8. Promo/trial terms (free-trial-to-paid auto-conversion language)
9. PCI compliance + HTTPS
10. Accepted-card logos

Plus **Terms of Service** acceptance (collected at checkout if not on site). *Hard blocker for payouts; soft for test mode.* Stripe also requires connected accounts to accept **Stripe's Services Agreement** before activation.

## 6. HIPAA (45 CFR §164.520)

If Quilty operates as a covered entity (or its provider customers do, and the marketing site is the entity's public face):

- **Notice of Privacy Practices (NPP)** must be **prominently posted on any website that provides information about customer services or benefits** AND **made available electronically through the website**. Content requirements in §164.520(b) — uses/disclosures of PHI, individual rights, complaint procedure, contact for further info, effective date. *Hard blocker for covered-entity operation.*
- **Breach notification language** — not a website mandate per se, but §164.404 requires individual notice within 60 days; large breaches (>500 individuals in a state) require posting on the entity's website for **90 days** + media notice. A pre-built `/notices/` or `/breach-notice/` template URL is a soft expectation (mandated only post-incident).
- *Note:* If Quilty is **not** itself a covered entity (B2C wellness, no provider relationship), HIPAA NPP technically doesn't apply — but FTC Health Breach Notification Rule (16 CFR Part 318, expanded 2024) imposes a parallel breach-notice obligation on connected-health apps. The conservative posture for a "HIPAA-aligned" app is to publish an NPP-style notice anyway.

---

## Must-have URLs/pages with forcing function

| # | URL / page | Forcing regulation | Blocker class |
|---|---|---|---|
| 1 | `/privacy` (Privacy Policy) | Apple 5.1.1(i), Google Play, GDPR Art. 13/14, CCPA, Stripe checklist #6 | **HARD** — every channel |
| 2 | `/terms` (Terms of Service) | Stripe checklist (ToS acceptance), Apple/Google (paid auto-renew T&Cs) | **HARD** for Stripe live mode |
| 3 | `/account/delete` (deep-linkable deletion landing) | Apple 5.1.1(v) (when web step needed), Google Play account-deletion URL | **HARD** for Google Play; HARD-conditional for Apple |
| 4 | `/account/export` (DSAR/portability) | GDPR Art. 20 | **HARD** for EU traffic |
| 5 | `/support` or `/contact` (Support URL, multi-channel) | Apple Guideline 1.5, Stripe checklist #3, Google Play health-category support contact | **HARD** for App Store + Stripe |
| 6 | `/refund` (refund + cancellation policy, esp. subscriptions) | Stripe checklist #4, Apple subscription rules, consumer-protection law | **HARD** for Stripe live mode |
| 7 | "Do Not Sell or Share My Personal Information" / **"Your Privacy Choices"** link in global footer + privacy policy + every PI-collection page | CCPA/CPRA §1798.135 + Cal. Reg. §7011 | **HARD** for California traffic |
| 8 | "Limit Use of My Sensitive Personal Information" (mental-health data = sensitive PI) | CPRA | **HARD** for California traffic |
| 9 | Notice of Privacy Practices `/hipaa-notice` (linked prominently) | 45 CFR §164.520(c)(3) | **HARD** if Quilty is/operates as covered entity; **SOFT** if pure B2C wellness (but FTC HBNR parallel) |
| 10 | Business name + physical address visible (typically footer) | Stripe checklist #7, GDPR Art. 13(1)(a) identity disclosure | **HARD** for Stripe |
| 11 | Accepted-card logos + HTTPS-only + PCI badge on checkout | Stripe checklist #9, #10 | **HARD** for Stripe |
| 12 | Free-trial / auto-renew terms page (or in-line at checkout) | Stripe checklist #8, Apple §3.1.2(a), FTC ROSCA, California auto-renewal law | **HARD** for paid plans |
| 13 | Marketing URL in App Store Connect | Apple metadata (optional field) | **SOFT** — flagged if missing but not rejected |
| 14 | Breach-notice publication endpoint (e.g., `/security/notices/`) | 45 CFR §164.404(b) (>500-person breach → 90 days on site) | **SOFT** pre-incident, **HARD** post-incident |
| 15 | Cookie/consent banner with granular GDPR + CCPA toggles | GDPR Art. 7, ePrivacy, CCPA opt-out + GPC honoring | **HARD** for EU/CA traffic |
| 16 | Accessibility statement (WCAG 2.2 AA conformance) | EAA (EU, June 2025 effective), ADA Title III case law | **SOFT-trending-HARD** for EU after June 2025 |

**Minimum viable launch set** (hardest-first triage): 1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 15.

---

## Sources

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple — Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Apple — Account deletion deadline news](https://developer.apple.com/news/?id=mdkbobfo)
- [Google Play — Account/Data deletion policy](https://support.google.com/googleplay/android-developer/answer/13327826)
- [Stripe — Website checklist](https://docs.stripe.com/get-started/checklist/website)
- [Stripe — Activate your account](https://docs.stripe.com/get-started/account/activate)
- [Stripe — Business website FAQ](https://support.stripe.com/questions/business-website-for-account-activation-faq)
- [GDPR Art. 13](https://gdpr-info.eu/art-13-gdpr/)
- [ICO — Right to be informed](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-be-informed/)
- [HHS — Notice of Privacy Practices (45 CFR §164.520)](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/privacy-practices-for-protected-health-information/index.html)
- [eCFR — 45 CFR §164.520](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.520)
- [Holland & Hart — NPP updates by Feb 16, 2026](https://www.hollandhart.com/update-your-hipaa-notice-of-privacy-practices-by-february-16-2026)
- [OneTrust — CPRA Do Not Sell or Share](https://www.onetrust.com/blog/navigating-the-cpras-do-not-sell-or-share-requirement/)
- [Securiti — CPRA Do Not Sell definition](https://securiti.ai/blog/cpra-do-not-sell-definition/)
