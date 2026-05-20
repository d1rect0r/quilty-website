# Round 6 Foundation Audit — Consumer Mental-Health Architecture Recon

**Date:** 2026-05-19
**Scope:** 13-company peer-set scan of consumer mental-health + wellness + HIPAA-adjacent architectures, with focus on whether hexagonal-per-package (D76) is the right shape for Quilty's website tier.
**Method:** Engineering blog scrapes, public job-posting archaeology, FTC/DOJ filings, Glassdoor/Wellfound stack listings, incident post-mortems, Himalayas.app + StackShare tech-stack profiles. 2024–2026 sources only.
**Status:** Evidence-grade — strong on incident archaeology + hiring signals; thin on Cerebral/Calm/Mindbloom internal architecture (these companies publish almost nothing).

---

## 1. Executive Summary

The consumer-mental-health peer set **does NOT converge on hexagonal architecture as a public, named pattern.** Engineering blogs, conference talks, and post-mortems from Headspace, Calm, BetterHelp, Talkspace, Cerebral, Mindbloom, Maven, Hinge Health, and Wysa are silent on whether they use ports + adapters, clean architecture, or modular monolith naming. What is observable:

1. **The stacks themselves are polyglot, vendor-heavy, and AWS-dominant.** Headspace ships TypeScript + Node.js + Next.js + React + Java/Spring + Go + Kotlin/Swift on AWS — i.e., a multi-team modular system where _someone_ is drawing boundaries, but the boundaries aren't publicly named. Hinge Health is the most architecturally legible peer (Golang + gRPC + NestJS + React Native + Postgres, trunk-based CI/CD, HIPAA + HITRUST + SOC2) and the NestJS choice is itself a strong tell — NestJS ships hexagonal-friendly modules + DI containers + interface-as-port idioms out of the box.
2. **The incident pattern is unambiguously about adapter-boundary failure.** Cerebral ($7M FTC, 2024), Monument ($2.5M FTC, 2024), BetterHelp ($7.8M FTC, 2023), GoodRx ($25M, 2023), and Premom all share the **same** architectural anti-pattern: third-party tracking pixels (Meta, Google, TikTok, LinkedIn, Snapchat) loaded directly into pages handling sensitive intake data, with no central choke point and no `assertNoPHI` discipline. **Every one of these settlements is a textbook argument for the D76 + D78 pattern** — interface gate at the vendor boundary so a "marketing team added a pixel" event is impossible without crossing an enforced port.
3. **Talkspace + 23andMe failures are about data-model + segmentation choices**, not architectural pattern choices. Talkspace's 140M-message data lake is a governance + retention failure (the right architecture wouldn't have saved them); 23andMe's DNA Relatives feature was a deliberate cross-account graph that amplified credential stuffing.
4. **For Quilty's scale (small team, pre-launch, HIPAA-adjacent), the consumer-mental-health peer set provides no direct precedent for hexagonal-per-package at M1.5.** The closest precedent is Hinge Health's NestJS choice; the strongest _reason_ is FTC enforcement liability that lives entirely at the adapter boundary.

**Verdict for D76:** **GO with one consumer-health-specific tweak** — frame the adapter boundary as the **compliance choke point** (D78), not as architectural purism. Hexagonal per package isn't dogma; it's the cheapest, most auditable way to make "the Cerebral $7M / Monument / BetterHelp event" architecturally impossible.

---

## 2. Per-Company Findings

### 2.1 Headspace (incl. ex-Ginger / Headspace Health)

**Public architecture indicators:** Headspace job postings on Greenhouse/Wellfound, Himalayas.app stack profile, 2021 merger reporting, late-2024 layoff announcement.

**Stack (from 2025 Software Engineer, Full Stack — B2B Team posting + Himalayas.app):**

- TypeScript + Node.js on AWS (primary)
- React + Next.js + Redux + Emotion (web)
- Java + Spring Boot (legacy backend services)
- Go (systems / infrastructure)
- Kotlin (Android) + Swift / Objective-C + RxSwift (iOS)
- AWS EC2, S3, CloudFront, ELB, Route 53 + Cloudflare CDN
- Snowflake + Redshift (data warehouse)
- **Amplitude + Optimizely + Google Analytics + Google Tag Manager + Sentry** (observability + product analytics)
- Salesforce + HubSpot + Braze (CRM + marketing)
- PayPal + Zuora (payments / subscription billing)

**HIPAA architecture pattern:** Headspace Health was the result of a 2021 merger with Ginger.io (clinical telehealth). Two distinct compliance postures: Headspace consumer = wellness (NOT HIPAA-scoped by default); Ginger / Headspace Care = covered entity / clinical. The merger forced a multi-tenant boundary problem — same brand, two compliance scopes. Late-2024 layoffs + transition of staff therapists to part-time suggest the clinical surface is being narrowed.

**Architectural pattern (inferred):** Polyglot microservices on AWS with team-aligned ownership (B2B Team, Care Team, Content Team, Mobile). The TS/Node + Next.js stack is the marketing + portal tier; Java/Spring is the legacy services tier; Go shows up in infrastructure. No public statement of hexagonal or ports/adapters. **Inference: per-service architectural decisions, not enterprise-wide pattern.**

**Strength of evidence:** 4/5 on stack; 1/5 on internal architecture pattern.

**Relevance to Quilty:** Direct precedent for TS + Node + Next.js + React on AWS in a HIPAA-adjacent context. The vendor stack — Amplitude, Sentry, Braze, Zuora, multiple analytics SDKs — is exactly the surface area Quilty's D77 + D78 adapter pattern needs to gate.

**Sources:**

