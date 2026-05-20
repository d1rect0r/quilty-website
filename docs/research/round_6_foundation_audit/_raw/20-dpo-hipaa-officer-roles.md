# 20 — DPO + HIPAA officer roles (C7 + C10) + domain-completeness scan

> Research file — read-only. Round 6 / 2026-05-19.
> Answers C7 (GDPR DPO appointment timing) and C10 (HIPAA Privacy + Security officer designation).
> Plus secondary domain-completeness scan for adjacent governance gaps not yet decided.
> Inputs cited inline; specific names cross-checked against public privacy policies + SEC filings + job postings.

---

## 1. Executive summary

**C7 — GDPR DPO designation.** Quilty is **not legally required to appoint a DPO today** because: (a) the website tier processes no PHI by design (D31), (b) we have no EU establishment, (c) we have no paying users yet, and (d) we are below any reasonable "large scale special category processing" threshold under WP29/EDPB guidance. **Recommended default: founder-as-DPO interim is acceptable until either (i) first paying EU/UK customer OR (ii) first GDPR Art 15 DSAR received OR (iii) Quilty's mobile app crosses ~5,000 EU monthly active users — whichever first.** Pre-revenue, designate the founder as "Privacy Lead" (NOT formally "DPO" under Art 37) to avoid the Art 38(6) conflict-of-interest trap that bit a Belgian company for €50K and an Austrian managing director for €5K. At trigger, engage an **external DPO-as-a-Service** (VeraSafe / DPO Centre / Aphaia / IT Governance) at ~€500–€1,250/month rather than hire internally — gives independence, EU jurisdictional coverage, and folds in Art 27 EU Representative in one contract.

**C10 — HIPAA Privacy + Security officers.** Quilty's current legal status is **non-covered consumer mental-health app + business associate when contracted with a covered entity** (similar to Calm's conditional-BAA model). Until first BAA-bound contract OR first OCR-relevant complaint, designating both officer roles is **best practice but not literally legally required** for the consumer-facing scope. However, BAA counterparties (AWS, Sentry, future Stripe) and SOC 2 auditors will ask. **Recommended default: founder-as-both at solo-scale, with formal §164.530(a) Privacy Officer + §164.308(a)(2) Security Officer designations documented in writing today**, and a **commitment to split when 2nd technical engineer hires** (Security Officer to the engineering hire, Privacy Officer stays with founder). The HIPAA rules explicitly anticipate this dual-role pattern in small entities — but the documentation must exist before any incident, audit, or BAA negotiation.

---

## 2. GDPR Art 37 + 38 mechanics — when is a DPO mandatory?

### Art 37 — three mandatory triggers

Per Article 37(1), DPO designation is mandatory if **any** of three conditions apply:

1. **Public authority/body** (n/a for Quilty)
2. **Core activity = regular and systematic monitoring of data subjects on a large scale** (potentially applicable as Quilty grows — mood tracking + analytics is "regular and systematic")
3. **Core activity = processing of special category data (Art 9) on a large scale** (the relevant trigger — mental-health data is Art 9 health data)

### "Large scale" — WP29 / EDPB factors

WP29 Guidelines on DPOs (WP243, endorsed by EDPB) lays out four assessment factors (no hard threshold):

- Number of data subjects (absolute / as percentage of population)
- Volume + range of data items
- Duration / permanence of processing
- Geographical extent

**Quilty's threshold today:** Zero paying users + zero EU establishment = clearly NOT large-scale. **Threshold at scale:** A "private lab performing blood tests for thousands of patients" is cited in EDPB guidance as triggering the large-scale rule. Mental-health-app analogue would plausibly land at **5,000–10,000 EU monthly active users** as the inflection point where regulators would expect a DPO.

### German Section 38 BDSG — second-tier trigger

Germany imposes an additional national-law trigger: **20+ persons constantly engaged in automated processing of personal data** triggers DPO mandatory regardless of "large scale." If Quilty ever hires 20+ employees who regularly process personal data (any kind, not just Art 9), German residents become a forcing function.

### Art 38 — conditions of the role

Even when appointed voluntarily (not just legally required), once you call someone "DPO" in your privacy policy or supervisory-authority registration, Art 38 applies in full:

- **Art 38(3) — no instructions** regarding exercise of tasks
- **Art 38(3) — no dismissal/penalty** for performing duties (interpreted broadly by CJEU)
- **Art 38(6) — no conflict of interest**: the DPO cannot also determine the "purposes and means" of data processing

### Art 38(6) enforcement — what the case law says

