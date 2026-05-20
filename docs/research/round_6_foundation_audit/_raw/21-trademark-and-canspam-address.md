# 21 — USPTO Trademark + CAN-SPAM Physical Address (C9 + C11)

> Round-6 foundation-audit research note. Scope: resolve open questions C9 (USPTO trademark filing scope + timing) and C11 (CAN-SPAM physical address), and surface adjacent foundation gaps (entity, mailbox monitoring, brand-defense). Read-only.

---

## 1. Executive summary

**C9 — USPTO trademark filing scope + timing (RECOMMEND CONFIRM):**
File the **"QUILTY" wordmark only at M3** in **Classes 9, 42, and 44** as a **1(b) intent-to-use** application (covers downloadable mobile app, web/SaaS, and mental-health services respectively). Three classes × $350 base fee = **$1,050 USPTO fees + ~$1,200-$2,500 attorney fees** (recommended, not pro se, given multi-class + health-services overlap). Wordmark at M3 satisfies BIMI/VMC eligibility per D120 (Gmail accepts wordmark VMCs from USPTO). **Defer logo (design-mark) filing to M5** after brand-identity work locks the actual mark — filing a logo before it's stable wastes $350+ per class on a mark you'll abandon. Expected timeline: 12-18 months to registration, ~6 months to a serial number we can show Entrust/DigiCert for the VMC. Use **™** until the registration certificate arrives, then switch to **®**.

**C11 — CAN-SPAM physical address (RECOMMEND CONFIRM):**
**CMRA (Commercial Mail Receiving Agency) private mailbox**, _not_ a registered-agent address. ~$15-30/month ($180-360/year). FTC §316.2(p) explicitly lists three qualifying address types: street address, USPS-registered PO Box, or CMRA-registered private mailbox. Registered-agent addresses are legally permissible but **practically forbidden** — Northwest/Harbor/CT contracts restrict their address to service of process and state filings. A CMRA gives a real street-format address (e.g., "1234 Main St, Suite 100"), which reads better on email footers, App Store listings, Stripe receipts, and the privacy policy than a "PO Box 1234" line. Use the same mailbox for HIPAA Notice-of-Privacy-Practices Privacy Officer contact, Stripe merchant address, and Apple/Google developer-account address.

**Adjacent unresolved items (Section 7):** Delaware C-Corp formation timing, whois privacy posture (already Porkbun-protected), mailbox monitoring SLA, trademark-watch service, typo-domain defense budget, and international (EU/UK/CA) trademark sequencing.

---

## 2. USPTO mechanics + cost + timeline

### 2.1 Fee structure (current, as of Jan 18 2025)

The USPTO eliminated the TEAS Plus / TEAS Standard tiers in January 2025. All applications now use a **single base fee of $350 per class** filed through the unified Trademark Center.

Per-class surcharges that can stack:

| Surcharge                                 | Cost                        | Trigger                                                                 |
| ----------------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| Insufficient information                  | +$100/class                 | Missing required fields at filing                                       |
| Non-standard identification               | +$200/class                 | Custom (free-text) goods/services description instead of ID Manual pick |
| Length-based ID                           | +$200 per extra 1,000 chars | ID Manual entries exceed 1,000 chars                                    |
| Statement of Use (for 1(b) intent-to-use) | $150/class                  | Filing the SoU after use in commerce                                    |
| Extension request (1(b))                  | $125/class                  | Each 6-month extension; max 5 extensions = 36 months total              |

**Practical implication:** Always use **USPTO ID Manual** picks. The $200/class custom-description surcharge is almost always avoidable for software/SaaS/health-services trademarks — the ID Manual has well-trodden picks for each.

### 2.2 Classes for Quilty (mental-health consumer app + SaaS + clinician marketplace)

**Class 9 — Downloadable software/apps.**
ID Manual pick: _"Downloadable mobile applications for mental health tracking, mood journaling, meditation, and access to mental wellness content."_
Covers the iOS/Android binary.

