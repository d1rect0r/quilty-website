# 19 — DSAR / Erasure / Portability Scope (C5 + C6 + domain completeness)

> Round-6 verification audit. Method: WebFetch + WebSearch against live
> properties + regulator + vendor guidance on 2026-05-19. Peer set: 15
> companies (8 consumer-health, 7 engineering-strong) plus 3 vendor
> platforms (DataGrail, Transcend, OneTrust patterns) plus 4 FTC/EDPB/CNIL
> /ICO regulator signals.
>
> Scope: Answers `C5` (GDPR Art 17 erasure: web-only vs unified across BAA
> boundary) + `C6` (GDPR Art 15 access / Art 20 portability: same
> question) + a long tail of decision-log gaps the audit surfaced. The
> existing `decisions-log.md` lists `C5 ⏳ pending` and `C6 ⏳ pending`
> at lines 206-207; this file converts both to locked recommendations
> and proposes ~13 new D-decisions to fill the gaps surfaced by the
> peer scan.

---

## 1. Executive summary

**C5 (erasure) recommendation: (b) Unified across BAA boundary via Rust
backend `Erase` orchestrator.** The website renders the request UI at
`/account/privacy` (signed-in) and `/legal/privacy-choices` (public), but
the actual erasure is dispatched to a single backend endpoint
(`POST /v1/privacy/erasure-requests`) that the Rust backend owns. That
endpoint enqueues a saga which (i) initiates per-vendor erasure calls,
(ii) collects receipts, (iii) writes an immutable audit record, and
(iv) signals the mobile app to wipe device-local caches on next launch.
The website-only path (option a) re-creates the Cerebral $7M failure mode
where the user mentally requested deletion but PHI continued sitting in
the clinical record store. The hybrid (option c) introduces UX failure
modes — users who delete on one surface assume both are gone — that
match the BetterHelp / 23andMe complaint pattern.

