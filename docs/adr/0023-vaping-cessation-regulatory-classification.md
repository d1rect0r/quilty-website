# ADR-0023: Vaping cessation regulatory classification + FDA general-wellness lane + copy discipline

- **Status:** Accepted
- **Date:** 2026-05-28
- **Last reviewed:** 2026-05-28
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** 2026-05-28 thorough multi-agent research pass + 4 user alignment decisions answered same day. Reconciles the "HIPAA-aligned consumer mental-health" framing that pervaded the docs corpus with the actual product (vaping cessation).
- **Related decisions:** D31 (zero PHI in website runtime), D32 (CSP), D35 (server-side ConsentState), D40 (mask-all replay), D42d (CloudWatch zero-PHI), D67 (PHI sanitizer chokepoint), D68 (replay floor), D113 (8-piece form pattern), D148 (PHI-in-error ESLint), **D176** (this ADR's canonical decision)
- **Related ADRs:** [ADR-0005](0005-csp-two-tier.md), [ADR-0024](0024-multi-state-chd-posture.md), [ADR-0025](0025-cessation-data-retention.md), [ADR-0026](0026-pre-ai-feature-compliance.md)
- **Software versions assumed:** Next.js 16, React 19, TypeScript 5.7 strict — this ADR is product/regulatory, not technical

## Context

The docs corpus described Quilty as "HIPAA-aligned consumer mental-health (Quilty)." The actual product is **vaping cessation** — a DTC behavioral cessation app + marketing site that helps adults quit vaping. The framing mismatch is a documented "open risk" from the M1.6/C+D verification report (item #5) and accumulated across 50+ files over 6 months. Doing the reconciliation **now** is cheap (~30 files); deferring to M5+ would cost 10× more once additional docs accumulate.

The 2026-05-28 multi-agent research pass (3 parallel agents, ~75K tokens, mutually reinforcing conclusions) answered three structural questions:

1. **Is "vaping cessation" the right anchor term?** Yes — Cochrane 2025, _Nicotine & Tobacco Research_ 2025 Vol 27 Issue 2, ClinicalTrials.gov 2025-2026 trial titles (Ottawa Model, CONQUER), Truth Initiative's This Is Quitting, American Lung Association's "Quit Don't Switch" all converge on `vaping cessation` for consumer + product surface. Use `ENDS` only when citing FDA/CDC regulatory documents. Use `tobacco and nicotine cessation` only when discussing the broader regulatory landscape (ALA "Kick the Nic," UW-CTRI usage).

2. **Does the architecture still hold under the corrected framing?** Yes — every architectural control (D31 / D32 / D35 / D40 / D67 / D68 / D113 / D148, etc.) is independently justified by at least one of: FTC Health Breach Notification Rule, WA My Health My Data Act, CA CMIA AB-2089/AB-352, MD Online Data Privacy Act, or Phase-1 BAA pathway. **No architectural rollback needed.** The "HIPAA-aligned" framing remains correct — but the _reason_ is now "industry-standard sensitive-health-data discipline applied to a vaping cessation product" rather than "mental-health regulatory posture."

3. **What's Quilty's FDA classification?** The product sits in the **General Wellness, Low Risk Devices** safe harbor under FD&C Act §520(o)(1)(B) (21st Century Cures Act, 2016) and the FDA's revised _General Wellness: Policy for Low Risk Devices_ guidance (Jan 6, 2026, supersedes 2019). The two-factor test: (i) general-wellness intended use, (ii) low risk. The 2026 revision broadens enforcement discretion further. Cessation tracking, habit logs, motivational content, peer community, streak tracking — all general-wellness if framed as lifestyle support.

**The line that matters:** the product flips from "general wellness" (no FDA regulation) to SaMD (Class II, 510(k) pathway) if it claims to **diagnose nicotine use disorder**, **treat or cure addiction**, **substitute for clinical care**, prompt specific clinical actions, or claim **"medical-grade" accuracy**. This is entirely a copy-discipline boundary, not a technical one.

The "do nothing" outcome: positioning ambiguity in docs accumulates; new contributors add references to mental-health peers that don't apply; marketing copy at M2/M4 risks triggering FDA SaMD reclassification through casual use of `treat`/`cure`/`DTx` phrasing; auditors at SOC 2 or BAA review see incoherent docs that contradict the product surface.

## Decision

**Quilty is canonically classified as a DTC vaping cessation app for adults, vape-first with explicit dual-user (vape + cigarette) inclusion, operating in the FDA general-wellness lane (FD&C Act §520(o)(1)(B)), non-prescription, non-DTx, NOT a HIPAA covered entity at Phase 0 — architected as if it were, because the union of FTC HBNR + state CHD laws + Phase-1 B2B BAA pathway imposes HIPAA-equivalent controls.**

### Decision A — Canonical anchor term: `vaping cessation`

**Use everywhere in docs.** Acceptable colloquial swaps: `quit vaping`, `quit-vaping program`. Avoid `vape cessation` (less common in clinical literature).

| Context                                                 | Use                                                                                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Consumer marketing copy                                 | `quit vaping`, `vaping cessation`                                                                                            |
| Product / portal copy                                   | `vaping cessation`, `quit-vaping program`                                                                                    |
| Clinical / scientific docs (ADRs, research notes)       | `vaping cessation` primary; `ENDS cessation` when citing FDA/CDC; `e-cigarette cessation` when matching a cited paper's term |
| Regulatory umbrella (when discussing the broader space) | `tobacco and nicotine cessation` (matches ALA "Kick the Nic" + UW-CTRI usage)                                                |

**Do NOT use `nicotine cessation` alone** — bleeds into NRT-user / pouch / snus framing that conflicts with Quilty's product scope.

### Decision B — Product scope: vape-first, dual-user inclusion

**Anchor identity:** vaping cessation for adults. **Include dual-users** who also smoke cigarettes (~30%+ of vapers per clinical literature). **Reject broader nicotine cessation lane** (that's Pivot's territory; would require hardware/coaching/NRT supply chain Quilty is not building). **Reject substance-use management lane** (Pelago / Quit Genius territory; would require clinical infrastructure).

This positions Quilty as **the modern vape-native cessation product for adults**, distinct from teen-text-programs (This Is Quitting) and broad employer-channel platforms (Pivot, EX Program).

### Decision C — Canonical top-line descriptors

| Surface                                              | Descriptor                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Top-of-file project headers (CLAUDE.md, repo README) | **`HIPAA-aligned consumer vaping cessation product (Quilty)`**                                                        |
| Long-form docs (ADRs, public-facing legal)           | **`DTC vaping cessation app + marketing site; HIPAA-aligned data posture; non-prescription, non-DTx`**                |
| Marketing tagline (one-liner)                        | **`Quilty is an evidence-based vaping cessation program — a coach in your pocket to help you quit vaping for good.`** |

Rationale for keeping "HIPAA-aligned" (vs "HIPAA-compliant" or dropping entirely): industry-standard 2026 term for handling sensitive health data with HIPAA-grade controls without being a covered entity. Confirmed canonical at Health eProfile, Stape.io, A-listware, Wheelhouse DMG, Cardinal Digital Marketing. "Aligned" deliberately avoids the legal-liability surface of "compliant" (which requires audits + BAA chain).

### Decision D — Forbidden marketing terms (build-time lint at M4)

**These terms MUST NOT appear** in any marketing copy, MDX content, page metadata, schema.org descriptions, OG/Twitter cards, or external advertising without an explicit ADR-0023 amendment:

| Term                                       | Reason                                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `digital therapeutic`, `DTx`               | DTx is a regulated category per Digital Therapeutics Alliance; misuse triggers FTC §5 deceptive-claims exposure (cf. FTC accessiBe $1M settlement, April 2025) |
| `prescription`                             | Implies Rx-required; Quilty is OTC general-wellness                                                                                                            |
| `FDA-cleared`                              | Implies 510(k) clearance; Quilty is not a cleared device                                                                                                       |
| `clinically proven` (without RCT citation) | FTC §5 deceptive-claims exposure if unsubstantiated                                                                                                            |
| `medical-grade`                            | Implies device-grade accuracy; flips to SaMD reclassification                                                                                                  |
| `treat`, `cure`, `diagnose`                | Disease-treatment language; flips to SaMD reclassification                                                                                                     |
| `addiction recovery`                       | Implies clinical-addiction-medicine register; sets expectations Quilty won't meet (counselor on staff, MAT, etc.)                                              |
| `wellness app`                             | Too soft; weakens evidence-based positioning + creates regulatory ceiling on therapeutic claims                                                                |
| `quit smoking app`                         | ALA's "Quit Don't Switch" explicitly distinguishes vaping from smoking; using it conflates Quilty with combustible-cigarette apps                              |

**Approved hedged phrasing:** "may help reduce risk," "supports quitting," "evidence-informed," "evidence-based" (when backed by published research — not by clinical efficacy claims). Recommended substitute for "DTx": **"evidence-based digital cessation program"** (matches Quit Genius / 2Morrow language).

### Decision E — People-first user language

| Context                    | Use               | Avoid                                                 |
| -------------------------- | ----------------- | ----------------------------------------------------- |
| Marketing copy             | `you`             | `vapers`, `users`, `addicts`, `patients`, `customers` |
| Product / portal copy      | `members`         | same                                                  |
| Research / compliance docs | `people who vape` | same                                                  |

People-first language is per the _Tobacco Control_ journal 2023 policy + IAPP/health-comms canon.

### Decision F — CTA verb canon

| Tier                               | Verb                          | Notes                                                                                                                                                     |
| ---------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary CTA                        | `quit`                        | ALA, Smoke Free, This Is Quitting all converge here                                                                                                       |
| Secondary CTA (youth-leaning copy) | `ditch`                       | Matches This Is Quitting's `DITCHVAPE` shortcode                                                                                                          |
| Banned                             | `switch`, `cut down`, `taper` | ALA's "Quit Don't Switch" explicitly rejects "switch"; "cut down" and "taper" carry clinical-NRT context; restrict to clinical-methodology citations only |

### Decision G — Voice + tone

**Voice:** coach + friend hybrid — clinical credibility paired with peer warmth. **Reference brand:** Smoke Free's "Love not smoking" identity-first frame. **Reference sub-brand** (for youth-adjacent copy at M3+): This Is Quitting.

### Decision H — Precedent reference rotation (across all existing ADRs + docs)

**KEEP** as FTC enforcement anchors (these are regulatory-precedent citations, not peer references — they apply regardless of product vertical):

- Cerebral $7M (FTC, Apr 2024)
- Monument (FTC, Apr 2024 — closer cessation-adjacent analog; alcohol-use-disorder sibling SUD)
- BetterHelp $7.8M (FTC, Mar 2023)
- GoodRx $1.5M (FTC, Feb 2023)
- Premom $100K + $100K state AGs (FTC + CT/OR/DC, May 2023)
- Hey Favor / Pill Club class action (FullStory co-defendant, cessation-adjacent precedent)

**SWAP** competitor-canon references where peer-product framing matters:

- Talkspace / Lyra / Headspace / Calm → **Pivot Breathe (Pivot Health Technologies) / EX Program (Truth Initiative + Mayo) / 2Morrow Health / Pelago (fka Quit Genius)**

Pivot is the structural twin (HIPAA-aligned, SOC 2, BA-ready, general-wellness app + optional FDA-cleared hardware accessory). Pelago is the model for B2B clinical-service path if Quilty ever adds clinicians + meds (reserve as TW-010 / TW-013 trigger).

### Decision I — Build-time copy-discipline lint at M4

Add a custom `marketing-copy-lint` step to CI that scans MDX content + page route files for the forbidden-term list (Decision D). Lint must run on every PR touching marketing pages and fail the merge if violations exist. Exemption procedure: requires an ADR-0023 amendment + named decision owner — NOT a single-PR override.

## Consequences

### Positive

- **Architectural posture unchanged.** Every existing control (CSP discipline, ConsentState, mask-all replay, PHI sanitizer, etc.) is justified by at least one of HBNR / MHMDA / CMIA / MODPA / Phase-1 BAA — see ADR-0024 for the cross-state CHD compliance map.
- **FDA general-wellness lane locked.** Copy discipline (Decision D) keeps Quilty out of SaMD reclassification, preserving the no-clearance-needed launch path.
- **Single source of truth for framing.** Every future doc, ADR, marketing page, package description references this ADR for anchor terms + forbidden language + peer rotation. Eliminates the drift that produced the original mental-health framing mismatch.
- **B2B/employer pathway preserved without contaminating M7 DTC.** D178 defers B2B billing to first signed contract; this ADR documents the framing such that the eventual B2B addition is additive, not a refactor.

### Negative / Trade-offs

- **Reconciliation pass touches ~30 active doc files** (research reports under `docs/research/` are historical and intentionally left untouched with a top-level pointer). Effort: ~3-4 hours one-time cost.
- **Marketing-copy lint is a build-time gate.** Adds CI surface; lint authors must maintain the forbidden-term list as case law evolves. Mitigation: tie list updates to ADR amendments so the gate has provenance.

### Neutral

- The "HIPAA-aligned" framing reads the same to external observers (legal counsel, BAA partners, SOC 2 auditors); only the _internal rationale_ shifted. External communications don't need rewording beyond peer-rotation (Decision H).

## Activation triggers (cross-references)

- **TW-010** — First B2B contract with SSO requirement → ADR-0026 + this ADR Decision G's Pelago reference becomes load-bearing
- **TW-013** — WorkflowEngine first definition + first B2B claims billing → D178 Phase-1 PHI flow activates; this ADR's "HIPAA-aligned" framing flips to "HIPAA-compliant" once BAAs are signed
- **M4 marketing-copy review gate** — copy-discipline lint goes live; Decision I activates

## Anti-patterns to avoid

- **Casual use of `treat` / `cure` / `medical-grade` in marketing copy** — flips FDA classification to SaMD; requires 510(k) clearance + clinical evidence package
- **"HIPAA-compliant" claim without BAAs + SOC 2** — FTC §5 exposure (the BetterHelp "false seal" pattern)
- **Implying CDC / NCI / Truth Initiative endorsement** — none exists; reference 1-800-QUIT-NOW and smokefree.gov as public resources, not partners
- **Mental-health framing in any new doc** — search this ADR's Decision A table before writing; use the canonical anchor term
- **Talkspace / Lyra / Headspace / Calm as peer references in new docs** — use the cessation peer rotation (Decision H)
- **`vapers` / `users` / `addicts` / `patients` / `customers` as user-language** — people-first only (Decision E)

## References

- FDA _General Wellness: Policy for Low Risk Devices_ (revised Jan 6 2026): <https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices>
- FD&C Act §520(o)(1)(B), 21st Century Cures Act (2016): software-function exclusions
- FDA Step 3 healthy-lifestyle decision aid: <https://www.fda.gov/medical-devices/digital-health-center-excellence/step-3-software-function-intended-maintaining-or-encouraging-healthy-lifestyle>
- Cochrane 2025 — _Interventions for quitting vaping_: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12645533/>
- _Nicotine & Tobacco Research_ 2025 Vol 27(2) — vaping cessation systematic review: <https://academic.oup.com/ntr/article/27/2/169/7717604>
- _Tobacco Control_ people-first language policy (2023): <https://pmc.ncbi.nlm.nih.gov/articles/PMC9985717/>
- American Lung Association — _Quit Don't Switch_ campaign: <https://www.lung.org/quit-smoking/e-cigarettes-vaping/quit-dont-switch>
- Truth Initiative — _This Is Quitting_ / EX Program: <https://truthinitiative.org/research-resources/quitting-smoking-vaping/quitting-e-cigarettes>
- Pivot Breathe (Pivot Health Technologies): <https://pivot.co/>
- Pelago (fka Quit Genius): <https://www.pelagohealth.com/>
- 2Morrow Health: <https://www.2morrowinc.com/2morrow-health>
- Smoke Free app — "Love not smoking": <https://smokefreeapp.com/>
- FTC accessiBe $1M settlement (deceptive-claims precedent for "DTx" misuse): <https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-takes-action-against-accessibe-deceptive-claims>
- Covington Jan 2026 alert on revised general-wellness guidance: <https://www.cov.com/en/news-and-insights/insights/2026/01/fda-issues-revised-guidance-on-general-wellness-products>