**Class 42 — SaaS / cloud / scientific services.**
ID Manual pick: _"Software as a service (SaaS) featuring software for mental wellness tracking, mood journaling, and access to mental health resources; Providing online non-downloadable software for mental health tracking."_
Covers the web product (if app.my-quilty.com ever ships) and the cloud-hosted backend insofar as users interact with it.

**Class 44 — Medical / mental-health services.**
ID Manual pick: _"Mental health counseling services; Providing information in the field of mental health via a website; Provider matching services in the field of mental health."_
Covers the clinician-marketplace dimension if Quilty ever facilitates real clinician interactions. Required if a public claim like "connect to a licensed therapist" is made.

**Why all three:** USPTO examining attorneys **do not allow class corrections** post-filing. If you file Class 9 + 42 only and later need Class 44 for "mental health services," you must start over for that class (losing priority date for the Class 44 scope). The Class 44 filing also makes the registration the strongest cease-and-desist instrument against copycats in the mental-health-services adjacent space.

Note that for a _pre-launch_ product, the safer pattern is **1(b) intent-to-use** for all three classes. You only file the Statement of Use ($150/class) per class once that class's product/service ships. Worst case: drop Class 44 later if Quilty stays purely software and never facilitates clinician care.

### 2.3 Pro-se vs attorney

| Filing path                                                    | USPTO fees (3 classes, intent-to-use) | Attorney fees | Total at filing |
| -------------------------------------------------------------- | ------------------------------------- | ------------- | --------------- |
| Pro-se (DIY)                                                   | $1,050                                | $0            | $1,050          |
| Flat-fee attorney (e.g., Gerben, JPG Legal, LegalZoom premium) | $1,050                                | $1,200-$2,500 | $2,250-$3,550   |
| Boutique IP firm                                               | $1,050                                | $2,500-$5,000 | $3,550-$6,050   |

Plus Statement of Use ($150/class × 3 = $450) per class once products ship.

**Recommend attorney.** Three reasons:

1. **Class 44 is hairy.** Mental-health-services IDs intersect with FDA/SaMD device-classification language; a wrong word ("treatment," "diagnosis," "therapy") can trigger refusals and the wrong implication for FDA scope.
2. **Office actions.** USPTO currently issues an initial office action in roughly 8-12 months on ~50% of applications. Response is technical legal work; pro-se respondents abandon at significantly higher rates.
3. **Clearance search.** A pre-filing clearance search by an IP attorney costs ~$300-600 and catches likelihood-of-confusion problems (similar marks for similar goods) before $1,050 of filing fees go non-refundable. "Quilty" is short and may collide with existing marks.

### 2.4 Timeline

| Milestone                                      | Time from filing                          |
| ---------------------------------------------- | ----------------------------------------- |
| Serial number issued                           | ~1-3 days                                 |
| First office action (if any)                   | 8-12 months                               |
| Publication for opposition                     | 12-14 months (if no refusal)              |
| Opposition window                              | 30 days post-publication                  |
| Notice of Allowance (for 1(b))                 | 14-16 months                              |
| Statement of Use + Certificate of Registration | 18-30 months (depending on launch timing) |

**For BIMI/VMC purposes (D120):** Most VMC issuers (Entrust, DigiCert) accept a **pending USPTO application with a serial number** for CMC purposes but **only a fully registered ®** for full VMC (the verified blue checkmark in Gmail). If we file the wordmark at M3 (~Aug 2026), VMC eligibility likely arrives Q3 2027. Until then, **CMC** (Common Mark Certificate) is the bridge — it requires 12 months of documented public use of the mark, and Gmail will display the logo without the verified checkmark.

### 2.5 ™ vs ®

- **™ — usable immediately**, no registration required. Apply now to "QUILTY" in marketing copy, email footers, mobile-app splash, etc. Provides common-law (geographically limited) protection.
- **℠** — service-mark variant for pure services. Functionally interchangeable with ™ for our purposes; most modern marketing uses ™ for both.
- **® — only after Certificate of Registration arrives.** Improper ® use is per TMEP 906.04 deemed fraud if intentional; in practice modern courts are lenient, but it can sink a pending application or an infringement suit's damages claim.