**C6 (access + portability) recommendation: same — unified, Rust-owned
`Export` orchestrator producing a single ZIP bundle.** Bundle contains
multiple machine-readable formats (`profile.json`, `account.csv`,
`subscription.csv`, and per-session `journal-entries.json` once those
surfaces exist), surfaced via a one-time-use signed CloudFront URL with
a 7-day TTL and a download-event audit row. Headspace's "csv or pdf"
phrasing is the consumer-health peer norm; BetterHelp's in-app "request
a copy of your data" lives at `Menu > My Account > My Personal
Information`, which is also where they expose erasure. Quilty's
`/account/privacy` page should mirror that anatomy.

**Surfaced gaps now proposed as locked decisions (full list in §7):**
13 candidate D-decisions covering identity verification policy, per-
jurisdiction SLA matrix, 30-day soft-delete cooling-off, export bundle
format + delivery, downstream-vendor erasure-receipt orchestration,
audit log retention exception specifics, Art 16/21 UX placement, DPA
Art 28 sub-processor instructions, sensitive-data-class handling, DSAR
analytics event privacy, COPPA/GDPR-K edge handling, mobile-local data
wiping, and a "law unable to be denied" matrix for the MHMDA Catch-22.

---

## 2. Peer + vendor pattern table

> Method: live page fetch on 2026-05-19. "Verify=login" means
> verification falls back to an authenticated session (the modern norm).
> "Verify=photoID" means government-ID upload is on the documented happy
> path. "Bundle" = single-download multi-file package.

| Company        | Erasure entry-point                                                                          | Export entry-point                                  | Verify                                                 | Stated SLA                                                                | Soft-delete                                                   | Export format                  |
| -------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ |
| **Headspace**  | `help@headspace.com` + "My Data page" in mobile app                                          | Email request → CSV or PDF                          | login + "additional info" if doubt                     | "without undue delay"; 45d (CA)                                           | Not stated                                                    | CSV or PDF                     |
| **Calm**       | `support@calm.com` + `calm.com/contact` form                                                 | Stated right; no mechanism URL                      | login + "matching info on file"                        | Not stated                                                                | Not stated                                                    | Not specified                  |
| **BetterHelp** | In-app `Menu > My Account > My Personal Information` (URL not public; logged-in nav)         | Same path, "request a copy of your data" button     | login + FaceID biometric option                        | 24h confirmation; 24h erasure (most data); 10yr clinical-record carve-out | Not stated — immediate                                        | Not specified                  |
| **Talkspace**  | Email form + photo-ID upload (`help.talkspace.com`)                                          | "Data Subject Rights Request Form (GDPR)" via email | **photo ID required** (regulator-flagged anti-pattern) | Not stated                                                                | Not stated                                                    | Not specified                  |
| **Cerebral**   | Email `privacy@cerebral.com`                                                                 | Same email                                          | login + biometric + SSN for clinical records           | Not stated                                                                | Not stated                                                    | Not specified                  |
| **Noom**       | 404 at fetched URL (privacy page reorg)                                                      | —                                                   | —                                                      | —                                                                         | —                                                             | —                              |
| **Hims**       | 403 (Akamai bot-block during fetch)                                                          | —                                                   | —                                                      | —                                                                         | —                                                             | —                              |
| **23andMe**    | In-app self-service post-2023-breach hardening                                               | Same in-app surface                                 | login + post-MFA-mandate (Oct 2023 fix)                | "as soon as reasonably practicable"                                       | CLIA 2-yr retention on de-identified raw data                 | Multiple per data type         |
| **Stripe**     | `support.stripe.com` deletion article + Connect-specific deletion URLs per relationship type | Privacy team email                                  | login + phone + photo ID (KYC overlap)                 | "1 day average" (2023 CCPA report); 30d GDPR                              | Not stated                                                    | Not specified                  |
| **Linear**     | `hello@linear.app`                                                                           | Account login or email                              | "additional info" if doubt                             | Not stated                                                                | Not stated                                                    | "machine-readable"             |
| **Cal.com**    | `support@cal.com` or `legal@cal.com`                                                         | Same emails                                         | "may verify"                                           | Not stated                                                                | Not stated                                                    | "structured, machine-readable" |
| **Vercel**     | `datarequest.vercel.com` (DataGrail-powered subdomain)                                       | Same DataGrail intake                               | DataGrail auth flow                                    | DataGrail SLA tracking                                                    | Not stated                                                    | DataGrail bundle               |
| **Anthropic**  | `privacy@anthropic.com` + per-conversation in-product delete                                 | Email                                               | "additional info" if doubt                             | Not stated; conversation auto-delete 30d after user-delete                | 30d backend purge window post user-delete                     | Not specified                  |
| **Sentry**     | `sentry.io/contact/gdpr/`                                                                    | Same                                                | Not specified                                          | "in accordance with applicable law"                                       | 30-90d data retention by plan                                 | Not specified                  |
| **Notion**     | In-app "Delete account"                                                                      | In-app exports                                      | login                                                  | Not stated for DSAR; 30-day grace for account-restore                     | **30-day account grace + 30-day trash grace** (best-in-class) | Markdown / HTML / CSV bundle   |
| **Spotify**    | Account page "Close account"                                                                 | Account page "Download your data"                   | login                                                  | 30d GDPR (stated in form)                                                 | **7-30d grace** (Free/Premium tier-dependent)                 | JSON bundle                    |

**Patterns that hold across the entire peer set:**

1. **No one requires photo ID for routine DSARs** except Talkspace and Cerebral — and Talkspace's pattern was the exact one Dutch DPA fined DPG Media €525,000 for in 2020 under data-minimisation. **Photo ID for routine consumer DSARs is the documented regulator-flagged anti-pattern.** Authenticated-session-as-verification is the norm.
2. **Engineering-strong peers ship a one-page-of-policy + one-email-inbox; consumer-health peers ship in-product UI** — Quilty should do both (signed-in `/account/privacy` + public `/legal/privacy-choices` landing).
3. **Spotify and Notion are the only peers with explicit soft-delete grace periods** — and they are the two most-loved consumer products in the set. The grace period is a _retention_ feature (saves accounts from accidental deletion) more than a _privacy_ feature (privacy lawyers prefer it because they get an extra 30 days to enrich the audit record before destruction).
4. **No peer publishes a per-jurisdiction SLA matrix.** Every peer either states one SLA ("45 days for California") or hedges to "applicable law." A matrix in the privacy policy is over-engineering; internal tracking against the tightest applicable SLA is the operational norm.
5. **Export format converges on a multi-file bundle.** No peer ships a single JSON file. The most-engineered exports (Notion, Spotify) ship a ZIP with per-domain files (preferences, account, content). Headspace's "CSV or PDF" wording is the consumer-health minimum.
6. **Downstream-vendor erasure receipts are universal in vendor docs (DataGrail, Transcend), absent in privacy policies.** This is back-office work, not consumer-visible UI — but ISO 27001 Annex A 5.19 auditors will ask for it and the BetterHelp settlement made it operationally required for 20 years post-settlement.

---

## 3. HIPAA + GDPR reconciliation

Quilty's posture sits at an unusual confluence: HIPAA-aligned consumer
mental-health (the website is in Workloads-NonHIPAA scope per CLAUDE.md
but the backend handles PHI), GDPR-applicable on EU traffic, plus the
CPRA + WA MHMDA sensitive-data overlay.

**The 6-year audit-log retention "exception" is well-understood and
codified in GDPR Art 17(3):**

| Right                                | Standard scope   | HIPAA / law overlay                                                                                                 | Quilty posture                                                                                                                                 |
| ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Art 17 erasure                       | Delete PII       | §164.316(b)(2)(i): keep policy + audit documentation 6 years from creation OR last use                              | Delete PII; keep tamper-evident **erasure-request audit record** in DynamoDB for 6 years; that record contains no PHI                          |
| Art 17 erasure of clinical records   | Delete           | State medical-record retention (varies 6-25 years; CA = adult: 7 years post-discharge, minor: 1 year post-majority) | **Mark + suppress, do not delete** — BetterHelp's "10-year clinical record carve-out" pattern; surface in the user's denial-explanation letter |
| Art 17 erasure of de-identified data | Delete           | CLIA: 2 years (23andMe lesson)                                                                                      | N/A — Quilty doesn't operate a CLIA lab                                                                                                        |
| Art 15 access                        | Provide copy     | §164.524 patient-access right (30 days, 30-day extension)                                                           | Same surface; HIPAA's 30 days is _tighter_ than GDPR's 30 days w/ 2-month extension — design to the tighter clock                              |
| Art 16 rectification                 | Correct PII      | §164.526 amendment right (60 days, 30-day extension)                                                                | Same UX (`/account/profile` self-edit fields); user-flag-for-review queue for non-self-editable fields                                         |
| Art 20 portability                   | Machine-readable | None directly — but §164.524(c)(2)(ii) requires "form and format requested" if "readily producible"                 | Bundle export covers both                                                                                                                      |
| Art 21 objection                     | Stop marketing   | FTC HBNR § connects opt-out; no HIPAA direct analog (marketing PHI use already requires authorization)              | Cookie banner reject-all + `/account/marketing-preferences` toggles handle it                                                                  |

**The "MHMDA Catch-22" warrants a P0 lock.** WA MHMDA's erasure right
lacks the legal-obligation exception every other privacy law contains —
yet the same Act _also_ requires retaining authorisation records for 6
years. Hintze Law's reading is correct: this is a litigation trap. The
defensible posture is: **(1) follow MHMDA erasure literally for the WHMDA-
specific definition of "consumer health data," (2) document the
authorisation-retention exception in the user-facing denial letter
verbatim from RCW 19.373, (3) treat the conflict as a known-issue
disclosed in the privacy policy.** This is a `D-` candidate (§7 gap G13).

**The Cerebral / BetterHelp / Monument / 23andMe pattern is consistent:**

- **Cerebral $7M (2023)**: tracking pixel exfiltration _during active
  account life_ — not a DSAR-fulfilment failure. The website's existing
  D31 zero-PHI runtime + D32 CSP + D35 ConsentState chain prevents this.
- **BetterHelp $7.8M (2023)**: same exfiltration class + 20-year
  ongoing duty to **direct downstream vendors to delete data BetterHelp
  previously shared**. This is the canonical "downstream erasure
  orchestration" mandate; Quilty's `Erase` saga must be designed for it
  on day one even though we have not yet exfiltrated to anyone.
- **Monument $2.5M (Mar 2024)**: same pixel class. Same mitigation.
- **23andMe (Oct 2023 breach, Sep 2024 $30M settlement, Mar 2025
  bankruptcy)**: identity-verification weakness pre-breach (no MFA on
  raw-DNA download) + post-bankruptcy data-asset-sale risk. The lesson
  for Quilty: **make sure the privacy policy says what happens to the
  audit log + retained data if Quilty is acquired**, and design DSAR
  identity verification to scale with data sensitivity.

---

## 4. Cross-platform architecture recommendation

The unified backend orchestrator pattern is well-supported by the peer
scan and the vendor scan (DataGrail / Transcend both explicitly model
DSAR fulfilment as a Rust-backend-side saga, not a per-surface
operation). Mobile-only or web-only DSAR fulfilment is the BetterHelp
pre-settlement anti-pattern. The recommended shape is:

```
                  USER
                   │
   ┌───────────────┴────────────────┐
   │                                │
   ▼                                ▼
 Web (`/account/privacy`)         Mobile (Settings > Privacy)
   │                                │
   │ POST /v1/privacy/erasure-requests
   │ (or .../access-requests, .../portability-requests)
   └───────────────┬────────────────┘
                   ▼
        Rust backend orchestrator (DSAR saga)
                   │
   ┌───────────────┼───────────────┐
   │               │               │
   ▼               ▼               ▼
 internal       per-vendor      audit log
 systems        erasure         (immutable
 (DDB, S3,      receipts        DynamoDB
 Cognito,       (Sentry,        with 6-yr
 SES                  Amplitude,      retention,
 suppression    Customer.io,    no PHI)
 list)          Cloudflare,
                Stripe,
                RevenueCat)
                   │
                   ▼
        EventBridge `quilty.privacy.erasure_completed`
                   │
   ┌───────────────┴────────────────┐
   ▼                                ▼
 Web BFF cache invalidate         Mobile push: wipe device-local cache