- [Software Engineer, Full Stack @ Headspace (Spectrum Equity Job Board, 2025)](https://careers.spectrumequity.com/companies/headspace/jobs/51686941-software-engineer-full-stack)
- [Headspace Tech Stack — Himalayas.app](https://himalayas.app/companies/headspace/tech-stack)
- [Headspace + Ginger merger (TechCrunch, 2021)](https://techcrunch.com/2021/08/25/headspace-and-ginger-are-merging-to-form-headspace-health/)
- [Headspace 13% workforce reduction (Behavioral Health Business, Nov 2024)](https://bhbusiness.com/2024/11/20/headspace-axes-13-of-workforce-transition-therapist-network-to-part-time-and-contract-roles/)

---

### 2.2 Calm

**Public architecture indicators:** Himalayas.app + StackShare profiles exist but are skeletal. Built In NYC job listings. No engineering blog. No conference talks indexed for 2024–2026.

**Stack (partial, from public job posts + product surface):**

- Web portal at `app.calm.com` (authenticated, returns 403 anonymous — confirms server-rendered or BFF-protected, not pure SPA)
- iOS + Android native apps (Swift + Kotlin)
- AWS infrastructure (HIPAA-eligible plane, per their workplace + healthcare product line claiming HIPAA-compliant resources)
- Marketing pricing exposed publicly; subscription self-service on web AND app (unusual — most peers force IAP back to App Store / Play)

**HIPAA architecture pattern:** Calm's consumer product is wellness (NOT HIPAA). Their **Calm Health** B2B product line (workplace + healthcare partnerships) is the HIPAA-scoped surface — separated as a distinct product, suggesting a tenant-isolation pattern.

**Architectural pattern:** Unobservable. Calm publishes essentially nothing about internal architecture. The product-surface signal — separate B2B HIPAA SKU — is consistent with the Quilty Phase 1 plan of moving the website to a `marketing-prod` account outside the BAA OU.

**Strength of evidence:** 2/5 on stack; 1/5 on architecture.

**Relevance to Quilty:** Reinforces the "consumer brand = wellness scope; clinical surface in separate compliance boundary" pattern that D31 + Phase 1 already enshrine.

**Sources:**

- [Calm Tech Stack — Himalayas.app](https://himalayas.app/companies/calm/tech-stack)
- [Calm Tech Stack — StackShare](https://stackshare.io/calm/calm)
- [Full Stack Engineer — Calm (BuiltIn NYC)](https://www.builtinnyc.com/job/full-stack-engineer/262150)

---

### 2.3 BetterHelp

**Public architecture indicators:** Almost none on engineering. FTC settlement filings + privacy policy are the load-bearing public artifacts.

**Stack (inferred):** Web product portal — therapy chat, scheduling, journaling, worksheets. Custom build, not visibly Stripe-portal-shaped. Parent company is Teladoc Health (publicly traded), which adds enterprise complexity.

**HIPAA architecture pattern + lesson:** BetterHelp's $7.8M FTC settlement (March 2023) is the prototype Cerebral-style case: 7M users' email addresses, IP addresses, and health questionnaire data shared with Facebook, Snapchat, Criteo, and Pinterest for advertising. They were certified by HITRUST and made HIPAA claims — the FTC found those claims were **policy without implementation matching**. Settlement: $7.8M penalty + order to delete data + ban on sharing health data with third parties for marketing + express opt-in consent required for any future cookie ID / IP sharing (far beyond standard legal requirements).

**Architectural lesson:** HITRUST certification did not protect them. The certification audits documentation; the FTC audited runtime behavior. **D78 (ESLint adapter chokepoint) is the runtime gate that documentation can't provide.**

**Strength of evidence:** 1/5 on architecture; 5/5 on the architectural anti-pattern lesson.

**Relevance to Quilty:** D31 ("zero PHI in website runtime") + D35 (ConsentState single source of truth) + D78 (adapter chokepoint) are the codified inverse of BetterHelp's failure. The takeaway is that the chokepoint must be **mechanical** (ESLint + a Sanitizer port + `assertNoPHI`), not contractual (privacy policy + third-party SLA).

**Sources:**

- [FTC v. BetterHelp settlement (2023)](https://www.ftc.gov/business-guidance/blog/2023/03/ftc-says-online-counseling-service-betterhelp-pushed-people-handing-over-health-information)
- [Is BetterHelp HIPAA Compliant (Accountable HQ, 2024)](https://www.accountablehq.com/post/is-betterhelp-hipaa-compliant-privacy-security-and-data-sharing-explained)
- [Digital Therapy Compliance in 2026 (ComplianceHub.Wiki)](https://compliancehub.wiki/digital-therapy-compliance-hipaa-42-cfr-part-2-ftc-2026-mental-health-data/)

---

### 2.4 Talkspace

**Public architecture indicators:** 2025 Proof News / Annie Gilbertson reporting on the Kamrass case + court-ordered transcript disclosure. Mozilla Foundation Privacy Not Included assessment.

**Stack:** Multiple subdomains visible — `app.talkspace.com` (product), `match.talkspace.com` (intake). Modal-gated login. Custom build, not Stripe-portal. Insurer-payor-mix complexity drives architectural surface area (7+ insurer pages).

**HIPAA architecture pattern + lesson:** **NOT a breach. NOT a security failure. A governance + retention failure.** Talkspace has "one of the largest mental health data banks in the world" — 140M message exchanges, used to train an AI therapy bot. Court-ordered disclosure in the Kamrass case forced production of every word a user had typed to her therapist (during pregnancy discrimination + financial pressure). The architecture was working as designed.

**Mozilla 2024 finding:** Talkspace's privacy posture has **degraded** since 2022. Deletion rights now only documented for California, EU, EEA, UK residents (was previously universal). Earned all three Mozilla "privacy dings" in 2024.

**Architectural lesson:** **Architecture cannot save you from a bad retention policy.** Ports + adapters won't unwrite 140M messages. The corollary: **the architecture must make data minimization the path of least resistance.** A `MessageStore` port with TTL + retention-policy adapter is the closest architectural-pattern equivalent.

**Strength of evidence:** 5/5 on the governance lesson; 0/5 on internal architecture pattern.

**Relevance to Quilty:** Quilty's website tier never holds PHI by design (D31). The Talkspace lesson is mostly about the Rust backend retention model, not the website. But the website _is_ the surface where marketing claims about confidentiality are made, and the FTC + state AGs will compare those claims to runtime — so a `ConsentState` port that emits to a typed audit log (already planned in D67) is the website-tier analog.

**Sources:**

- [The Talkspace Case (Captain Compliance, 2025)](https://captaincompliance.com/education/140-million-messages-and-a-court-order-what-the-talkspace-case-reveals-about-the-architecture-of-mental-health-privacy/)
- [Talkspace privacy assessment (Mozilla Privacy Not Included, 2024)](https://www.mozillafoundation.org/en/privacynotincluded/talkspace/)
- [Talkspace therapy transcripts in court (MyPrivacy.Blog, 2025)](https://myprivacy.blog/talkspace-therapy-transcripts-court-ai-training/)

---

### 2.5 Cerebral

**Public architecture indicators:** FTC complaint (April 2024) is the primary public source. Cerebral publishes nothing about engineering.

**Stack (inferred from FTC complaint):** Web + mobile product handling psychiatric intake, prescription history, insurance, addresses. Used Single Sign-On for patient portal (FTC flagged as "insecure").

**HIPAA architecture pattern + lesson — THE CASE FOR D76 + D78:**

Cerebral integrated tracking pixels from **Meta, Google, TikTok, LinkedIn, Snapchat** into its website + app from October 2019 through 2023. FTC complaint alleges:

- **3.2 million consumers' personal information** (names, prescription histories, home + email addresses, IP addresses, health insurance information) was sent to third-party advertising platforms.
- Cerebral made privacy claims ("100% confidential", "HIPAA compliant") that were contradicted by runtime behavior.
- Multiple **additional architectural failures** beyond pixels:
  - Failure to revoke access of former employees to patient records.
  - Lack of segregation between healthcare providers (any provider could access any record).
  - Insecure SSO method for patient portal.
  - No least-privilege for employee access.

Settlement: $7M (effectively — $5.1M refunds + $2M civil penalty in lieu of $10M; full $10M suspended for inability to pay). First-of-its-kind FTC restriction on use/disclosure of sensitive consumer data. Cancellation flow re-architected (FTC required a "simple way to cancel").

**Architectural lesson:** Cerebral is the canonical case for **mechanical adapter gating** — a single ESLint rule banning `gtag`, `fbq`, `ttq`, `_linkedin_partner_id`, `snaptr` outside a `MarketingAnalytics` adapter would have made this settlement structurally impossible. The pixels were embedded over 4 years. There was no single chokepoint to audit. **This is the D78 use case verbatim.**

**Strength of evidence:** 5/5 on the architectural lesson; 1/5 on internal architecture (we don't know what they had, but we know what they didn't have).

**Relevance to Quilty:** Direct precedent. D31, D35, D67, D77, D78 all trace back to Cerebral + Monument as the case-study lesson. The Round 6 audit is right to lock this in.

**Sources:**

- [FTC v. Cerebral $7M settlement (Healthcare Dive, 2024)](https://www.healthcaredive.com/news/cerebral-federal-trade-commission-7-million-fine-data-sharing-privacy/713295/)
- [Cerebral $7M settlement (Daily Security Review, 2024)](https://dailysecurityreview.com/security-spotlight/cerebral-settles-suit-at-7-million-in-facebook-pixel-data-leak-case/)
- [Cerebral / Markup analysis (April 2024)](https://themarkup.org/pixel-hunt/2024/04/22/cerebral-to-pay-7-million-fine-and-limit-health-data-use-for-ads-under-federal-order)
- [Pixel tracking violations cost $100M+ (Feroot, 2025)](https://www.feroot.com/blog/pixel-tracking-violations-us-healthcare-100m/)

---

### 2.6 Mindbloom

**Public architecture indicators:** Almost zero. Mindbloom is privately held, no engineering blog, sparse job postings.

**Stack (inferred from product surface):** Telemedicine + native mobile app, video conferencing for clinical sessions, content delivery (curated soundtracks), physical fulfillment integration (Bloombox shipping). Mobile app with offline content. Likely React Native or Flutter mobile + AWS or GCP backend (unconfirmed).

**HIPAA architecture pattern:** Full covered-entity posture (psychiatric clinicians prescribing controlled substances — ketamine). Telehealth-extension-dependent business (DEA Ryan Haight Act exemption). 11,441-patient longitudinal outcome study published 2024 in Journal of Affective Disorders.

**Architectural pattern:** Unobservable.

**Strength of evidence:** 1/5.

**Relevance to Quilty:** Limited — Mindbloom is fully clinical; Quilty's website is not. Mindbloom's content + physical fulfillment integration is interesting only as a model of "many adapters to many vendors" (content CDN + shipping carrier + clinical EHR + video conferencing + payment).

**Sources:**

- [Mindbloom — Wikipedia](https://en.wikipedia.org/wiki/Mindbloom)
- [Mindbloom 2024 outcomes study (Journal of Affective Disorders V361)](https://www.sciencedirect.com/journal/journal-of-affective-disorders)

---

### 2.7 Noom

**Public architecture indicators:** Noom Engineering Medium publication exists (`medium.com/noom-eng`) but search indexing for 2024–2026 is sparse. Marketing site uses dedicated portal subdomain `account.noom.com`. Pricing is gated behind onboarding quiz (deliberate paywall).

**Stack (partial, from prior public posts circa 2020–2022):** Polyglot — Kotlin (backend), Python (data + ML), Ruby on Rails (legacy web), React (frontend), iOS Swift + Android Kotlin (mobile). Aurora + DynamoDB + Snowflake. AWS-first.

**HIPAA architecture pattern:** Noom is behavioral health (weight loss); their B2B / Noom Med (prescription weight-loss drugs) line is HIPAA-scoped clinical. Separate tenant boundary. They've made the same B2C/B2B compliance split as Calm + Headspace.

**Architectural pattern:** Polyglot microservices with team ownership. No public statement of hexagonal pattern.

**Strength of evidence:** 2/5.

**Relevance to Quilty:** Marketing site + dedicated portal subdomain pattern (`account.noom.com`) matches the Quilty roadmap (eventual `app.my-quilty.com` subdomain). The deliberate paywall (pricing behind quiz) is a deliberate conversion architecture, not a hygiene oversight.

**Sources:**

- [Noom Engineering — Medium publication](https://medium.com/noom-eng)

---

### 2.8 Hinge Health

**Public architecture indicators:** Multiple 2024–2025 job postings on Greenhouse / Duke Capital Partners with explicit stack disclosure.

**Stack (explicit):**

- **Backend:** Golang + gRPC, Node.js + NestJS, Ruby on Rails (legacy)
- **API:** GraphQL (Apollo) + REST
- **Frontend web:** React + Redux + TypeScript
- **Mobile:** React Native (iOS + Android)
- **Data:** Postgres + Redis
- **Infra:** Docker + AWS
- **Workflow:** Trunk-based CI/CD, continuous deployment, ~2x more PRs reviewed than opened per engineer
- **Compliance:** HIPAA + HITRUST + SOC 2 + CCPA

**HIPAA architecture pattern:** Hinge Health is fully covered-entity (physical therapy via licensed providers). HITRUST + SOC2 + HIPAA + CCPA stack is unusually comprehensive for the consumer-mental-health peer set — closer to enterprise health-tech posture (Maven, Doximity, Teladoc).

**Architectural pattern — STRONGEST PEER SIGNAL:** **NestJS choice is the most architecturally legible signal in the peer set.** NestJS is built around modules + dependency injection + interface-as-port idioms — it's not literally hexagonal, but it's the JS/TS framework with the closest off-the-shelf affinity to ports + adapters. The "Node.js + NestJS" choice plus the gRPC + GraphQL + Go combination strongly suggests **multi-language modular monolith / coarse-grained service boundaries with explicit interfaces.**

**Strength of evidence:** 4/5 on stack; 3/5 on inferred architectural pattern.

**Relevance to Quilty:** Closest peer architectural shape. The Quilty mobile precedent (33 ports + 27 fakes in `quilty_auth`) maps cleanly to a NestJS-shaped TS service. Hinge Health is the empirical proof that **a small HIPAA-aligned health-tech team can ship NestJS + Go + React Native at scale with trunk-based CI/CD** — the same operational posture Quilty has chosen.

**Sources:**

- [Senior Software Engineer, Mobile @ Hinge Health (Duke Capital Partners Job Board, 2025)](https://jobs.dukecapitalpartners.duke.edu/companies/hinge-health/jobs/53230161-senior-software-engineer-mobile)
- [Software Engineer II — React Native @ Hinge Health](https://jobs.dukecapitalpartners.duke.edu/companies/hinge-health/jobs/55984207-software-engineer-ii-react-native)

---

### 2.9 Maven Clinic

**Public architecture indicators:** Greenhouse careers board active (36 open engineering roles, April 2026). No engineering blog. Levels.fyi profile. Wellfound listings.

**Stack (partial, from job postings):** Backend Engineering team — handles "0→1 product" development. New York + Remote (hub cities). Backend likely Python (Django + FastAPI common in women's-health-tech), with React + TypeScript web. Senior + Staff Backend Engineering roles open (suggests internal architectural-decision capacity).

**HIPAA architecture pattern:** Maven is fully covered-entity (clinical women's health + family-building). $425M+ funding, 2,000+ employer + health-plan clients. Multi-tenant enterprise health-tech posture closer to Hinge Health than to Headspace consumer.

**Architectural pattern:** Unobservable but inferred from hiring (multiple Staff Backend roles open) — suggests a multi-team modular system, likely service-oriented.

**Strength of evidence:** 1/5 on stack; 2/5 on architectural pattern.

**Relevance to Quilty:** Limited — Maven is fully clinical multi-tenant enterprise sales; Quilty website is single-tenant B2C marketing + portal.

**Sources:**

- [Maven Clinic Careers](https://www.mavenclinic.com/careers)
- [Maven Clinic — Greenhouse Engineering Boards](https://boards.greenhouse.io/mavenclinic)

---

### 2.10 WHOOP

**Public architecture indicators:** WHOOP **does** publish an engineering blog (`engineering.prod.whoop.com`) — rare in this peer set.

**Stack (from blog posts):**

- Kubernetes (referenced in "How We Solved Intermittent Kubernetes Networking Issues")
- Apache Iceberg + Spark for petabyte-scale data ("Glacierbase" post)
- Polyglot — iOS + Android native, mobile architecture post 2022 ("Distributing Complexity")
- MCP (Model Context Protocol) adoption discussed in 2025 hackathon writeups
- AWS-first (Apple Health integration via webhook + sync pattern)

**HIPAA architecture pattern:** WHOOP is wellness (NOT HIPAA-scoped by default), though they market health insights. Apple Health integration is the regulated-data adapter.

**Architectural pattern:** Modular + data-pipeline-heavy. Blog posts emphasize infrastructure resilience + data-platform engineering. No public ports/adapters or hexagonal statement.

**Strength of evidence:** 3/5 on infra; 2/5 on architectural pattern.

**Relevance to Quilty:** Tangential — WHOOP is a hardware-bundled subscription, not a mental-health peer. Useful only for the Apple Health adapter pattern (if Quilty ever integrates HealthKit).

**Sources:**

- [WHOOP Engineering Blog — Architecture tag](https://engineering.prod.whoop.com/tags/architecture/)
- [What the heck is MCP? (WHOOP Engineering, July 2025)](https://engineering.prod.whoop.com/what-the-heck-is-mcp/)
- [WHOOP × Apple Health (Terra blog)](https://tryterra.co/blog/whoop-syncs-health-data-to-apple-health-ee298d328f41)

---

### 2.11 Apple Health (HealthKit + WWDC)

**Public architecture indicators:** WWDC sessions are the primary public source. HealthKit is a documented framework, not an internal architecture.

**Stack:** Swift / SwiftUI / Combine. On-device storage with privacy-protected sync. ResearchKit + CareKit (open-source frameworks).

**HIPAA architecture pattern:** Apple Health stores PHI on-device by default; sync via end-to-end-encrypted iCloud. **The "no Apple ID can read your health data" claim is a privacy property, not an architectural pattern.** ResearchKit / CareKit are the public adapter surfaces for clinical research + chronic-care integration.

**Architectural pattern (inferred):** Strong protocol-oriented design (Swift idiom). Adapters per data source (HKWorkout, HKQuantitySample, etc.) — this IS ports + adapters at the SDK level, just not named.

**Strength of evidence:** 4/5 on framework; N/A on Apple's internal infra.

**Relevance to Quilty:** Limited. Apple's protocol-oriented Swift design is the spiritual ancestor of the hexagonal pattern Quilty is adopting in TypeScript. **Validation, not direct precedent.**

**Sources:**

- [Apple HealthKit Framework (Developer Docs)](https://developer.apple.com/documentation/healthkit)
- WWDC 2024–2026 health-data sessions (Apple Developer)

---

### 2.12 23andMe (post-incident)

**Public architecture indicators:** 2023 credential-stuffing breach + Chapter 11 bankruptcy filing (March 2025). Multiple academic papers + post-mortem analyses.

**Stack:** Polyglot — Python + Go + Java + React + AWS. Genomic-data lake with relational + graph features (DNA Relatives + Family Tree).

**HIPAA architecture pattern + lesson:** 23andMe is NOT a HIPAA covered entity (it's a DTC genetic-testing service), but the lesson applies. **Single architectural decision (DNA Relatives feature as opt-in social graph) turned a 14,000-account credential-stuffing compromise into a 7M-user data exposure.** A single compromised account could scrape thousands of "relatives" who never had their passwords stolen.

**Architectural lesson:** **Aggressive data segmentation matters more than service boundaries.** 23andMe's failure wasn't about ports/adapters — it was about authorization-scope at the graph level. **A `RelativesQuery` port with strict per-user rate limits + bulk-fetch detection adapter would have helped, but the deeper issue was feature design.**

**Strength of evidence:** 5/5 on the segmentation lesson; 1/5 on architectural pattern.

**Relevance to Quilty:** Limited but instructive. Quilty has no social-graph feature (and shouldn't). The lesson translates to: **for every adapter that fans out per-user data, define rate limits + bulk-detection at the port boundary, not at the consumer.**

**Sources:**

- [23andMe credential stuffing breach (Enzoic, 2025)](https://www.enzoic.com/blog/23andme-breach/)
- [23andMe Data Breach Deep Dive (Sekurno)](https://www.sekurno.com/post/the-23andme-breach-anatomy-impact-and-lessons-for-genomic-security-deep-dive)
- [The 23andMe Data Breach — Analysis (arXiv 2502.04303, 2025)](https://arxiv.org/abs/2502.04303)

---

### 2.13 Wysa

**Public architecture indicators:** Wysa publishes a "Wise Up" newsletter PDF (Sept 2025) discussing safe AI in mental health. LinkedIn company page. No engineering blog. FDA Breakthrough Device Designation in US.

**Stack (partial, from product surface + 2025 newsletter):**

- Multi-channel: mobile app + web + WhatsApp + voice
- NLP + GenAI for CBT-based chatbot
- Multilingual (English, Spanish, Hindi, Marathi + 10 regional languages — i18n burden is substantial)
- 11M lives, 500M+ conversations, 95 countries
- FDA Breakthrough Device Designation (US) — IND-equivalent posture for AI mental health

**HIPAA architecture pattern:** Wysa for Impact (B2B health plans) is HIPAA-scoped; consumer Wysa is wellness. Same B2C/B2B split as Calm/Headspace/Noom.

**Architectural pattern:** Unobservable; AI-driven chatbot architecture is the load-bearing surface.

**Strength of evidence:** 2/5.

**Relevance to Quilty:** Tangential. Wysa's WhatsApp + voice channel diversity is interesting only as a "many adapters per output channel" pattern.

**Sources:**

- [Wysa for Impact](https://www.wysa.com/for-impact)
- [Wise Up Issue Three (Wysa, Sept 2025)](https://blogs.wysa.io/wp-content/uploads/2025/09/Wise_Up_Issue_Three.pdf)

---

## 3. HIPAA-Architecture Lessons from Incidents

The peer set is rich in incidents. Five lessons crystallize:

### 3.1 The Cerebral / Monument / BetterHelp Pattern: Adapter-Boundary Failure

**Pattern:** Vendor tracking SDK loaded directly into pages handling regulated data, with no central chokepoint, no `assertNoPHI` discipline, no runtime audit.

**Casualties:** Cerebral ($7M), Monument ($2.5M), BetterHelp ($7.8M), GoodRx ($25M), Premom, Easy Healthcare. $100M+ in penalties + settlements 2022–2025 (Feroot tally).

**Architectural fix:** Hexagonal per package + ESLint chokepoint at adapter boundary (D76 + D78). All vendor SDK imports allowed only in `packages/*/src/adapters/*.ts`. A central `MarketingAnalytics` port with explicit `assertNoPHI` and per-event allowlist makes the Cerebral failure mode architecturally impossible — not policy-prevented, mechanically prevented.

**Quilty alignment:** D31 + D35 + D67 + D77 + D78 already lock this. Round 6's contribution is making D78 _structural_ (per-package gate) rather than _per-directory_ (M1 ESLint rule at `lib/observability/`).

### 3.2 The Talkspace Pattern: Retention-Policy Failure (Architecture Can't Save You)

**Pattern:** Long-term retention of sensitive content (140M messages, 8B words) without strong deletion + minimization defaults. Court-ordered disclosure + AI training amplify the blast radius.

**Architectural fix:** A `MessageStore` port with TTL + retention-policy adapter is the closest analog, but the deeper lesson is **data minimization at the schema level.** This is a Rust-backend concern; the website tier doesn't hold PHI by design (D31).

**Quilty alignment:** Website tier is out of scope; the Rust backend's audit + retention layer is the right surface for this lesson.

### 3.3 The 23andMe Pattern: Authorization-Scope at the Graph Boundary

**Pattern:** Social-graph feature (DNA Relatives) turned 14K credential-stuffing compromises into 7M data exposures.

**Architectural fix:** Per-user rate limits + bulk-fetch detection at the port boundary. **For Quilty:** no social graph feature in scope. But the principle applies to any adapter that fans out data per-user (e.g., a future "share progress with provider" feature).

### 3.4 The HITRUST-Was-Not-Enough Pattern (BetterHelp)

**Pattern:** Compliance certification ≠ runtime safety. BetterHelp was HITRUST-certified at the time of the FTC enforcement.

**Architectural fix:** **Mechanical chokepoints (ESLint + Sanitizer port + assertNoPHI) catch runtime violations that documentation review misses.** D78 is the mechanical layer; D67 (PHI sanitizer + ESLint `no-console` + ban-direct-vendor-SDK-imports) is the runtime layer.

### 3.5 The "Privacy Claims Are Product Claims" Lesson (FTC, 2024)

**Pattern (from FTC's April 2024 enforcement blog):** Privacy or security representations are product claims you must substantiate. "We take care to protect your information" is NOT puffery — it's an affirmative claim subject to enforcement.

**Architectural fix:** The website's marketing copy must match runtime behavior. **The adapter chokepoint makes this auditable — what marketing claims, the SDK boundary enforces.**

---

## 4. What Quilty Can Replicate vs What's Unique to Bigger Players

### 4.1 Replicate

| Peer pattern                                                           | Quilty translation                                                                                                          |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Hinge Health's NestJS + interface-as-port idioms                       | TypeScript packages with `ports.ts` + `domain/` + `adapters/` (D76 — _direct equivalent without NestJS framework adoption_) |
| Headspace's TS + Next.js + React + AWS marketing tier                  | Already adopted (D1, D2)                                                                                                    |
| Calm/Noom/Headspace B2C wellness vs B2B clinical split                 | Quilty is single-tenant B2C consumer mental health — split deferred until B2B becomes a real triggered work-item            |
| Marketing-site outsourcing of help center (Zendesk/Intercom subdomain) | Already in roadmap (`help.my-quilty.com` reserved)                                                                          |
| Stripe Customer Portal for ~50% of subscription scope                  | Already in M7 plan; D78 ensures Stripe adapter is the only SDK import surface                                               |
| WHOOP-style engineering blog                                           | Deferred indefinitely — not a launch concern                                                                                |
| Modular monolith with explicit interfaces                              | D75 + D76 (already locked)                                                                                                  |

### 4.2 Don't Replicate (Premature)

| Peer pattern                                                  | Why not for Quilty                                                                                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headspace's polyglot stack (TS + Java + Go + Kotlin/Swift)    | Premature for a 1-2 engineer team; the Rust backend already covers the polyglot need at the API layer. Website tier is TS-only by design (D1).                                      |
| Multi-region multi-AZ Kubernetes (Hinge Health, WHOOP)        | SST + AWS Lambda + CloudFront is the right shape pre-launch (D2 revised, Round 5). Lambda's natural per-route isolation already gives most of what k8s would give a marketing site. |
| Snowflake + Redshift data warehouse (Headspace)               | Not needed pre-launch. CloudWatch + Sentry + PostHog (D42a/b/d) cover the day-one observability surface.                                                                            |
| Maven Clinic's 36+ engineering team multi-team modular system | Not Quilty's shape for several years.                                                                                                                                               |
| HITRUST certification                                         | Premature. SOC 2 Type I at most after launch + revenue. **HIPAA compliance posture without HITRUST is achievable for a website that holds no PHI by design** (D31).                 |
| Pixel tracking integration patterns from Headspace/Calm       | Architectural anti-pattern per FTC enforcement; D31 + D35 + D78 explicitly preclude this.                                                                                           |

### 4.3 Unique to Quilty (No Direct Peer)

| Quilty choice                                                         | Why no peer precedent                                                                                                                                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust backend permanent (D48)                                          | Headspace + Calm + BetterHelp are JS/Python/Java-backed. Rust is a Quilty-specific bet motivated by the auth-token-broker performance + memory-safety surface. No consumer-mental-health peer ships Rust. |
| OpenAPI spec as cross-language contract (TS website + Dart mobile)    | Most peers ship JS website + JS-derived mobile (RN). Quilty's Flutter mobile choice creates the OpenAPI codegen need.                                                                                     |
| Hexagonal-per-package _named_ (D76)                                   | Peers either use NestJS modules (Hinge Health) or stay silent. Quilty is the first to **publicly name** the pattern in its decisions log.                                                                 |
| Mobile precedent for hexagonal (33 ports + 27 fakes in `quilty_auth`) | The mobile codebase is the architectural reference. No public consumer-mental-health peer has demonstrated this discipline at the package level.                                                          |

---

## 5. Recommendation for Quilty's D76

**LOCK D76 + D77 + D78. Go ahead with hexagonal-per-package.**

The consumer-mental-health peer set provides:

1. **No direct precedent for hexagonal-per-package as a publicly-named pattern.** Hinge Health (NestJS) is the closest match; no peer states the pattern explicitly.
2. **Overwhelming evidence that the adapter boundary IS the compliance choke point.** Cerebral, Monument, BetterHelp, GoodRx, Premom — every FTC enforcement case in the 2022–2025 wave is about uncontrolled SDK imports + tracking pixels. D78's mechanical gate (ESLint chokepoint at `packages/*/src/adapters/*.ts`) is the architectural inverse of these failures.
3. **A mobile-internal precedent that's stronger than any external peer.** `quilty_auth` (33 ports + 27 fakes + 9 cubits) is more architectural discipline than _anything_ visible in the consumer-mental-health peer set. The mobile codebase's hexagonal posture **is** Quilty's competitive architectural advantage.

### Consumer-Health-Specific Tweaks to D76

Recommend framing the locked decisions as follows:

1. **Frame D76 as the foundation, D78 as the compliance argument.** The Round 6 decisions log already does this — `D78` is described as "tightens the existing M1 ESLint rule that gated at `lib/observability/` directory". Make explicit in the strategy doc that the per-package adapter gate is the **codified runtime-enforcement of the Cerebral $7M / BetterHelp $7.8M / Monument $2.5M / GoodRx $25M lessons**.
2. **Add an `AnalyticsPort` + `MarketingPort` adapter discipline in addition to the existing `ErrorReporter` + `Logger` + `Flag` ports.** Per the Cerebral case, the FTC's runtime audit specifically looks at: tracking pixels (Meta, Google, TikTok, LinkedIn, Snapchat), retargeting tags, conversion-tracking. These must be a named port with a Sanitizer + ConsentState gate, not generic `Analytics`.
3. **The `Sanitizer` port (already implied by D67 PHI sanitizer + `assertNoPHI`) should be elevated to a first-class port.** Every adapter that sends data outbound should consume the `Sanitizer` port. This is the architectural reification of the "implementation must match policy" FTC lesson.
4. **Document the BetterHelp HITRUST lesson explicitly in ADR-0008 or ADR-0009.** HITRUST certification audits documentation; the runtime escapes the audit. Mechanical chokepoints (D78) are the runtime layer.
5. **Don't over-port at M1.5.** Following Three Dots Labs' 2024 pragmatic guidance: start with the 4-6 obvious ports (`ErrorReporter`, `Logger`, `Analytics`, `Sanitizer`, `Flag`, `Marketing`), and let the rest emerge from real pain points. The mobile precedent has 33 ports because mobile has been iterating for years; the website at M1.5 doesn't need 33 ports on day one. Add ports when there's a real second adapter or a real test-double need.
6. **The composition root pattern (D77/ADR-0010) should explicitly document the `ConsentState` flow.** Per D35 + the Cerebral lesson, no analytics adapter should be wired in the composition root without a consent check. The composition root is the architectural surface where consent gating becomes visible + auditable.

### What the Peer Set Does NOT Justify

- **Microservices split at the website tier.** No peer of Quilty's size has split a marketing + portal website into microservices. Modular monolith (D75) is the right shape and the peer evidence (Hinge Health NestJS) supports it.
- **NestJS adoption.** Although Hinge Health uses NestJS, Quilty's commitment to Next.js 16 App Router + thin TS BFF means the NestJS framework isn't needed. The hexagonal pattern can be built without NestJS's full DI container; a lighter composition-root + package-local DI is sufficient (D77).
- **Heavy event-driven inter-package communication at M1.5.** No peer evidence supports event-bus complexity at the website tier pre-launch. EventBridge already serves the cross-account auth fan-out (D9); within the website, direct port-to-port composition is sufficient.

### Bottom Line

The consumer-mental-health peer set **does not name the hexagonal pattern** but **provides the strongest case for it via incident archaeology.** The FTC's $100M+ enforcement wave (2022–2025) targets exactly the architectural anti-pattern that D76 + D77 + D78 make impossible. **Lock D76. Reframe in the strategy doc as a compliance-by-architecture commitment, not just a software-quality preference. Add a `MarketingAnalytics` + `Sanitizer` port explicitly to the M1.5 sweep alongside the existing observability + security extractions.**

---

## Appendix A — Tech-Stack Summary Across Peers

| Peer                 | Web TS/Node?                     | React/Next.js?                       | Mobile                     | Backend Languages      | Cloud             | Named Architecture Pattern?           |
| -------------------- | -------------------------------- | ------------------------------------ | -------------------------- | ---------------------- | ----------------- | ------------------------------------- |
| Headspace            | YES (Node + TS)                  | YES (Next.js + React)                | iOS Swift + Android Kotlin | TS + Java/Spring + Go  | AWS               | NO (polyglot per service)             |
| Calm                 | Likely                           | Likely                               | Native iOS + Android       | Unknown                | AWS               | NO                                    |
| BetterHelp           | Likely                           | Likely                               | Native                     | Unknown                | Unknown           | NO                                    |
| Talkspace            | Likely                           | Likely                               | Native                     | Unknown                | Unknown           | NO                                    |
| Cerebral             | Likely                           | Likely                               | Native                     | Unknown                | Unknown           | NO                                    |
| Mindbloom            | Likely                           | Likely                               | Likely RN/Flutter          | Unknown                | Unknown           | NO                                    |
| Noom                 | YES                              | React                                | iOS Swift + Android Kotlin | Kotlin + Python + Ruby | AWS               | NO (polyglot microservices)           |
| Hinge Health         | YES (Node + TS + NestJS)         | React                                | React Native               | Go + Node + Ruby       | AWS               | Implicit (NestJS modules)             |
| Maven Clinic         | Likely                           | Likely                               | Native                     | Likely Python          | Unknown           | NO                                    |
| WHOOP                | Mixed                            | N/A (no big marketing tier observed) | Native iOS + Android       | Polyglot               | AWS + Kubernetes  | NO (data-platform-heavy)              |
| Apple Health         | N/A                              | N/A                                  | Swift + SwiftUI            | Apple internal         | Apple             | Implicit (protocol-oriented)          |
| 23andMe              | Mixed                            | Likely React                         | Native                     | Python + Go + Java     | AWS               | NO                                    |
| Wysa                 | Likely                           | Likely                               | Native + RN                | Unknown                | Unknown           | NO                                    |
| **Quilty (planned)** | **YES (Next.js 16 + TS strict)** | **YES (Next.js 16 App Router)**      | **Flutter (Dart)**         | **Rust**               | **AWS (SST 4.x)** | **YES — Hexagonal per package (D76)** |

---

## Appendix B — Sources Index

### Engineering blogs / job postings

- [Software Engineer, Full Stack @ Headspace](https://careers.spectrumequity.com/companies/headspace/jobs/51686941-software-engineer-full-stack) — Headspace stack
- [Headspace Tech Stack — Himalayas.app](https://himalayas.app/companies/headspace/tech-stack)
- [Calm Tech Stack — Himalayas.app](https://himalayas.app/companies/calm/tech-stack)
- [Calm Tech Stack — StackShare](https://stackshare.io/calm/calm)
- [Senior Software Engineer, Mobile @ Hinge Health](https://jobs.dukecapitalpartners.duke.edu/companies/hinge-health/jobs/53230161-senior-software-engineer-mobile) — Hinge stack
- [Software Engineer II — React Native @ Hinge Health](https://jobs.dukecapitalpartners.duke.edu/companies/hinge-health/jobs/55984207-software-engineer-ii-react-native)
- [Maven Clinic Careers](https://www.mavenclinic.com/careers)
- [Maven Clinic — Greenhouse Engineering Board](https://boards.greenhouse.io/mavenclinic)
- [WHOOP Engineering Blog — Architecture tag](https://engineering.prod.whoop.com/tags/architecture/)
- [What the heck is MCP? (WHOOP Engineering, July 2025)](https://engineering.prod.whoop.com/what-the-heck-is-mcp/)
- [Noom Engineering Medium](https://medium.com/noom-eng)

### FTC enforcement + incidents

- [FTC v. BetterHelp settlement (2023)](https://www.ftc.gov/business-guidance/blog/2023/03/ftc-says-online-counseling-service-betterhelp-pushed-people-handing-over-health-information)
- [FTC v. Cerebral (Healthcare Dive, April 2024)](https://www.healthcaredive.com/news/cerebral-federal-trade-commission-7-million-fine-data-sharing-privacy/713295/)
- [FTC v. Cerebral (Markup, April 2024)](https://themarkup.org/pixel-hunt/2024/04/22/cerebral-to-pay-7-million-fine-and-limit-health-data-use-for-ads-under-federal-order)
- [FTC v. Cerebral (Daily Security Review, 2024)](https://dailysecurityreview.com/security-spotlight/cerebral-settles-suit-at-7-million-in-facebook-pixel-data-leak-case/)
- [FTC v. Monument (Markup, April 2024)](https://themarkup.org/pixel-hunt/2024/04/19/ftc-cracks-down-on-telehealth-addiction-service-monument-for-sharing-health-data)
- [FTC v. Monument press release (2024)](https://www.ftc.gov/news-events/news/press-releases/2024/04/alcohol-addiction-treatment-firm-will-be-banned-disclosing-health-data-advertising-settle-ftc)
- [Consumer health information FTC blog (2024)](https://www.ftc.gov/business-guidance/blog/2024/04/consumer-health-information-handle-extreme-care)
- [Pixel tracking violations cost US healthcare $100M+ (Feroot, 2025)](https://www.feroot.com/blog/pixel-tracking-violations-us-healthcare-100m/)
- [The Talkspace Case (Captain Compliance, 2025)](https://captaincompliance.com/education/140-million-messages-and-a-court-order-what-the-talkspace-case-reveals-about-the-architecture-of-mental-health-privacy/)
- [Talkspace privacy assessment (Mozilla Privacy Not Included, 2024)](https://www.mozillafoundation.org/en/privacynotincluded/talkspace/)
- [23andMe Data Breach (Enzoic, 2025)](https://www.enzoic.com/blog/23andme-breach/)
- [23andMe Breach Deep Dive (Sekurno)](https://www.sekurno.com/post/the-23andme-breach-anatomy-impact-and-lessons-for-genomic-security-deep-dive)
- [The 23andMe Data Breach — Academic Analysis (arXiv 2502.04303)](https://arxiv.org/abs/2502.04303)

### Architecture pattern background

- [Is Clean Architecture Overengineering? (Three Dots Labs, 2024)](https://threedots.tech/episode/is-clean-architecture-overengineering/)
- [Hexagonal vs Clean vs Onion: which one survives 2026 (DEV Community)](https://dev.to/dev_tips/hexagonal-vs-clean-vs-onion-which-one-actually-survives-your-app-in-2026-273f)
- [Architectural patterns for modular monoliths (microservices.io, 2024)](https://microservices.io/post/architecture/2024/09/09/modular-monolith-patterns-for-fast-flow.html)
- [Modular Monolith vs Microservices in 2025 (Medium / The Atomic Architect)](https://medium.com/@the_atomic_architect/architecture-patterns-that-actually-scale-in-2025-the-only-three-you-need-89d1488c60a7)
- [How Modular Architecture Saves Millions in Digital Health (CapMinds, 2025)](https://www.capminds.com/blog/how-modular-architecture-saves-millions-in-digital-health-infrastructure-over-the-long-run/)
- [Best Sentry Alternatives 2026 (Security Boulevard)](https://securityboulevard.com/2026/04/best-sentry-alternatives-for-error-tracking-and-monitoring-2026/) — vendor-swap rationale

### Related Quilty research

- `/Users/d1rect0r_interneta/AppBuilding/quilty-website/docs/research/consumer_health_patterns.md` — 10-company peer-set scope inspection (round 4, 2026-05-14)
- `/Users/d1rect0r_interneta/AppBuilding/quilty-website/docs/research/round_6_foundation_audit/decisions-log.md` — D75-D81 hexagonal lock
- `/Users/d1rect0r_interneta/AppBuilding/quilty-website/docs/research/round_6_foundation_audit/synthesis-and-decisions.md` — Round 6 synthesis