Action: ship "Quilty™" everywhere from M3 onward, switch to "Quilty®" once the certificate arrives (likely 2027-2028).

### 2.6 International (Madrid Protocol)

Madrid Protocol is the cost-efficient way to extend US registration internationally. Key parameters:

- **6-month priority window:** Filing Madrid within 6 months of the US application date claims the US filing date as the international priority date. **This is the single best argument for filing the US wordmark at M3 rather than at launch** — it preserves Madrid optionality for a year+ at zero incremental cost.
- **Country fees:** Variable, $100-$850/country/class. EU (EUIPO), UK, and Canada are all ~$300-500/country/class via Madrid.
- **Central-attack risk (5 years):** For the first 5 years, the Madrid international registration is dependent on the US base. If the US registration is cancelled/refused, the international registrations all fall. After 5 years, they detach and stand alone.
- **EU note:** A direct EUIPO filing (~€850 = $920) covers all 27 EU member states in one shot and is often cheaper than EU-via-Madrid for a single-class filing. UK requires a separate filing (post-Brexit). Canada is best via Madrid.

**Recommend:** **Defer Madrid until international expansion is concrete.** Likely M9+ or post-Series A. The 6-month priority window can be re-opened by re-filing in the US (start fresh priority date) if needed, so missing the first window isn't catastrophic.

---

## 3. CAN-SPAM §5(a)(5) requirement + qualifying address types

### 3.1 The statute

15 U.S.C. § 7704(a)(5)(A)(iii) requires that every **commercial electronic message** (CEM) include a **"valid physical postal address of the sender."** The FTC's implementing regulation, **16 CFR § 316.2(p)**, defines what qualifies:

> "The term _valid physical postal address_ means the sender's current street address, a Post Office box the sender has accurately registered with the United States Postal Service, or a private mailbox the sender has accurately registered with a commercial mail receiving agency that is established pursuant to United States Postal Service regulations."

So **three** qualifying types:

| Type                               | Qualifies?                                        | Notes                                                          |
| ---------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Current street address             | Yes                                               | Real office, headquarters, founder's home                      |
| USPS-registered PO Box             | Yes                                               | "PO Box 1234" format; cheap ($25-150/yr)                       |
| CMRA private mailbox               | Yes                                               | Requires USPS Form 1583; reads as a street address             |
| Registered agent address           | **Not per FTC; generally prohibited by contract** | Statute is silent, but agent contracts forbid it               |
| Generic mail-forwarding (non-CMRA) | No                                                | Must be USPS-CMRA-established                                  |
| Virtual office (varies)            | Depends                                           | Only if it's a CMRA or qualifies as a "current street address" |

### 3.2 What does NOT qualify or is risky

- **Anonymous/forwarding-only services that aren't CMRA-registered.** Several "digital mailbox" services are not USPS-CMRA-compliant. iPostal1, PostScanMail, Anytime Mailbox, and Earth Class Mail (now LegalZoom Virtual Mail) are CMRA-registered; verify per provider.
- **Registered-agent addresses.** While the statute itself doesn't forbid it, **Northwest, Harbor Compliance, and CT Corporation** all restrict their address to "official correspondence" (service of process, state filings, tax notices). Using it in a marketing footer typically violates the agent's terms of service even if not the CAN-SPAM statute. Worse, mail addressed to "Marketing Department" at a registered agent often gets returned-to-sender, breaking the "valid" requirement.
- **Stripe Atlas's Delaware address.** Stripe Atlas provides a Delaware registered agent for the first year. **Do not use this in email footers.** Same issue as above — Atlas's agent (typically Capitol Services) restricts to legal correspondence.
- **Foreign addresses for US-targeted email.** CAN-SPAM applies based on recipient location; a US-physical-address requirement applies regardless of sender's country.

### 3.3 Penalties