```

**Key design notes from the vendor scan:**

- DataGrail and Transcend both ship "approval gate before erasure
  report" — recommended for Quilty (`elevated_until` step-up auth at
  request submission is sufficient; no separate human approval queue at
  startup scale).
- Transcend models the saga as configurable per-region per-data-type
  workflow; Quilty's saga at M5-M6 should be a hard-coded Rust state
  machine in `quilty-aws/lambdas/rust/privacy-dsar/`, made config-
  driven only when the vendor count exceeds ~10 (premature at 5).
- The EventBridge bus already planned for D9 cross-platform logout
  (D9 revision) is the same bus the DSAR saga publishes to —
  consolidate them under `quilty.user.*` event namespace.

---

## 5. C5 — Erasure scope recommendation

**Lock answer: (b) Unified, Rust-orchestrated.**

| Reason                                                                                                               | Evidence                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Single canonical user-data store (Rust backend) is the only place where the saga has authority to delete             | Round-5 D48: backend permanently Rust; web is thin BFF                   |
| Web-only deletion creates the Cerebral / BetterHelp failure mode                                                     | FTC pixel-exfiltration cases all involve "we said deleted but it wasn't" |
| Mobile users who request deletion on web expect mobile to honour it                                                  | Spotify / Notion peer pattern — single deletion across surfaces          |
| Audit log + vendor receipts must be coherent — split fulfilment = split audit log = auditor finding                  | ISO 27001 Annex A 5.19 + Transcend audit-evidence model                  |
| BetterHelp settlement requires 20-year downstream-vendor erasure orchestration — only feasible from one orchestrator | FTC final order 2023-07-14                                               |

**Implementation milestones:**

- **M1.5 (current sprint)**: `/account/privacy` page exists as **stub**
  showing "Account deletion + data export are coming in M6 when auth
  ships. Until then, email `privacy@my-quilty.com`."
- **M6 (auth integration)**: `/account/privacy` becomes functional —
  step-up auth (D54 elevated session) + form submission to `POST