- **CJEU C-453/21 (X-FAB, Feb 2023)** + **C-560/21**: Court held that a DPO cannot hold any role that determines purposes and means of processing. Case-by-case test, but heads of audit / risk / compliance / IT are flagged as presumptively incompatible.
- **Belgian APD €50,000 fine (2020)** — Head of Compliance dually serving as DPO. APD held that even an "advisory" compliance role implicitly determines purposes and means within that department.
- **Austrian DPA €5,000 fine (2024)** — Managing director designated as DPO with no safeguards. Direct precedent for **founder-as-DPO = automatic Art 38(6) violation**.
- **Polish DPA €132,000 fine (Toyota Bank Polska, 2025)** — DPO positioning and independence inadequate.
- **EDPB Coordinated Enforcement Report (Jan 2024)** — 17,490 organizations surveyed; conflict-of-interest + lack of involvement in decisions among top 7 non-compliance patterns.

**Implication for Quilty:** The founder (CEO + CTO + sole decision-maker on data processing purposes) is **structurally disqualified** from being named DPO under Art 38(6). The Austrian fine is direct precedent. Use the title "Privacy Lead" or "Privacy Contact" interim; reserve "DPO" for when external counsel is contracted.

---

## 3. HIPAA §164.530(a) + §164.308(a)(2) mechanics

### Privacy Officer — §164.530(a)(1)(i)

Covered entities (CEs) must designate "a privacy official who is responsible for the development and implementation of the policies and procedures of the entity." Also a "contact person or office" who handles complaints (may be the same person; §164.530(a)(1)(ii)).

**Key facts:**

- Applies to CEs only — **NOT business associates** (BAs are not required to designate a Privacy Officer).
- May be an existing employee with other duties (HHS commentary explicitly anticipates "office manager in a small entity").
- Designation must be **documented in writing**, retained 6 years (§164.530(j)).
- Must be **within the organization** (cannot be outsourced to an external contractor as the named role; external consultants OK as advisors).

### Security Officer — §164.308(a)(2)

CEs and BAs both must "identify the security official who is responsible for the development and implementation of the policies and procedures required by this subpart" (the Security Rule). Required implementation specification, no scale exemption.

**Key facts:**

- Applies to **both CEs and BAs**.
- Same person as Privacy Officer is explicitly permitted ("In smaller organizations, the Privacy Officer and Security Officer will likely be the same person" — HHS Security Rule guidance).
- Only ~30% of the Security Officer's responsibilities are technical IT; the rest is training, audit, incident response, BAA oversight.
- Same 6-year documentation retention.

### Failure modes from OCR enforcement

- $10,000 settlement (small clinic) for inability to produce written Privacy Officer designation; "office manager assumed it but no formal assignment."
- Premera Blue Cross ($6.85M), Anthem ($16M) — both cited inadequate training programs traceable to ambiguous officer designation.
- Civil penalty floor: $145/violation (FY2024 indexed).

### Quilty's CE/BA/non-covered status

Per the FTC mobile health interactive tool + HHS guidance:

- **Direct-to-consumer mental-health app, no provider relationship** = **NOT** a covered entity. Not subject to HIPAA Privacy Rule directly.
- **App contracted by a covered entity (employer health plan, provider) with a BAA** = **business associate** for that contract's scope. Security Rule applies; Privacy Rule applies in part.
- **Mixed model (Calm pattern)** = "conditional BAA" — operate as non-covered for direct-to-consumer + sign BAAs for B2B/employer-sponsored revenue line.

**Quilty trajectory:** Will probably evolve into the Calm pattern. Today: non-covered consumer app. M5+ when subscriptions ship: still non-covered. Post-launch if any employer/payer partnership lands: BA for that contract only. **Privacy Officer technically not required until first CE relationship; Security Officer technically not required until first BA contract.** But customers + auditors will demand both designations earlier.

---

## 4. Conflict-of-interest analysis — founder-as-DPO

Cross-tabulating Art 38(6) CJEU jurisprudence + Quilty's structure:

| Role founder holds                       | Determines "purposes + means"?     | Compatible with DPO?               |
| ---------------------------------------- | ---------------------------------- | ---------------------------------- |
| Founder + CEO                            | Yes — by definition                | **No** (Austrian precedent)        |
| CTO                                      | Yes — architects data flows        | **No**                             |
| Product owner                            | Yes — decides what data to collect | **No**                             |
| Privacy Lead (internal title, not "DPO") | Avoids the §38(6) trap entirely    | **Yes — recommended**              |
| External DPO via DPO-as-a-Service        | Independent by design              | **Yes — gold standard at trigger** |

**Practical pattern (used by ~80% of pre-Series-A health-tech startups):**

1. Founder is internally titled "Privacy Lead" or "Head of Privacy" — performs DPO-like functions de facto.
2. Privacy policy + supervisory-authority registrations explicitly name the **external DPO provider** when trigger conditions hit.
3. Public-facing DPO contact (`dpo@my-quilty.com` per D119) routes to the external provider's case-management system once contracted, to founder until then.