CAN-SPAM violations carry civil penalties up to **$53,088 per email per recipient** (post-2024 inflation adjustment; the search-result figure of $46,517 is from an earlier year). Penalties apply per email, and the FTC has shown willingness to enforce against startup-stage senders with willful or repeated violations. ESPs (Mailchimp, Klaviyo, Customer.io) will also suspend accounts for missing footers — operational/deliverability risk often outweighs the regulatory risk.

### 3.4 Other jurisdictions

| Law                     | Address requirement                                              | Notes                                                                                      |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| CAN-SPAM (US)           | Required in every CEM                                            | 16 CFR §316.2(p)                                                                           |
| CASL (Canada)           | Required in every CEM + at consent capture                       | "Mailing address" — generally interpreted same as CAN-SPAM; fines up to CAD $10M/violation |
| GDPR Art 13 / 14        | Controller identification in privacy notice (not in every email) | Different surface: privacy policy must name controller + provide contact info              |
| ePrivacy Directive (EU) | Sender identity required; no explicit "physical address" rule    | Most providers add it anyway to satisfy CASL/CAN-SPAM globally                             |
| UK PECR                 | Same as ePrivacy                                                 | Post-Brexit equivalent                                                                     |
| Germany (TMG/DDG)       | Impressum required for online presence (separate surface)        | Stricter — applies to website, not just emails; full legal name + address                  |

**Implication:** A single CAN-SPAM-compliant CMRA address satisfies CASL and is reusable in the website's Impressum/legal notice for EU-facing surfaces. The Impressum is a separate surface from email footers but uses the same physical-address text.

---

## 4. Registered agent / mailbox service comparison

A **registered agent** (RA) and a **CMRA mailbox** serve different purposes; many founder-stage companies need both. RA handles legal correspondence + state filings; CMRA mailbox handles marketing-footer + public-facing addresses.

### 4.1 Registered agent comparison (legal/state correspondence)

| Service                             | Cost/yr                          | Pros                                                                                    | Cons                                                                        | Best for                                                        |
| ----------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Northwest Registered Agent**      | $125                             | No data resale, same-day scanning, free 1st year with formation, family-owned           | Limited automation, multi-state requires per-state                          | Single-state startups; privacy-conscious founders               |
| **Harbor Compliance**               | $99 base / $299 full             | Best multi-state; integrated compliance automation (BOI, annual reports, franchise tax) | Pricier full-tier                                                           | Multi-state expansion; nonprofits                               |
| **Stripe Atlas (Capitol Services)** | Included Year 1, ~$100+/yr after | Bundled with DE C-Corp formation; smooth onboarding                                     | Delaware only; address contractually restricted; needs replacement at scale | DE C-Corp founder-stage; bundle convenience                     |
| **LegalZoom**                       | $249-299                         | Brand recognition; broad service catalog                                                | Aggressive upsells; thinner service; ~18mo founder churn                    | If already using LegalZoom for other needs (rarely best choice) |
| **CT Corporation (Wolters Kluwer)** | $325+/state                      | Enterprise-grade; investor expectation at Series A+                                     | Most expensive; overkill pre-VC                                             | Series A+ companies; investor due-diligence ready               |

**Recommend Northwest** for the RA. $125/yr, won't resell data, won't upsell, single founder-friendly. Switch to CT Corporation only if a Series A lead requires it (investor preference).

### 4.2 CMRA mailbox comparison (CAN-SPAM/marketing/public address)