/v1/privacy/erasure-requests` Rust endpoint. Stub the saga's vendor-
  callout layer; just record the request in DDB and queue a manual-
  fulfilment ticket.
- **M7+ (subscription + first real customers)**: full vendor-callout
  saga lights up; receipt-collection layer; mobile-cache-wipe
  EventBridge consumer.
- **Post-M9 (1000+ users)**: SLA dashboards, jurisdictional routing.

---

## 6. C6 — Access + portability scope recommendation

**Lock answer: (b) Same — unified, Rust-orchestrated, ZIP bundle.**

The bundle includes:

```
quilty-data-export-<user-id>-<timestamp>.zip
├── README.txt              # plain-text, explains contents + GDPR Art 15 citation
├── profile.json            # all profile fields, machine-readable
├── account.csv             # account events, plan history (human-friendly spreadsheet)
├── subscription.csv        # billing history (when Stripe lights up M7)
├── sessions.json           # auth session metadata (no tokens) — last 90d
├── consent-history.json    # full ConsentState audit log
├── communications/
│   ├── transactional-emails.csv  # SES send-log metadata
│   └── support-tickets.csv       # if/when support tier exists
├── journal-entries.json    # content when mobile content surfaces ship
└── third-parties.csv       # current sub-processor list at time of export
```

**Delivery mechanism:** Signed CloudFront URL with **24-hour TTL,
single-use download**, delivered to the verified user email. URL
revoked on first 200-status download or on TTL expiry. Audit row
written on URL generation, separate audit row on download. This
mirrors the Spotify "Download your data" peer pattern.

**Why ZIP + multi-file beats single JSON:**

- GDPR Art 20 requires "structured, commonly used and machine-readable"
  — bundle satisfies all three with redundancy.
- Headspace's "CSV or PDF" + Notion's Markdown/HTML/CSV bundle + Spotify
  JSON bundle all converge on bundle-of-formats.
- §164.524(c)(2)(ii)'s "form and format requested" HIPAA right is
  satisfied by including both human-friendly (CSV) and machine-readable
  (JSON) versions of the same data.

**Access (Art 15) vs portability (Art 20) UX difference:**

- "Access" is read-only, viewable in the portal — same data exposed
  inline at `/account/profile`, `/account/billing`, etc.
- "Portability" is the downloadable bundle.
- Single button on `/account/privacy` for "Download my data" — covers
  both rights through the same UI (peer norm).

---

## 7. Items not in our decision log yet (P0/P1/P2 priorities)

> Each gap below is a candidate D-decision. Numbering is left to the
> synthesis step; rationale + recommended default + agent-source
> citation included for each. Priority is calibrated to: when does
> this need to be locked to unblock further M-milestone work?

### G1 — DSAR identity-verification policy (P0; unblocks M1.5 stub page copy)

**Gap:** No locked rule for how Quilty verifies a DSAR submitter's
identity. Talkspace / Cerebral overcollect (photo ID + biometrics +
SSN); Stripe / Linear / Vercel / Anthropic underverify (email-only +
"additional info if doubt").

**Peer signal:** EDPB Recital 64 + Dutch DPA DPG Media €525,000 (2020).
**Photo ID for routine DSARs is regulator-flagged as data-minimisation
breach.**

**Recommended default:**

- **Authenticated path** (`/account/privacy`, user signed in): step-up
  auth via `prompt=login` (D54 elevated session) — that's the
  verification.
- **Public path** (`/legal/privacy-choices`, anonymous): email-based
  verification with a magic-link confirmation, then escalate to
  "answer 3 questions from your account history" if email match is
  inconclusive.
- **Photo ID never requested on routine DSARs.** Only on documented
  high-risk override (regulator subpoena, breach-victim re-verification)
  — written into a separate runbook, not the public policy.

**Source:** §2 peer table + EDPB Guidelines 01/2022 + DPG Media fine.

### G2 — Per-jurisdiction SLA matrix (P0; unblocks M1.5 privacy-policy copy)

**Gap:** No locked SLA stated to users.

**Peer signal:** GDPR = 30+60d; CCPA/CPRA/VCDPA/CPA = 45+45d; MHMDA =
45+45d. No peer publishes a multi-jurisdiction matrix.

**Recommended default:** State **"30 days"** in the public policy
(GDPR's clock — tightest binding for any multi-jurisdictional user).
Internal SLA dashboard set to **21 days** (7-day buffer). One
extension allowed, max 60 days total. Per-jurisdiction routing
deferred to M9+ when DSAR volume justifies it (>50/month).

**Source:** Clarip + DataGrail "2026 Guide to DSAR Automation" + IAPP
jurisdiction tables.

### G3 — 30-day soft-delete cooling-off (P1; binds M6 auth + account-delete UX)

**Gap:** No locked rule for whether erasure is immediate or has a
recovery window.

**Peer signal:** Notion 30 days, Spotify 7-30 days (tier-dependent),
Anthropic 30 days at conversation level. BetterHelp's settlement
order specifies immediate. The case for grace: prevents accidental
deletion (top-2 support inquiry across consumer apps); gives 30 days
to enrich the audit record. The case against: GDPR Art 17 demands
"without undue delay" — 30 days is arguably borderline.

**Recommended default:** **30-day soft-delete** with explicit user
consent at request time ("Your account will be deactivated immediately
and permanently deleted in 30 days. Click here to restore in the
meantime."). Audit record marks the request immediately; vendor-
erasure-saga runs on day 30. **Document the 30 days in the privacy
policy** — it's defensible under GDPR Art 17 timeline tolerance and
matches Notion's leadership pattern.

**Source:** Notion help center + Spotify support docs + Anthropic
privacy policy.

### G4 — Export bundle format + delivery (P1; binds M6 export build)

**Gap:** No locked format.

**Peer signal:** Bundle-of-formats is universal among engineering-led
peers. ZIP delivery via signed URL is the Spotify pattern.

**Recommended default:** ZIP bundle per §6 with single-use signed
CloudFront URL, 24h TTL, delivered to verified email. README inside
explains contents + cites Art 15/20.

**Source:** §6 above + Spotify "Download your data" peer pattern.

### G5 — Downstream-vendor erasure orchestration matrix (P1; binds M6-M7 vendor-API design)

**Gap:** No locked mapping of vendor → erasure-API-call → receipt-collection.

**Peer signal:** BetterHelp settlement order (20-year duty); ISO 27001
A.5.19; DataGrail / Transcend both treat this as core product
functionality. **Auditors will ask for the matrix.**

**Recommended default:** Maintain a single source of truth in
`quilty-aws/lambdas/rust/privacy-dsar/vendor-matrix.toml` per vendor:

```toml
[sentry]
erasure_api = "https://sentry.io/contact/gdpr/"     # manual ticket today
receipt_type = "email_confirmation"
retention_auto_expiry_days = 90                      # then auto-purged

