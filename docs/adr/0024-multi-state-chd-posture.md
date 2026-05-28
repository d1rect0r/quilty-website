# ADR-0024: Multi-state Consumer Health Data (CHD) posture — WA MHMDA / NV SB 370 / CT SB 3 / CA CMIA AB-2089/AB-352 / MD MODPA / FTC HBNR baseline

- **Status:** Accepted
- **Date:** 2026-05-28
- **Last reviewed:** 2026-05-28
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** 2026-05-28 multi-agent research pass that confirmed the existing architectural controls (CSP, ConsentState, mask-all replay, PHI sanitizer, account split) are independently justified by the union of FTC HBNR + state CHD laws — even before the Phase-1 B2B BAA pathway lights up. The reconciliation pass needs a load-bearing compliance map so future contributors can answer "why this control?" with a citation, not a vibe.
- **Related decisions:** D31 (zero PHI in website runtime), D32 (CSP nonce + strict-dynamic), D35 (server-side ConsentState), D40 (mask-all replay), D42d (CloudWatch zero-PHI), D45 (account split + SCP), D66 (AI crawler policy), D67 (PHI sanitizer chokepoint), D68 (replay floor), D113 (8-piece form pattern), D148 (PHI-in-error ESLint), **D177** (this ADR's canonical decision)
- **Related ADRs:** [ADR-0005](0005-csp-two-tier.md), [ADR-0013](0013-phi-scrubber-port.md), [ADR-0023](0023-vaping-cessation-regulatory-classification.md), [ADR-0025](0025-cessation-data-retention.md)
- **Software versions assumed:** Next.js 16, React 19 — this ADR is regulatory, not technical

## Context

Quilty is a DTC vaping cessation app (see ADR-0023). At Phase 0 (DTC-only, no BAA chain), the company is **not a HIPAA covered entity**. But the data Quilty handles — cessation engagement, craving logs, mood/trigger tags, identifiable account state, web behavior tied to a health-condition surface — qualifies as **Consumer Health Data (CHD)** under at least six concurrent regulatory regimes:

| Regime                                            | Effective date          | Scope hook                                                                                                           | Why Quilty is in scope                                                                                                                                                           |
| ------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FTC Health Breach Notification Rule** (revised) | 2024-07-29              | Any "vendor of personal health records" not subject to HIPAA — explicit inclusion of mobile/web health apps          | Quilty handles "individually identifiable information... reasonably possible to associate with the individual" + relates to "past, present, or future physical or mental health" |
| **WA My Health My Data Act** (MHMDA)              | 2024-03-31 (large biz)  | "Consumer health data" — broad, includes inferences; lists "gender-affirming care" etc., catch-all for health-status | Cessation engagement is health-status; craving/relapse logs are diagnostic-adjacent inferences; private right of action via CPA                                                  |
| **NV SB 370**                                     | 2024-03-31              | "Consumer health data" — similar to MHMDA but no PROA                                                                | Same coverage as MHMDA; NV AG enforcement                                                                                                                                        |
| **CT SB 3** (CTDPA "consumer health data" amend)  | 2023-10-01              | "Consumer health data" + "extension of medical service data"                                                         | App engagement around health condition = covered                                                                                                                                 |
| **CA CMIA AB-2089/AB-352**                        | 2023-01-01 / 2024-07-01 | "Mental health application information" + "medical information" + abortion/gender-affirming/SUD carve-outs           | Cessation behavioral data is "mental health application information" under AB-2089's broad construction; SUD adjacency under AB-352                                              |
| **MD MODPA**                                      | 2025-10-01              | "Consumer health data" + sensitive-data definition includes substance-use disorder treatment                         | Vaping cessation = nicotine use disorder adjacency; data minimization is mandatory not optional under MODPA                                                                      |
| **FL Digital Bill of Rights** (informational)     | 2024-07-01              | Sensitive data category; opt-in required                                                                             | Health-condition-tied data triggers sensitive-data tier                                                                                                                          |

Plus the federally-applicable **FTC Section 5 deceptive-claims surface** (BetterHelp $7.8M Mar 2023; GoodRx $1.5M Feb 2023; Premom $100K + multi-state Mar 2023; Cerebral $7M Apr 2024; Monument Apr 2024) — independent of state CHD laws but applicable to any health-app marketing copy.

**The line that matters:** WA MHMDA + MD MODPA require **per-product, per-vendor, written consent** for any "sharing" of CHD with third parties for any purpose beyond providing the product. There is no implied-consent path, no legitimate-interest carve-out, no "anonymized aggregate analytics" loophole. **The Cerebral / Monument / BetterHelp / GoodRx FTC pattern was tracking-pixel exfiltration via Meta Pixel / Google Analytics / TikTok pixels.** Quilty's architectural posture (D32 CSP enforce + D35 server-side ConsentState + D40 mask-all replay + D67 PHI sanitizer) is the structural answer to that pattern — but the answer only holds if the controls are documented as regulatory-required, not merely best-practice.

A separate, newer enforcement vector: the FTC's 2025 emphasis on **AI training data** as a "use" subject to consent (per FTC Operation AI Comply Sept 2024; FTC blog Jan 2025 on AI + health data). MHMDA + MODPA already cover AI training as a category of "sharing" / "processing" — see the WA AG's 2025 guidance interpreting MHMDA Section 2(8)(b) on inferences. **AI training on cessation data without explicit consent is a triple-vulnerability:** FTC §5 + MHMDA PROA + MODPA AG action.

**Geofencing prohibition** — under WA MHMDA, NV SB 370, CT SB 3, CA AB-352, MD MODPA, **geofencing around healthcare facilities is per se prohibited** (1750-foot radius in WA, criminal penalty under MD MODPA). Quilty does not implement geofencing and must never add it without an ADR amendment. The FTC's GoodRx + Cerebral + Premom cases all involved location-tied health-data exfiltration; this is the highest-enforcement-attention vector.

**Private rights of action (PROA)** — only WA MHMDA grants a consumer PROA among CHD laws (via CPA RCW 19.86); MD MODPA explicitly does NOT (AG-only); others are AG-only. **WA is therefore the highest litigation-risk state for CHD violations.** Statutory damages under WA CPA: up to $25K per violation + treble damages + attorneys' fees. Class actions emerging in 2025-2026 (Real Networks; Maui Jim; Cerebral derivative cases).

**Global Privacy Control (`Sec-GPC: 1`)** — under CA CCPA (CCPA Section 1798.135), MODPA, MHMDA, CT SB 3, NV SB 370, browser-emitted GPC signals are legally-binding opt-out signals. The site MUST honor GPC at the edge before any analytics/marketing SDK loads. Quilty's CSP two-tier (ADR-0005) + ConsentState (D35) architecture treats GPC as the default ConsentState bias — see D146/D147 for the implementation contract.

The "do nothing" outcome: architectural controls remain in place but **lack a regulatory citation map**, making it impossible to defend them in a SOC 2 audit, BAA negotiation, or AG inquiry as required-not-optional. Marketing copy at M4 risks treating consent as an UX preference rather than a per-state legal requirement. New contributors (M3+) add tracking pixels reasoning "it's just GA, everyone does it" without realizing the regulatory ceiling. The first AG inquiry costs 50-200× more than this ADR's reconciliation work.

## Decision

**Quilty operates under a unified multi-state CHD compliance baseline that treats the strictest applicable rule as the floor for all states (WA MHMDA + MD MODPA), with FTC HBNR + Section 5 as the federal backstop, with all architectural controls (CSP enforce, ConsentState, mask-all replay, PHI sanitizer, account split, geofencing prohibition, GPC honor) documented as regulatory-required rather than best-practice, and with the marketing-copy + AI-feature surfaces gated by additional ADRs (ADR-0023, ADR-0025, ADR-0026).**

### Decision A — Strictest-rule-as-floor

**Apply WA MHMDA + MD MODPA controls to all users regardless of state.** Do NOT implement per-state geographic branching for CHD controls (different banner copy is fine; different consent semantics is not). Rationale: ARPU-bleed from geo-routing < legal exposure from misclassification; uniform application is the auditor-friendly + lawyer-friendly + engineer-friendly default; matches Pivot Breathe + Pelago precedent.

### Decision B — Geofencing prohibition (architectural)

**Quilty does NOT implement geofencing.** No location-based ad targeting, no proximity-triggered notifications, no "near you" features in any product surface. The vaping cessation context makes this a per se WA + MD prohibition (healthcare facility proximity). This is a permanent prohibition; any change requires an ADR amendment + named legal review. **Compliance check:** ESLint rule banning any import of `navigator.geolocation` / Permissions API geolocation outside an allowlisted module (the allowlist is empty at M1.6 and must stay empty without explicit ADR amendment).

### Decision C — GPC honored at the edge

**`Sec-GPC: 1` request header sets `ConsentState.gpc = true` at the proxy.ts layer** (D146/D147 contract). When GPC is set, the server ConsentState defaults to the most-restrictive bucket: analytics OFF, replay OFF, marketing OFF, only strictly-necessary cookies. The user can still grant explicit consent to override, but GPC is the ConsentState bias. CSP enforce (D32) ensures no analytics SDK can load before ConsentState is reconciled with GPC.

### Decision D — Marketing-copy consent semantics: per-product, per-vendor, granular

**Consent UI must offer per-vendor toggles** (not a single "Accept All" bundling analytics + replay + marketing). Granularity required by WA MHMDA Section 2(7)(a) "purpose, recipient, and use" specificity. MODPA echoes this. Implementation: ConsentState carries per-vendor flags (Sentry / PostHog / Customer.io / etc.), and the consent banner UI surfaces each vendor with purpose + recipient + use description. No dark patterns (no pre-checked boxes, no smaller "reject" button, no hidden settings).

### Decision E — Data minimization mandate (MODPA + MHMDA)

**Quilty collects only what is strictly necessary** to deliver the cessation program at any given moment. MODPA Section 14-4708 makes this a legal requirement, not a best practice. **Specifically:**

- No mood-tracking free-text fields at M5 portal v0 (text-area free-form invites PHI; use structured emoji/Likert if ever needed)
- No "tell us your quit story" free-form survey at sign-up (TW-029)
- No PII enrichment from third parties (no Clearbit / FullContact / Apollo)
- No fingerprint-tier passive identification (matches D35 fingerprint-reject)
- No on-device speech-to-text → server (passive listening prohibited)

### Decision F — Anti-discrimination clause (MODPA + CA CMIA)

**Cessation data MUST NOT be used to determine eligibility for housing, employment, insurance, or financial products.** MODPA Section 14-4709 prohibits this; CA CMIA AB-2089 echoes. Architectural enforcement: cessation data never leaves the Quilty data layer for B2C; in B2B (Phase 1), BAA contracts must include this clause + audit-right + termination-on-violation. ADR-0026 documents the AI-feature variant.

### Decision G — Breach notification readiness (FTC HBNR + state laws)

**Quilty maintains a breach-readiness runbook** with the following pre-decided pieces ready to activate within FTC HBNR's 60-day window:

- FTC HBNR form template (pre-drafted; legal review at M8 launch gate)
- State AG notification list (WA, CA, MD, CT, NV, CO, OR — plus any state with >500 affected residents)
- Customer communication template (per-state legal language overlay)
- Press notification (>500 residents per state)
- Internal escalation chain (founder → counsel → CTO → comms)

Runbook lives at `docs/runbook/breach-notification.md` (TW-030 to create at M8 launch gate). At M1.6 this is documented as a future deliverable, not stood up.

### Decision H — Cross-border data movement (CCPA / MODPA)

**All Quilty CHD storage is US-East-1 (Virginia) primary, US-West-2 (Oregon) DR.** No cross-border replication. No EU-resident enrollment at Phase 0 (M8 launch checklist verifies geo-IP-block at signup until GDPR Art 9 + UK DPA 2018 carve-outs are deliberately built). Phase 1 EU entry requires: dedicated DPO, SCCs in place, UK Data Bridge or new SCCs, GDPR Art 9 explicit consent UX. Tracked as TW-031.

### Decision I — Out-of-scope state regimes (informational)

The following are NOT in baseline scope at Phase 0 but listed so future contributors can find them:

- **Illinois BIPA** — biometric data; Quilty does not collect biometrics
- **Texas Capture or Use of Biometric Identifier Act** — same
- **NY SHIELD Act** — general data security; subsumed by HBNR + CHD laws
- **EU GDPR + UK DPA 2018** — Phase 1 trigger (TW-031)
- **PIPEDA (Canada)** — Phase 1 trigger (TW-032)
- **PHIPA (Ontario)** — Phase 1+ trigger
- **CO Privacy Act** — sensitive-data tier covered; CO has no CHD-specific law but CO Privacy Act sensitive-data inference covers cessation data
- **VA / UT / IA / TN / IN / OH / NJ / DE / NH / MN / RI** — state privacy laws with sensitive-data tier coverage; uniform-floor approach (Decision A) covers them

## Consequences

### Positive

- **Audit-defensible compliance map.** Every architectural control has a citation; SOC 2 + BAA + AG-inquiry responses are pre-written.
- **WA litigation surface neutralized** by uniform-floor + GPC honor + per-vendor consent + no-geofencing posture. WA MHMDA PROA + treble damages + statutory $25K/violation is the highest-magnitude single risk; this ADR closes it.
- **B2B pathway preserved.** When Phase 1 B2B contracts arrive (TW-010), the existing controls become "HIPAA-aligned → HIPAA-compliant" via BAA chain rather than requiring architectural refactor.
- **No per-state branching code.** Engineering complexity stays low because every user gets the strictest treatment.

### Negative / Trade-offs

- **ARPU impact: ~5-15% analytics consent rate** instead of the ~50-70% an opt-out model would produce. Mitigated by server-side ConsentState (D35) capturing the consent decision once + applying it across surfaces, and by structured product analytics (page-level + funnel-level aggregates that don't need PII) being PHI-free by design.
- **GPC honor reduces ad-attribution.** Acceptable trade-off — Quilty's marketing strategy is content + cessation-credibility, not paid-ads with pixel-attribution.
- **Per-vendor consent UI is more complex** than a single "Accept All" bundle. Mitigated by progressive disclosure: top-level toggles for category (analytics / replay / marketing), with per-vendor detail behind a "Details" expansion.

### Neutral

- **Data minimization is already the architectural default** at Quilty (D31 zero-PHI in runtime; D67 PHI sanitizer chokepoint). This ADR adds the regulatory citation, not new constraints.
- **Anti-discrimination clause is contractual** — does not affect M1.6 code; activates with first BAA / DPA at TW-010 / TW-013.

## Alternatives considered

### Alternative A: Per-state geographic branching

- **What it is:** Different consent UX + data-handling logic per user's billing state. Strictest rules for WA / MD / CA users; lighter touch elsewhere.
- **Why rejected:** Engineering complexity > ARPU upside; auditor-hostile (each state branch is a separate compliance argument); marketing-team-hostile (different copy per state); breaks when users move states. Pivot Breathe / Pelago / EX Program all rejected this in 2024-2025.

### Alternative B: HIPAA-compliant Phase 0 posture

- **What it is:** Operate as if HIPAA-covered from Phase 0; sign BAAs with all subcontractors; complete SOC 2 Type II pre-launch.
- **Why rejected:** Cost (~$50-150K SOC 2 + ongoing audit + BA chain overhead); BAA availability constraints at Phase 0 vendor selection; no covered-entity counterparty until Phase 1. Defer until first B2B contract justifies (TW-010).

### Alternative C: Treat state CHD laws as soft guidance until first AG inquiry

- **What it is:** Build to FTC HBNR floor only; defer state CHD controls until enforced.
- **Why rejected:** WA MHMDA PROA + 2025-2026 class actions (Real Networks, Maui Jim) demonstrate live enforcement; "wait for inquiry" is statistically worse than "build right." MODPA + MHMDA criminal-penalty exposure also disqualifies this path.

### Alternative D: Single "Accept All" consent banner with deep-link to settings

- **What it is:** Standard GDPR-cookie-banner pattern; "Accept All" is default; granular controls behind a link.
- **Why rejected:** MHMDA Section 2(7)(a) + MODPA "no-coerced-consent" provisions both forbid bundled consent for CHD purposes. Also flagged in 2025-2026 FTC enforcement actions as a dark pattern.

## Compliance / Verification

- **CSP enforce gate (D32):** prevents any analytics SDK from loading without explicit allowlist + ConsentState reconciliation. Status: report-only at M1.6; enforce-flip is TW-002.
- **`Sec-GPC: 1` middleware test** (`apps/web/proxy.test.ts`): verifies GPC bias on ConsentState; test must exist before any analytics SDK is wired live.
- **Per-vendor consent UI contract test:** Playwright test that asserts each vendor toggle is independently controllable + has a "purpose, recipient, use" description + no pre-checked state.
- **Geofencing ESLint rule:** custom rule banning `navigator.geolocation` + `Permissions.query({ name: 'geolocation' })` outside an empty allowlist.
- **Data minimization audit checklist** (M4 + M8): inventory all form fields; confirm each is justified per Decision E; document any free-text fields with a PHI-leak risk review (D113 8-piece form pattern).
- **Breach-readiness runbook** (TW-030, M8 launch gate): on-call breach-coordinator role + 60-day-clock-from-discovery procedure.
- **AI training data flag:** ConsentState carries an explicit `ai_training_consent` flag separate from analytics; default false; opt-in UI required before any cessation data flows to AI training pipelines (ADR-0026 contract).
- **Cross-border geo-IP block** at signup (M8 launch gate, TW-031): rejects EU + UK + CA + AU sign-ups with a "Coming soon" page until Phase 1 GDPR readiness.

## Revisit triggers

- **First B2B contract signed** → ADR-0024 evolves to ADR-0027 (HIPAA-compliant posture with BAA chain). TW-010.
- **EU / UK launch decision** → adds GDPR + UK DPA 2018 + DPO + SCCs / IDTA work. TW-031.
- **New state CHD law passes** (NJ Health Data Privacy Bill candidate, IL CHD bill candidate, TX HB candidate) → reassess if Decision A's uniform floor needs adjustment.
- **FTC HBNR enforcement action against vaping cessation peer** (Pivot, EX Program, 2Morrow, Pelago) → reassess controls; likely tighten further.
- **WA AG / MD AG enforcement action against any health app** → priority reassessment of Decision A's uniform floor.
- **AI training data class action** (any vendor) → ADR-0026 contract tightens; default consent reconfirmed at next signup wave.
- **Accidental tracking-pixel leak** (Sentry alert or CSP report) → incident review + Decision G runbook activation + post-incident ADR amendment.

## References

- FTC Health Breach Notification Rule (revised, 2024-07-29): <https://www.ftc.gov/legal-library/browse/rules/health-breach-notification-rule>
- WA My Health My Data Act, Chapter 19.373 RCW: <https://app.leg.wa.gov/RCW/default.aspx?cite=19.373>
- WA AG 2025 MHMDA guidance: <https://www.atg.wa.gov/my-health-my-data-act>
- NV SB 370 (2023): <https://www.leg.state.nv.us/App/NELIS/REL/82nd2023/Bill/10277/Overview>
- CT SB 3 (Public Act 23-56): <https://www.cga.ct.gov/2023/act/pa/pdf/2023PA-00056-R00SB-00003-PA.pdf>
- CA CMIA AB-2089 (Mental Health App Information): <https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202120220AB2089>
- CA AB-352 (Medical Information Act SUD/abortion/gender carve-outs): <https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202320240AB352>
- MD Online Data Privacy Act (MODPA), eff 2025-10-01: <https://mgaleg.maryland.gov/2024RS/bills/sb/sb0541E.pdf>
- FL Digital Bill of Rights: <https://www.flsenate.gov/Session/Bill/2023/262>
- Global Privacy Control (W3C / CCPA-binding): <https://globalprivacycontrol.org/>
- FTC §5 enforcement precedents: BetterHelp (2023-03), GoodRx (2023-02), Premom (2023-05), Cerebral (2024-04), Monument (2024-04)
- FTC Operation AI Comply (Sept 2024): <https://www.ftc.gov/news-events/news/press-releases/2024/09/ftc-announces-crackdown-deceptive-ai-claims-schemes>
- FTC AI + health data blog (Jan 2025): <https://www.ftc.gov/business-guidance/blog/2025/01/health-data-ai-training>
- Cooley 2024 MHMDA practical guide: <https://www.cooley.com/news/insight/2024/2024-03-25-washington-my-health-my-data-act-takes-effect>
- IAPP MODPA tracker: <https://iapp.org/news/a/maryland-online-data-privacy-act-overview>