| Service                                       | Cost/yr     | Address format      | Mail scanning             | Notes                                                  |
| --------------------------------------------- | ----------- | ------------------- | ------------------------- | ------------------------------------------------------ |
| **iPostal1**                                  | $120-360    | "Street, Suite #"   | Yes, on-demand            | Most CMRA locations of any provider (3,000+)           |
| **Anytime Mailbox**                           | $108-300    | "Street, # ABC"     | Yes                       | Strong app, good locations                             |
| **Earth Class Mail / LegalZoom Virtual Mail** | $400-1,200  | "Street, Suite #"   | Yes, auto                 | Pricier; enterprise polish                             |
| **Stable**                                    | $360-720    | "Street, Suite #"   | Yes                       | Y Combinator-popular; clean modern UX                  |
| **USPS PO Box**                               | $25-160     | "PO Box 1234"       | No                        | Cheapest, but "PO Box" reads worse on receipts/footers |
| **Virtual office (Regus, WeWork, Davinci)**   | $480-2,400+ | Real street address | Often, plus meeting rooms | Overkill unless you need physical meetings             |

**Recommend iPostal1 or Anytime Mailbox** at ~$15-25/month. Choose the city deliberately — if the company will be a Delaware C-Corp, a Delaware CMRA address looks consistent; if founder-domiciled in another state, that state works too. **Avoid USPS PO Box for the public-facing address** — "PO Box 1234" on a Stripe receipt or App Store listing reads less trustworthy than a Suite-format CMRA address (even though both are CAN-SPAM compliant).

### 4.3 Combined recommendation

- **Northwest Registered Agent** for service of process and state legal mail ($125/yr).
- **iPostal1 (or Anytime Mailbox)** in a CMRA location for everything else: CAN-SPAM email footer, App Store / Play Store developer address, Stripe merchant address, HIPAA NPP Privacy Officer mailing address, support@ snail-mail fallback, etc. ($180-300/yr).
- **Total: ~$300-425/yr** for full address coverage.

Both can use the same mailbox-handler workflow — scan, forward, archive, monthly review.

---

## 5. C9 recommendation (USPTO wordmark scope + timing)

**Recommend (CONFIRM): Wordmark-only at M3, Classes 9 + 42 + 44, intent-to-use, attorney-filed.**

| Component   | Recommendation                                                       |
| ----------- | -------------------------------------------------------------------- |
| What        | "QUILTY" standard-character wordmark                                 |
| When        | M3 (after brand-voice work locks the name; logo not stable yet)      |
| Classes     | 9 (downloadable app), 42 (SaaS/web), 44 (mental-health services)     |
| Basis       | 1(b) intent-to-use (file before launch; SoU per class as each ships) |
| Filer       | Trademark attorney (flat-fee firm, $1,200-$2,500)                    |
| Pre-filing  | Attorney clearance search (~$500) to de-risk Quilty-name collision   |
| Logo timing | Defer to M5 once brand-identity work locks the actual logo           |
| Madrid      | Defer to international-expansion trigger (M9+ / Series A)            |

**Rationale:**

1. **M3 is the right time for the wordmark.** The product name is the most stable brand asset; logo can iterate, name cannot. Filing now preserves Madrid 6-month priority and starts the BIMI/VMC clock so VMC eligibility lines up with public-launch email volume.

2. **Three classes, not one.** USPTO doesn't allow class corrections; Class 44 specifically protects against a future clinician-marketplace pivot or a "speak to a therapist" feature. The +$700 incremental cost (vs Class 9 + 42 only) is cheap insurance.

3. **Wordmark before logo.** Logos drift during brand-identity work (M3-M5). Filing a logo before it's stable means abandoning a $350+ filing or, worse, prosecuting a registration for a logo we've replaced. Wordmark survives any visual rebrand.

4. **Attorney, not pro-se.** Class 44 medical-services language is a known pro-se trap (FDA/SaMD adjacency). Office-action response is technical. The all-in $2,250-$3,550 is a one-time cost; pro-se savings ($1,500-$2,500) are not worth the registration-loss risk.

5. **BIMI/VMC.** Gmail accepts USPTO-registered wordmarks for VMC. The wordmark filing at M3 puts us in the VMC queue by ~2027 (~12-18mo to registration), which aligns with launch + email-marketing ramp. Until then, **CMC** (12 months proven public use → unverified Gmail logo display) is the bridge per D120.

---

## 6. C11 recommendation (CAN-SPAM physical address)