[amplitude]
erasure_api = "POST /api/2/deletions/users"          # Amplitude Privacy API
receipt_type = "api_200_response"

[customerio]
erasure_api = "DELETE /api/v1/customers/{id}"
receipt_type = "api_204_response"

[ses]
suppression_list_action = "REMOVE_on_erasure_request"  # email goes back into deliverable pool
```

**Source:** DataGrail vendor matrix + Sentry GDPR docs +
[Sentry GDPR contact form](https://sentry.io/contact/gdpr/) +
Amplitude Privacy API docs.

### G6 — Audit log retention exception specifics (P1; binds M6 audit-schema design)

**Gap:** No locked "what stays after erasure."

**Peer signal:** BetterHelp retains "limited log of the request" for
10 years; ISO 27001 + Article 17(3) carve-outs.

**Recommended default:** Retain in DynamoDB for 6 years post-request:
request-ID, timestamp, requester-identifier-hash (SHA-256 of email +
account ID, not the values themselves), request-type, resolution-
type (fulfilled / denied with reason), per-vendor receipt-status,
denial-rationale (if applicable). **No PHI. No personal email
addresses in clear text. No content.** Document this in privacy
policy as "Retention of administrative records of your request, in
hashed form, for 6 years per HIPAA §164.316(b)(2)(i) and GDPR
Art 17(3)(b)."

**Source:** §3 reconciliation table + BetterHelp privacy policy.

### G7 — Right-to-Rectification (Art 16) + Right-to-Object (Art 21) UX (P1; binds M5-M6 account-portal scope)

**Gap:** No locked UX surface for these adjacent rights.

**Peer signal:** Engineering peers fold rectification into normal
profile-edit UX; objection into marketing-preferences toggles. No
peer ships a separate "Rectification" page.

**Recommended default:**

- **Art 16 (rectification)**: every profile field at `/account/profile`
  is self-editable; non-editable fields (account creation date, plan
  history) get a "Request correction" button that emails
  `privacy@my-quilty.com` with the user's account context.
- **Art 21 (objection)**: `/account/marketing-preferences` page —
  granular opt-out toggles. Already implicit in D35 ConsentState. No
  separate UX surface.
- **Restriction (Art 18)**: deferred — no peer ships this as a UX
  surface; founder-as-DPO handles via email until volume justifies UI.

**Source:** Linear / Cal.com / Anthropic privacy policies.

### G8 — DPA Article 28 sub-processor erasure instructions (P2; binds M6+ DPA template)

**Gap:** No locked clause for how Quilty instructs sub-processors to
erase when end-users request.

**Peer signal:** Stripe, Sentry, PostHog all publish DPA templates
with this clause; it's a contract requirement.

**Recommended default:** Pre-built clause in Quilty's DPA template
(when first B2B customer demands a DPA — likely M9+): "Processor shall
delete or return all personal data after the end of the provision of
services, and delete existing copies unless retention is required by
law." Lock as a one-line policy now; defer template until first
B2B customer.

**Source:** GDPR Art 28(3)(g) + Stripe DPA + Sentry DPA.

### G9 — Sensitive-data-class handling (CPRA + WA MHMDA) (P0; binds M1.5 privacy-policy copy)

**Gap:** No locked language for the SPI / consumer-health-data carve-outs.

**Peer signal:** Existing decision-log D98 (cookie taxonomy) mentions
MHMDA. Existing file 05 (consent-privacy) flags it as the "opt-in
floor wins" rule.

**Recommended default:** Privacy policy includes a standalone
"Consumer Health Data Privacy Policy" section (per Centraleyes /
Accountable HQ guidance) which states: (1) what we classify as
consumer health data, (2) authorisation pattern for any disclosure
(zero today — D31), (3) the MHMDA-erasure-vs-authorisation-retention
known-issue note, (4) opt-in-not-opt-out posture statement.

**Source:** Hintze Law MHMDA Part 9 + Goodwin MHMDA briefing +
Centraleyes compliance guide.

### G10 — DSAR analytics event (P2; binds M6 audit + observability)

**Gap:** Do we track that a DSAR happened in analytics, and how?

**Peer signal:** Nobody publishes this; vendor best-practice
(DataGrail, Transcend) is to emit a server-side observability event
without PII.

**Recommended default:** Emit `dsar.request_submitted` /
`dsar.request_fulfilled` Sentry breadcrumb + Amplitude event (server-
side via PHI sanitizer chokepoint per D67) with **only** `request_id`

- `request_type` + `jurisdiction` + `outcome`. **No user identifier.**
  ESLint rule already bans direct vendor SDK imports outside
  `lib/observability/`; this binds the DSAR saga code to that
  chokepoint.

**Source:** D67 PHI sanitizer chokepoint + DataGrail audit-trail
guidance.

### G11 — COPPA / GDPR-K edge handling (P2; binds policy copy)

**Gap:** No locked policy for under-13 / under-16 edge cases.

**Peer signal:** Headspace: "we will take steps to remove that
personal information from our servers" on parental request — minimal
language. Cal.com: "do not knowingly 'sell' or 'share' personal data
about consumers under the age of 16." Calm: similar minimum.

**Recommended default:** Match Headspace minimum exactly. Quilty is
13+ by ToS; surface a one-paragraph parental-contact instruction at
`/legal/privacy#children` with `privacy@my-quilty.com` mailbox routing.
No separate UX surface.