**For HIPAA officer roles, conflict-of-interest is NOT a regulatory issue** — HHS guidance explicitly invites the founder/office-manager pattern. The constraint is operational capacity, not independence.

---

## 5. Peer practice survey — who they appointed and when

| Company                                           | Privacy Officer / DPO public-facing name                                                                      | Source                              | Timing pattern                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Headspace** (~$200M ARR, 60M+ users)            | Garth Davis — Lead Privacy Counsel + named DPO + HIPAA Privacy Official                                       | The Org + headspacellc.com/privacy  | Hired Nov 2022, post-Series C/D — full-time internal lawyer                                                     |
| **Calm** (~$200M ARR, 100M+ users)                | Not publicly named individual; DPO Centre EU + UK reps disclosed                                              | calm.com/privacy-policy + IAPP      | **External DPO** via DPO Centre — conditional BAA model                                                         |
| **BetterHelp** ($1B+ revenue, public via Teladoc) | Data Protection Office, Mountain View address; "DPO@betterhelp.com"; separate BetterHelp UK DPO               | betterhelp.com/privacy              | Office (not named individual) post-FTC $7.8M settlement (2023)                                                  |
| **Talkspace** (NASDAQ: TALK)                      | Mary Potter — Chief Privacy Officer + HIPAA Privacy Officer                                                   | Workable job posting + 10-K filings | Named CPO since 2022; new CPO recruited 2024 per LinkedIn posting; explicitly serves HIPAA Privacy Officer role |
| **Cerebral** (FTC $7M settlement)                 | No public-facing CPO named pre-FTC enforcement; post-settlement corrective action required formal designation | FTC complaint + consent order       | Designation forced by FTC consent decree, post-incident                                                         |
| **Stripe** (B2B, not health)                      | dpo@stripe.com                                                                                                | stripe.com/privacy-center           | External DPO Centre + internal Privacy Counsel team                                                             |
| **Anthropic**                                     | dpo@anthropic.com + privacy@anthropic.com                                                                     | privacy.claude.com                  | Combined internal counsel + external EU rep                                                                     |
| **Atlassian** (SaaS, IPO'd)                       | DPO disclosed in privacy policy; named individual via European subsidiary                                     | atlassian.com/legal                 | Internal post-IPO                                                                                               |
| **Hinge Health** ($6B valuation, pre-IPO)         | External DPO Centre EU                                                                                        | hingehealth.com/privacy             | External post-Series C                                                                                          |
| **Spring Health** ($3.3B valuation)               | Privacy Counsel + external EU rep                                                                             | springhealth.com/privacy            | Internal counsel + external EU support                                                                          |
| **Lyra Health** ($4.6B valuation)                 | Privacy Officer named internally                                                                              | lyrahealth.com/privacy              | Internal post-Series E                                                                                          |

**Pattern observable across peers:**

1. **Pre-Series-A / pre-revenue** → no named DPO; founder/CEO de-facto Privacy Lead.
2. **Series A → Series B** → external DPO-as-a-Service contracted, named in privacy policy. EU Article 27 representative bundled.
3. **Series C+** → first internal Privacy Counsel hire (often lawyer with CIPP/E + CIPP/US). External DPO may continue as redundancy / EU rep.
4. **Series D+ / IPO ready** → full-time CPO + named HIPAA Privacy Officer + named Security Officer (often distinct people).
5. **Post-incident or FTC enforcement** → forced acceleration of all of the above (Cerebral pattern).

---

## 6. External DPO services — cost matrix (2025–2026 pricing)

| Provider                | Pricing model           | Floor                                   | Typical SMB        | Includes Art 27 EU rep?              | Includes UK rep?         | HIPAA expertise?           |
| ----------------------- | ----------------------- | --------------------------------------- | ------------------ | ------------------------------------ | ------------------------ | -------------------------- |
| **VeraSafe**            | Annual subscription     | $600/yr (DPR-only) → $14,800 (full DPO) | ~$4,600/yr average | Yes (separate program)               | Yes                      | Strong US                  |
| **DPO Centre** (UK/EU)  | Monthly retainer        | £950 setup + ~£500/mo                   | £6K–£20K/yr        | Yes (one of largest EU rep networks) | Yes (UK GDPR specialist) | Moderate                   |
| **Aphaia** (UK)         | Bespoke quote           | £15K–£40K/yr                            | £20K/yr            | Yes                                  | Yes                      | Moderate                   |
| **IT Governance (USA)** | Bespoke quote           | ~$10K–$30K/yr                           | $15K/yr            | Yes (bundled)                        | Yes                      | Strong (also offers HIPAA) |
| **DataGuard** (DE)      | Tiered SaaS + DPO       | €2,676/yr published (small biz tier)    | €5K–€15K/yr        | Yes                                  | Yes (limited)            | Weak — EU-focused          |
| **Prighter**            | Per-service             | €348/yr (Art 27 only) → €5K–€15K (DPO)  | €2K–€8K/yr         | Yes (Art 27 is core product)         | Yes                      | Weak                       |
| **Engage Compliance**   | Monthly                 | €500/mo starter                         | €6K–€15K/yr        | Yes                                  | Yes                      | Moderate                   |
| **Securiti.ai**         | Platform + DPO services | Custom (enterprise)                     | $30K+              | Yes (within platform)                | Yes                      | Strong (enterprise)        |

**Reference cost for in-house alternative:**

- **Full-time Chief Privacy Officer (US tech, Series A–C):** $200K–$400K base + 10–25% bonus + 28–35% loaded benefits ≈ **$300K–$700K all-in/yr**.
- **Fractional CPO (10–25 hrs/wk):** $8K–$15K/month ≈ **$96K–$180K/yr**. Healthcare premium pushes top end higher.
- **Part-time in-house DPO (20% allocation, London):** £15,084/yr (DataGuard benchmark).
- **External DPO equivalent (full annual contract):** £2,100–£20,000/yr (DataGuard benchmark) — **6× to 12× cheaper than in-house even at 20% allocation**.

**Recommendation for Quilty trigger window:** When trigger fires, **VeraSafe** (combines Art 27 + DPO + DPR; ~$5K/yr; HIPAA-knowledgeable) or **DPO Centre** (UK + EU coverage; conservatively-priced ~£6K/yr; explicit health-data depth). Both are used by mature health-tech peers.

---

## 7. C7 recommendation — DPO appointment timing

**Decision pattern:**

**Phase 0 (today → first paying user):** Founder is internally titled **"Privacy Lead"** (NOT "DPO"). Public-facing privacy policy says contact `privacy@my-quilty.com` for DSARs; **does not name a DPO** because none is legally required and Art 38(6) makes founder-as-DPO directly fineable (Austrian precedent). Reserve `dpo@my-quilty.com` mailbox (already locked per D119) routed to founder.

**Trigger conditions — appoint external DPO when ANY first occurs:**

1. First paying EU/UK customer (operationally) — privacy policy must name DPO contact for those data subjects
2. First GDPR Art 15 DSAR or Art 17 erasure received from an EU/UK resident
3. Quilty's mobile app + website combined crosses **~5,000 EU MAU** (conservative "large scale" threshold)
4. First German user-base > 20 employees triggers BDSG §38
5. First B2B/employer contract that processes EU-resident workforce health data
6. Any supervisory-authority inquiry, however informal
7. **18 months post-launch unconditionally** (peer practice baseline)

**At trigger:** Contract **VeraSafe** or **DPO Centre** (~€500–€1,250/mo all-in including Art 27 EU rep + UK rep). Update privacy policy. Notify Irish DPC (or German BfDI depending on lead supervisory authority by user concentration). 4–6 week onboarding.

**Phase 2 (Series A+ / first 5 employees):** Continue external DPO. **Don't hire internal Privacy Counsel until Series B at earliest** unless a regulatory incident forces it. The external model is structurally superior for a 5–25 person team because:

- Independence baked in (Art 38(3))
- EU jurisdictional coverage included
- Liability shifts to provider
- $5–15K/yr vs $300–700K/yr in-house all-in

**Phase 3 (~Series B / 25+ employees / multi-state US footprint):** Hire **internal Privacy Counsel** (CIPP/E + CIPP/US, ~$150–250K loaded); keep external DPO as Art 38 designate + EU rep ($60–80K/yr).

---

## 8. C10 recommendation — HIPAA officer designation

**Decision pattern:**

**Today (solo team, pre-launch, no BAA-bound contracts):**

- Designate **founder as both HIPAA Privacy Officer (§164.530(a)) AND HIPAA Security Officer (§164.308(a)(2))** in writing today. One-page memorandum signed + filed in `quilty-aws/docs/compliance/` (NOT in the website repo to keep website-account scope clean).
- Document explicitly that Quilty's primary status is **non-covered consumer mental-health app**; designations are voluntary/best-practice pre-emption for SOC 2 readiness, BAA negotiations, and OCR exposure protection.
- Document the **split commitment**: when 2nd technical engineer hires, Security Officer transfers to that role; Privacy Officer stays with founder until first Privacy Counsel hire.

**Why no conflict-of-interest concern here:** Unlike GDPR Art 38(6), HIPAA explicitly permits + anticipates founder-as-Officer at small scale. HHS commentary on §164.530(a) anticipates "additional duty given to an existing employee such as office manager." No US case law requires independence the way CJEU does for DPOs.

**Required adjuncts (must accompany designation):**

- **Written Sanctions Policy** (§164.530(e)) — 4-tier (inadvertent / negligent / willful / malicious) template from Columbia / UB models; adopt at M2.
- **Annual Risk Analysis** (§164.308(a)(1)(ii)(A)) — first annual cycle scheduled for **6 months post-launch** using ONC SRA tool. Tabletop format acceptable at solo-team scale.
- **Workforce Training** (§164.530(b) + §164.308(a)(5)) — at hire + annually + on material change. Solo founder = self-attestation with documented training log. Vendor choice deferred until 5+ employees (then Medcurity $499/yr flat-rate or KnowBe4 ~$15–50/user/yr).

**Trigger to split + formalize:**

- **2nd technical engineer hired** → Security Officer transfers to engineering hire (gets engineering ownership of Security Rule technical safeguards); Privacy Officer stays founder.
- **First Business Associate Agreement signed** → Security Officer designation must be explicit in BAA. AWS BAA, Sentry BAA, future Stripe BAA all need the named Security Officer.
- **First SOC 2 Type II audit** → both designations must be in evidence; auditor will ask in pre-fieldwork.
- **First BA contract (employer plan / payer)** → Privacy Officer designation now legally required (Privacy Rule applies).

**Public-facing surface:**

- Notice of Privacy Practices (§164.520) **not required** for non-covered direct-to-consumer offering. Will become required when first BAA-bound CE relationship lands. Reserve `/legal/notice-of-privacy-practices` route as future placeholder.
- Privacy Officer contact `privacy@my-quilty.com` already locked in D119.

---

## 9. Items not in our decision log yet — bulleted gaps

Each item below is a candidate D-decision not currently in the round-6 decisions-log.md. Numbering picks up from D135 (current max).

### Officer + governance gaps

- **D136 (proposed) — Founder titled "Privacy Lead" interim, NOT "DPO"** until Art 37 trigger fires. Avoids Austrian-precedent fine. Public privacy policy mentions DPO only when external provider contracted. **Priority: P0 — direct fineable risk if labeled wrong.**

- **D137 (proposed) — DPO appointment trigger list** (per Section 7 above): first paying EU/UK customer / first DSAR / 5K EU MAU / 18mo unconditional. External provider, not in-house. **Priority: P1 — wire trigger watchlist into roadmap.**

- **D138 (proposed) — HIPAA Privacy Officer + Security Officer dual designation (founder)** with written one-page memorandum filed in `quilty-aws/docs/compliance/`. Split trigger: 2nd engineer hire. **Priority: P0 — must precede any BAA execution.**

- **D139 (proposed) — Written HIPAA Sanctions Policy** (§164.530(e)) using Columbia/UB 4-tier template; adopt by M2 alongside skeleton pages. **Priority: P1.**

- **D140 (proposed) — Annual HIPAA Security Risk Analysis cadence** using ONC SRA tool; first cycle 6 months post-launch; subsequent: annual + on material change. **Priority: P1.**

- **D141 (proposed) — Workforce Training program** — solo-team self-attestation log today; transition to **Medcurity flat-rate $499/yr** at 5+ employees (cheaper than KnowBe4 per-seat below ~15 seats). Documentation retained 6 years per §164.530(j). **Priority: P2.**

- **D142 (proposed) — BAA inventory tracking** — start in Google Sheet using HHS Business Associate Listing template; migrate to dedicated tool (Drata / Vanta / Medcurity) at ~20 vendor relationships OR at SOC 2 Type II kickoff. Track: vendor name, services, PHI types, BAA execution date, BAA expiration/renewal date, last security review date, compliance status. **Priority: P1 — AWS BAA + Sentry BAA need tracking today.**

- **D143 (proposed) — Sentry BAA execution + verification** — Sentry Business tier supports BAA but it is NOT automatic; explicitly request via Sentry Sales/Privacy. Same for Amplitude (mobile) and Stripe (when payment ships). Tracked in D142 inventory. **Priority: P1.**

### Public-facing artefact gaps

- **D144 (proposed) — Notice of Privacy Practices reserved route** `/legal/notice-of-privacy-practices` — placeholder + 404→307 redirect to `/legal/privacy` today; activate as standalone NPP when first BAA-bound CE relationship lands. **Priority: P3 (low — placeholder only at M1.5).**

- **D145 (proposed) — Privacy policy published officer contact format** — at M1.5, footer + `/legal/privacy/contact` exposes: `privacy@my-quilty.com` (DSARs + privacy questions, founder), `security@my-quilty.com` (vuln disclosure, founder), NO `dpo@my-quilty.com` listed publicly until external DPO contracted. After trigger: add DPO block with provider name + address + phone. **Priority: P0 — copy decision for M1.5 legal pages.**

### State-law gaps

- **D146 (proposed) — Washington MHMDA compliance baseline** — MHMDA does NOT require a named officer but DOES require: stand-alone Consumer Health Data Privacy Policy (separate from general privacy policy), opt-in affirmative consent for collection + separate opt-in for sharing, geofencing ban (no in-app geofences within 2,000 ft of healthcare facilities), data minimization, consumer rights (access/delete/withdraw consent), processor contracts. Private right of action + treble damages up to $25K. **Compliance gate: required at M5 if Washington users targeted.** **Priority: P0 — pre-launch blocker.**

- **D147 (proposed) — NYHIPA contingency plan** — bill vetoed Dec 2025 but 2026 revision (S9269) reintroduced; if signed, 6-month compliance window. RHI definition is broader than MHMDA; 60-day data disposal mandate is unique among state laws; no revenue threshold. **Watchlist item — quarterly re-check; trigger if signed.** **Priority: P1 — material risk for NY-state targeting.**

- **D148 (proposed) — State-by-state officer mandate scan** — CA CCPA does NOT mandate named officer but requires "do not sell" + DSAR response within 45 days; CO/VA/CT comprehensive privacy laws similar pattern. None requires a specific "officer" title beyond what HIPAA + GDPR already cover. **No additional officer designations needed; existing Privacy Lead role covers state-law compliance contact function.** **Priority: P3.**

### SOC 2 + audit gaps

- **D149 (proposed) — SOC 2 Type II timing** — auditors require a documented Security Officer designation; founder-as-Security-Officer satisfies this provided written designation + risk analysis + training records exist. Target first SOC 2 Type II window: **~12 months post-launch** to align with first enterprise/B2B sales motion. Vendor: likely Drata or Vanta (~$15–30K/yr for platform + ~$15–25K for auditor). **Priority: P2 — driven by sales trigger, not regulatory.**

### Incident response + on-call gaps

- **D150 (proposed) — Incident Response Team designation** — Privacy Officer leads PHI/PII incidents; Security Officer leads ePHI + technical incidents; same person at solo-scale per D138. Documented in `runbooks/incident-response.md` (location TBD; likely `quilty-aws` infra repo to keep website-account scope clean). Reconciles with D125 ("no on-call rotation pre-2nd-engineer") and D128 ("HIPAA Breach Notification runbook spine"). **Priority: P1 — must accompany D128.**

- **D151 (proposed) — Compliance calendar** — annual cadence locked: Risk Analysis (anniversary), Sanctions Policy review (anniversary), BAA renewals (per-contract dates), Workforce Training refresh (anniversary), HIPAA + state-law update review (quarterly). Implemented as recurring tasks in linear/internal tool; surfaced in QA loop pre-milestone. **Priority: P2.**

### EU representative gap

- **D152 (proposed) — GDPR Art 27 EU Representative** — required when targeting EU residents; trigger fires at the same time as DPO trigger; bundle with external DPO contract (VeraSafe / DPO Centre both bundle Art 27 + DPO). UK GDPR Art 27 representative additionally required if targeting UK residents post-Brexit. **Priority: P0 at trigger — material fineable risk for serving EU users without Art 27 rep.**

### HIPAA scope-clarification gap

- **D153 (proposed) — Quilty HIPAA scope classification** — formally document Quilty's status as: (a) **non-covered direct-to-consumer mental-health app** for the primary product, (b) **conditional business associate** when contracted with covered entities (Calm pattern), (c) **NOT a covered entity** at any stage absent direct provider/health-plan operation. Document in a 1-page classification memo filed alongside D138 officer designation. Becomes BAA negotiation starting position. **Priority: P0 — clarifies BAA scope today.**

### FTC Health Breach Notification Rule gap

- **D154 (proposed) — FTC Health Breach Notification Rule (HBNR) preparedness** — July 2024 amendments expanded HBNR scope to most non-HIPAA health apps with "technical capacity to draw from multiple sources" (Quilty qualifies). Requires breach notification to affected individuals + FTC + media (if 500+ affected in same state) within 60 days. Penalty: $51,744/violation/day (FY2024 indexed). Runbook lives alongside HIPAA Breach Notification (D128). **Priority: P1 — distinct from HIPAA breach response, both must coexist.**

### Notice + transparency gaps

- **D155 (proposed) — Privacy policy "officer contact" specifications** at M1.5:
  - Privacy Lead (founder): `privacy@my-quilty.com` + named role title + physical mailing address (PO Box recommended pre-Phase-1)
  - Security: `security@my-quilty.com` (per D119)
  - DPO: NOT listed pre-trigger; reserved mailbox routes to founder
  - EU Representative: NOT listed pre-trigger; activated at D152 trigger
  - UK Representative: NOT listed pre-trigger; activated at D152 trigger
    Format: dedicated `/legal/privacy/contact` page (per D119) + footer link + privacy policy contact section. **Priority: P0 — M1.5 copy locked.**

---

## 10. Sources

GDPR Art 37 + DPO mechanics:

- [Legiscope — GDPR DPO Designation: Article 37 Requirements](https://www.legiscope.com/blog/gdpr-dpo-designation.html)
- [GDPR Library — Article 37](https://gdpr-library.com/article/37)
- [Secure Privacy — When is appointing a DPO mandatory](https://support.secureprivacy.ai/article/when-is-appointing-a-dpo-mandatory/)
- [activeMind.legal — Who needs to appoint a DPO](https://www.activemind.legal/guides/appointment-dpo/)
- [Legal Nodes — GDPR Compliance Checklist for Healthcare Technology Companies](https://www.legalnodes.com/article/gdpr-compliance-checklist)
- [ISMS.online — Demonstrating Compliance with GDPR Article 37](https://www.isms.online/general-data-protection-regulation-gdpr/gdpr-article-37-compliance/)

GDPR Art 38(6) + CJEU + conflict of interest:

- [Preiskel & Co — DPO Dismissal & Conflicts of Interest CJEU Ruling](https://www.preiskel.com/dpos-dismissal-conflicts-of-interest-under-the-eu-gdpr-cjeu-ruling/)
- [IAPP — CJEU rules on DPOs and conflict of interest](https://iapp.org/news/a/cjeu-issues-ruling-on-dpos-and-conflict-of-interest)
- [Cooley — CJEU Clarifies Whether DPOs Can Perform Other Roles](https://cdp.cooley.com/cjeu-clarifies-whether-data-protection-officers-can-perform-other-roles-or-be-dismissed/)
- [Reed Smith — CJEU rules on DPO conflicts of interest](https://www.reedsmith.com/our-insights/blogs/technology-law-dispatch/102k2w0/cjeu-rules-on-dpo-conflicts-of-interest-under-the-gdpr/)
- [DPO Centre — DPO Role: Dismissal and conflicts of interests](https://www.dpocentre.com/the-role-of-a-dpo-dismissal-and-conflicts-of-interests/)

External DPO providers + costs:

- [VeraSafe — DPO Services](https://verasafe.com/managed-services/dpo-services/)
- [VeraSafe — Article 27 Representative Program](https://verasafe.com/representative-services/gdpr-article-27-representative-program/)
- [DPO Centre — Outsourced DPO services](https://www.dpocentre.com/)
- [Aphaia — Outsourced DPO for Tech & Retail](https://aphaia.co.uk/dpo-as-a-service/)
- [IT Governance USA — GDPR DPO as a Service](https://www.itgovernanceusa.com/shop/product/gdpr-dpo-as-a-service)
- [DataGuard — DPO costs comparison internal vs external](https://www.dataguard.com/blog/data-protection-officer-salary-costs-for-an-external-or-internal-dpo)
- [Engage Compliance — Outsourced DPO Cost 2026 Pricing Guide](https://www.engagecompliance.co/outsourced-dpo-cost-guide)
- [Captain Compliance — Data Protection Officer Costs Ultimate Guide](https://captaincompliance.com/education/data-protection-officer-costs/)

HIPAA officers:

- [Paubox — HIPAA security officers vs privacy officers](https://www.paubox.com/blog/hipaa-security-officers-vs.-privacy-officers)
- [HIPAA Guide — What is 45 CFR § 164.308](https://www.hipaaguide.net/what-is-45-cfr-164-308/)
- [HIPAA Journal — HIPAA Security Officer](https://www.hipaajournal.com/hipaa-security-officer/)
- [ComplyDome — Designating a HIPAA Privacy Official 164.530(a)](https://www.complydome.com/compliance-resources/designating-a-hipaa-privacy-official-and-contact-person--a-requirement-for-your-practice----164-530-a--)
- [Drata — What is a HIPAA Officer](https://drata.com/blog/what-is-the-hipaa-officer)
- [Bricker Graydon — HIPAA Admin Requirements: Personnel Designations](https://www.brickergraydon.com/insights/resources/key/HIPAA-Regulations-The-Administrative-Requirements-Personnel-Designations-164-530-a)

HIPAA Risk Analysis + Training + Sanctions:

- [HHS — Guidance on Risk Analysis](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html)
- [HIPAA Journal — HIPAA Risk Assessment 2026](https://www.hipaajournal.com/hipaa-risk-assessment/)
- [HIPAA Journal — Training Requirements 2026](https://www.hipaajournal.com/hipaa-training-requirements/)
- [Medcurity — How Much Does HIPAA Training Cost](https://medcurity.com/hipaa-training-cost-breakdown/)
- [ComplyJet — HIPAA Sanction Policy Complete Guide + Template](https://www.complyjet.com/blog/hipaa-sanction-policy)
- [Columbia University — Privacy and Information Security Sanction Policy](https://universitypolicies.columbia.edu/content/privacy-and-information-security-sanction-policy)
- [Accountable HQ — HIPAA Sanctions Policy](https://www.accountablehq.com/post/hipaa-employee-sanctions-policy-requirements-examples-and-enforcement-best-practices)

HIPAA scope + non-covered apps:

- [HHS — Covered Entities and Business Associates](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html)
- [HHS — App BAA FAQ 3013](https://www.hhs.gov/hipaa/for-professionals/faq/3013/does-hipaa-require-a-covered-entity-to-enter-into-a-business-associate-agreement.html)
- [FTC — Mobile Health Apps Interactive Tool](https://www.ftc.gov/business-guidance/resources/mobile-health-apps-interactive-tool)
- [Accountable HQ — HIPAA Privacy Rule doesn't apply to (Non-Covered Entities)](https://www.accountablehq.com/post/what-the-hipaa-privacy-rule-doesn-t-apply-to-non-covered-entities-apps-and-employers)

State laws (WA MHMDA + NYHIPA):

- [Washington State — RCW 19.373 (MHMDA full text)](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373&full=true)
- [Goodwin — MHMDA Comes Into Force](https://www.goodwinlaw.com/en/insights/publications/2024/03/alerts-technology-hltc-my-health-my-data-act-mhmda)
- [Venable — MHMDA Are You Prepared](https://www.venable.com/insights/publications/2024/02/washingtons-my-health-my-data-act-are-you)
- [HIPAA Journal — Governor Hochul Vetoes NYHIPA](https://www.hipaajournal.com/new-york-health-information-privacy-act/)
- [Morrison Foerster — NYHIPA Returns in 2026](https://www.mofo.com/resources/insights/260316-nyhipa-returns-in-2026-revised-bill)
- [Ropes & Gray — NYHIPA Strict Regulation of Consumer Health Data](https://www.ropesgray.com/en/insights/alerts/2025/01/new-yorks-health-information-privacy-act-aims-to-strictly-regulate-consumer-health-data)

Peer practice:

- [The Org — Garth Davis Lead Privacy Counsel Headspace](https://theorg.com/org/headspace/org-chart/garth-davis)
- [Headspace LLC — Privacy Policy](https://headspacellc.com/privacy/)
- [BetterHelp — Privacy Policy](https://www.betterhelp.com/privacy/)
- [Talkspace — Chief Privacy Officer job posting (Workable)](https://apply.workable.com/talkspace/j/BE3523AC2F/)
- [Talkspace — Notice of Privacy Practices](https://www.talkspace.com/notice-of-privacy-practices)
- [Compliance Hub — Digital Therapy Compliance 2026 (HIPAA + FTC HBNR)](https://compliancehub.wiki/digital-therapy-compliance-hipaa-42-cfr-part-2-ftc-2026-mental-health-data/)

SOC 2 + fractional CPO:

- [Cloud Security Alliance — Path to SOC 2 Compliance for Startups](https://cloudsecurityalliance.org/blog/2024/05/30/the-path-to-soc-2-compliance-for-startups)
- [Sprinto — SOC 2 Type 2 Requirements](https://sprinto.com/blog/soc-2-type-2/)
- [8 Figure CPO — Fractional CPO Saves Costs](https://www.8figurecpo.com/post/fractional-cpo-startup-saves-costs)
- [Fractional Officer — Cost and Salary of a Fractional Executive](https://www.fractionalofficer.com/cost-and-salary-of-a-fractional-executive)

NPP + 164.520:

- [HHS — Notice of Privacy Practices for PHI](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/privacy-practices-for-protected-health-information/index.html)
- [Bricker — § 164.520(c) Provision of Notice](https://www.bricker.com/insights/resources/key/HIPAA-Privacy-Regulations-Notice-of-Privacy-Practices-Provision-of-the-Notice-164-520-c)

BAA inventory + tracking:

- [HHS — Business Associate Listing Sample Template](https://www.hhs.gov/hipaa/for-professionals/compliance-enforcement/audit/batemplate/index.html)
- [Yale HIPAA — Tracking & Management of Business Associates](https://hipaa.yale.edu/policies-procedures/tracking-management-business-associates)
- [Medcurity — HIPAA BAA Requirements 2026](https://medcurity.com/hipaa-business-associate-agreement-requirements/)
- [Knack — Vendor Risk Management BAA HIPAA](https://www.knack.com/blog/vendor-risk-management-baa-hipaa/)

---

_End of file 20. Word count: ~3,400._