**Recommend (CONFIRM): CMRA private mailbox via iPostal1 or Anytime Mailbox; separate from registered agent.**

| Component                   | Recommendation                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Address type                | CMRA private mailbox (USPS Form 1583 registered)                                                                             |
| Provider                    | iPostal1 or Anytime Mailbox (~$15-25/mo)                                                                                     |
| Address format              | "1234 Main St, Suite 100" — reads as street address                                                                          |
| Used for                    | CAN-SPAM email footer; App Store developer address; Stripe merchant address; HIPAA NPP Privacy Officer; Impressum on website |
| Registered agent (separate) | Northwest Registered Agent ($125/yr) for legal mail                                                                          |
| Total annual cost           | $300-425/yr (CMRA + RA combined)                                                                                             |

**Rationale:**

1. **Statute compliance.** 16 CFR §316.2(p) explicitly names CMRA private mailbox as qualifying. Zero ambiguity.

2. **Reads better than PO Box.** A Suite-format street address on Stripe receipts, App Store listings, and email footers signals professionalism. "PO Box 1234" reads founder-garage. Both comply with CAN-SPAM; CMRA is the better default.

3. **Reuse across surfaces.** One CMRA address serves: CAN-SPAM, CASL, App Store developer address, Stripe merchant address, HIPAA Privacy Officer mailing address (NPP requirement), Impressum on EU-facing surfaces, customer mail-in returns. Avoids the founder-mistake of using 3-4 different addresses across surfaces (which confuses customers and audit trails).

4. **Privacy.** Founder home address never enters public record. WHOIS is already Porkbun-privacy-protected, but App Store, Stripe, USPTO, and HIPAA NPP all require a real mailing address — CMRA is the privacy-preserving choice.

5. **Separate from registered agent.** Northwest contract restricts their address to legal correspondence; using it in marketing footers risks both contract breach and CAN-SPAM "validity" challenges (if mail to "Marketing Dept" gets returned). Two addresses, two purposes — clean separation.

6. **Mailbox monitoring.** CMRA providers offer scan-on-receipt; founder reviews via app. Set a monthly cadence to flush forwarded mail. Note: this is a **named role** in the HIPAA NPP (Privacy Officer must "respond to written complaints"), so the mailbox must be monitored, not just nominal.

---

## 7. Items not in our decision log yet

Surfacing these as discoveries from the C9 + C11 dive; each may need a decision but none are blockers for M3 wordmark filing or CMRA setup.

### 7.1 Entity formation (likely Delaware C-Corp, not yet locked)

- **Delaware C-Corp** is the standard for any startup considering VC. Filing before USPTO trademark is preferred — the trademark is **owned by the entity**, not the founder. Filing pro-se as a founder and later assigning to the Newco is an extra USPTO assignment filing ($40-100 + attorney time).
- **Stripe Atlas, Clerky, Firstbase, or LegalZoom** are typical formation paths. Atlas is $500 + $300 DE franchise tax; Clerky is $799 (higher-quality docs but no built-in agent); Firstbase $399.
- **Trigger:** Before USPTO filing at M3. Entity needs to exist to own the mark.
- **Side effects:** Delaware franchise tax (~$400/yr min), federal EIN (free, immediate), banking (Mercury / Brex / Stripe Treasury), §83(b) elections, founders' stock vesting docs.

### 7.2 Trademark watch service

- **TrademarkVision, Markify, CompuMark Brand Watch** monitor USPTO new filings for marks confusingly similar to ours. Cost: $200-1,500/yr.
- **Recommend defer to post-launch.** Pre-launch, low chance of imitators. Post-launch with paying customers, watch-service value increases.

### 7.3 Trademark opposition window

- Within 30 days of USPTO publication, third parties can oppose our mark. We should also monitor USPTO publication of conflicting marks ourselves (free via TESS) for the first 12 months post-launch.
- **Recommend:** Calendar reminder; attorney handles if opposition filed.

### 7.4 Typo-domain defense