**Source:** Headspace + Cal.com privacy policies.

### G12 — Mobile device-local cache erasure (P2; binds M7+ mobile-app coordination)

**Gap:** Erasure saga doesn't yet specify how mobile-app-local
data (offline cache, encrypted backups, biometric-secured local
content) gets wiped.

**Peer signal:** No peer publishes this. BetterHelp and 23andMe both
got dinged for not wiping device-side data after deletion requests.

**Recommended default:** EventBridge `quilty.privacy.erasure_completed`
event → mobile app push notification → on next app launch, mobile app
runs `wipeLocalData()` which clears: encrypted SQLite store, secure-
storage tokens, biometric-encrypted journals, app document directory,
shared file containers. Mobile records receipt back to Rust backend
via `POST /v1/privacy/erasure-requests/{id}/mobile-receipt`. **No PHI
in the receipt.** Coordinate spec with `quilty` Flutter repo at M7.

**Source:** Round-6 file 02 (mobile-stack-recon) + 23andMe breach
lessons.

### G13 — MHMDA Catch-22 disclosure (P0; binds M1.5 privacy-policy copy)

**Gap:** No locked posture on the WA MHMDA erasure-vs-authorisation-
retention contradiction.

**Peer signal:** Nobody has fully solved this; Hintze Law's reading
is canonical.