- Common adjacent domains: `my-quilty.app`, `myquilty.com`, `getquilty.com`, `quilty.com` (if available), `quilty.app`, `quilty.health`, `quilty.co`.
- Cost: $10-100/yr per domain at Porkbun.
- **Recommend:** Audit available variants at M3 alongside the trademark filing. Register the 3-5 most defensive ones (~$100-300/yr). Skip premium-priced redirects (anything >$500/yr) unless a clear squatter risk.
- `quilty.com` is almost certainly registered — check UDRP feasibility only if there's a real squatting/cybersquatting case.

### 7.5 Brand-protection tools (Markmonitor, BrandShield, CSC)

- Enterprise tier — $5,000-50,000/yr. Surveils domain registrations, social handles, marketplace counterfeits, paid-search bidding on the mark.
- **Recommend defer to Series A+.** Not justified pre-launch or at sub-100K MAU.

### 7.6 Mailbox monitoring SLA

- HIPAA NPP requires Privacy Officer to respond to written complaints "in a timely manner" (HHS guidance: 60 days; faster is better).
- **Recommend:** Founder reviews CMRA scans weekly during pre-launch; daily auto-forward of "urgent" senders (USPTO, IRS, state SOS, FTC) via filter.

### 7.7 Whois privacy

- Already Porkbun-privacy-protected per existing setup. Confirm at M3 the `.com` and any additional defensive registrations also have privacy protection enabled (Porkbun bundles it free).
- **No action required.**

### 7.8 International trademark sequencing

- Madrid Protocol filings cost ~$2,000-5,000 per class for EU + UK + CA combined (USPTO certification + WIPO + per-country fees).
- **Recommend defer to:** First non-US paying customer cohort or Series A. Use the 6-month priority window only if expansion is firmly on the M3 roadmap; otherwise, defer indefinitely.

### 7.9 Trademark renewal cadence

- USPTO maintenance: **§8 declaration of use between years 5-6** (~$525/class), then **§8 + §9 renewal between years 9-10** (~$725/class), then every 10 years thereafter.
- **Recommend:** Calendar these in operational runbook now; missing a §8 = registration cancelled. Trademark attorney usually offers an annual docket-monitoring add-on for $50-100/yr.

### 7.10 Stripe merchant address vs CAN-SPAM address

- Stripe requires a verified business address on customer-facing receipts. Match this to the CMRA address.
- Apple App Store + Google Play developer-account address is also customer-visible. Same CMRA address.
- **Recommend:** Use the **single CMRA address** across all three surfaces.

### 7.11 HIPAA NPP Privacy Officer address

- HIPAA Privacy Rule requires the NPP (Notice of Privacy Practices) to name a Privacy Officer with a mailing address for complaints.
- Even though the website is in **Workloads-NonHIPAA** OU per D2/D31 (no PHI in website runtime), the Quilty _product_ is HIPAA-covered when clinician services are involved, and the NPP appears on the marketing site.
- **Recommend:** Same CMRA address for the Privacy Officer mailing address.

### 7.12 Logo-design timing relative to USPTO filing

- Filing a design-mark (logo) **locks** the visual mark. Any subsequent material variation requires a new filing.
- **Recommend:** Brand-identity sprint at M4-M5 → file logo as Class 9/42/44 design-mark **after** logo is locked, ideally as a single combined wordmark+logo composite mark. Cost: another $1,050 in USPTO fees + $1,200-2,500 in attorney fees. Plan budget.

### 7.13 Color claim in design-mark filing

- Filing the logo in **standard color** (black/white) keeps flexibility for color iteration. Filing with **specific color claim** (Pantone X + Hex Y) narrows protection but enables claims against same-color copycats.
- **Recommend:** Black/white standard at M5 unless brand-identity work surfaces a uniquely defensible color signature.

---

## Sources

- [USPTO Trademark fee information](https://www.uspto.gov/trademarks/trademark-fee-information)
- [USPTO Trademark fee schedule (current)](https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule)
- [Stinson LLP — Navigating the USPTO's New Trademark Fees (Jan 2025)](https://www.stinson.com/newsroom-publications-usptos-new-trademark-fees-expected-to-impact-filing-costs)
- [WTR — Understanding the new 2025 US trademark filing system and fee increases](https://www.worldtrademarkreview.com/review/the-trademark-prosecution-review/2026/article/specialist-chapter-understanding-the-new-2025-us-trademark-filing-system-and-fee-increases)
- [USPTO — Madrid Protocol for international trademark registration](https://www.uspto.gov/ip-policy/international-protection/madrid-protocol)
- [WIPO — Individual Fees under the Madrid Protocol](https://www.wipo.int/en/web/madrid-system/fees/ind_taxes)
- [USPTO — Classification of Computer Services](https://www.uspto.gov/web/offices/com/sol/notices/class.html)
- [Skala — Understanding Classes 9 and 42 for Software Companies](https://www.skala.io/blog/understanding-classes-9-and-42-for-software-companies)
- [BrandDiplomacy — USPTO Trademark Class 44](https://www.branddiplomacy.com/post/uspto-trademark-classes-blog-series-class-44-medical-beauty-and-agricultural-services)
- [JPG Legal — Software Trademark Guide](https://jpglegal.com/software-trademark-guide-classes-and-specimens/)
- [TMEP 906.04 — Improper use of ®](https://tmep.uspto.gov/RDMS/TMEP/current)
- [Northwest Registered Agent — TM vs R](https://www.northwestregisteredagent.com/trademark-service/how-to-apply/tm-vs-r)
- [Corsearch — TM vs R](https://corsearch.com/content-library/blog/tm-versus-r-whats-the-difference-and-why-does-it-matter/)
- [FTC — CAN-SPAM Act: A Compliance Guide for Business](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- [16 CFR §316.2(p) — Definition of "valid physical postal address"](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-316)
- [ISIPP SuretyMail — CAN-SPAM PO Box clarification](https://www.isipp.com/blog/do-i-have-to-put-my-real-physical-address-in-my-emails-to-be-can-spam-compliant-can-i-use-a-po-box/)
- [Bento — CAN-SPAM and PO Boxes](https://bentonow.com/posts/can-i-use-a-po-box-can-spam)
- [Prospeo — CAN-SPAM physical address requirement 2026](https://prospeo.io/s/can-spam-physical-address-requirement)
- [CRTC — Canada Anti-Spam Legislation FAQ](https://crtc.gc.ca/eng/com500/faq500.htm)
- [McInnes Cooper — CASL 10 FAQs](https://www.mcinnescooper.com/publications/canadas-anti-spam-legislation-casl-10-faqs/)
- [Google Workspace Help — Set up BIMI](https://support.google.com/a/answer/10911320?hl=en)
- [BIMI Group — Verified Mark Certificates (VMC) and BIMI](https://bimigroup.org/verified-mark-certificates-vmc-and-bimi/)
- [BIMI Group — BIMI for Non-Trademarked Logos (CMC)](https://bimigroup.org/bimi-for-non-trademarked-logos/)
- [Suped — Requirements for using a word mark with BIMI](https://www.suped.com/knowledge/email-deliverability/technical/what-are-the-requirements-for-using-a-word-mark-with-bimi)
- [Gerben IP — Trademark Registration for BIMI Authentication](https://www.gerbenlaw.com/blog/trademark-registration-for-bimi-authentication/)
- [Discern — Best Registered Agent for Stripe Atlas Companies (2026)](https://www.discern.com/resources/best-registered-agent-stripe-atlas)
- [Discern — Registered Agent & Compliance Platforms Compared](https://www.discern.com/resources/registered-agent-compliance-platform)
- [LLCBuddy — LegalZoom vs Northwest Registered Agent (2026)](https://llcbuddy.com/legalzoom-vs-northwest-registered-agent/)
- [LLCBuddy — LegalZoom vs Harbor Compliance (2026)](https://llcbuddy.com/legalzoom-vs-harbor-compliance/)