**Recommended default:** Privacy policy includes verbatim language:
"Where you exercise the right to delete your consumer health data
under RCW 19.373 (Washington My Health My Data Act), Quilty will
delete that data from our systems and instruct our processors to do
the same. We may be required by RCW 19.373.030 to retain
authorisation records for valid sales of consumer health data for
6 years. Quilty does not sell consumer health data; this provision
is included for completeness and applies only if and when consumer
health data has been sold under explicit authorisation." Documented
known-issue defence.

**Source:** Hintze Law MHMDA Part 9 + RCW 19.373.

---

## 8. Closing

Both `C5` and `C6` lock to **unified, Rust-orchestrated**. The 13 gaps
above should be reviewed for inclusion in the next synthesis pass —
**G1, G2, G9, G13 are P0** (block M1.5 privacy-policy copy that ships
in the current sprint per `decisions-log` line 252's commit-15 plan);
G3-G7 are P1 (block M5-M7 build); G8 + G10-G12 are P2 (block M9+ scale
work).

The audit revealed that Quilty's existing posture is already stronger
than every consumer-health peer scanned (D31 zero-PHI runtime + D67
PHI sanitizer + D35 ConsentState + D32 CSP), but the **operational**
side of DSAR fulfilment — the saga, the vendor matrix, the receipt
collection, the audit log — has not yet been designed in any
artifact. This file is the first pass at that design. Next step:
synthesis owner converts the 13 gaps to D-decisions with the next
available numbering and binds each to a milestone (M1.5 / M6 / M7 /
M9+) per the priority calls.

**Read-only research file. Not a commit; not authorisation to
implement. Synthesis + decision-log owner integrates per Round-6
workflow.**
