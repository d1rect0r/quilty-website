# ADR-0025: Cessation data retention schedule + research carve-out + portability + deletion + DSAR pipeline shape

- **Status:** Accepted
- **Date:** 2026-05-28
- **Last reviewed:** 2026-05-28
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** 2026-05-28 multi-agent research pass + reconciliation lock. ADR-0023 set the regulatory classification; ADR-0024 set the multi-state CHD baseline; this ADR commits the data-lifecycle shape that satisfies MODPA Section 14-4708 data-minimization + MHMDA Section 2(6) deletion-on-request + CMIA AB-2089 retention disclosure + GDPR Art 17 (Phase 1 trigger) — while preserving an explicit, narrow research-data path for evidence-base claims (ADR-0023 Decision D).
- **Related decisions:** D31 (zero PHI in website runtime), D67 (PHI sanitizer chokepoint), D113 (8-piece form pattern), **D178a** (this ADR's canonical decision)
- **Related ADRs:** [ADR-0013](0013-phi-scrubber-port.md), [ADR-0021](0021-workflow-engine-port.md), [ADR-0023](0023-vaping-cessation-regulatory-classification.md), [ADR-0024](0024-multi-state-chd-posture.md)
- **Software versions assumed:** Next.js 16, DynamoDB, AWS Step Functions Express + Standard hybrid (workflow port, ADR-0021); Quilty's PHI sanitizer (D67)

## Context

Cessation data has a distinctive lifecycle profile compared to general consumer data:

1. **Engagement data has decreasing utility over time** to the user (a 14-day-old craving log is rarely revisited) but **enduring utility for research aggregates** (longitudinal cessation curves require multi-year data). The two purposes pull retention in opposite directions.
2. **MODPA Section 14-4708** mandates data minimization including retention minimization: "shall not collect, process, share, or retain personal data... for longer than is reasonably necessary for the purpose."
3. **MHMDA Section 2(6)** requires deletion-on-request with no exception for "legitimate business interest"; the request must be honored within 30 days; the deletion must propagate to processors (= our subprocessors).
4. **CA CMIA AB-2089** requires retention disclosure to users for any "mental health application information."
5. **GDPR Art 17** (Phase 1 trigger) requires erasure within 30 days; Art 89 carves out scientific research but only with technical/organizational safeguards.
6. **Account-deletion vs data-deletion distinction** — users may delete their account but want quit-streak preserved for a future return (matches Smoke Free / Pivot UX); or vice versa. The two must be independently controllable.
7. **DSAR pipeline ergonomics** — ADR-0021's WorkflowEngine port (TW-013) was designed for this; this ADR locks the DSAR workflow shape.

The 2025-2026 enforcement vector that materially raises the stakes: **Cerebral's $7M FTC settlement (April 2024)** explicitly cited "retained data beyond stated purpose" as a violated commitment + **GoodRx's $1.5M FTC settlement (February 2023)** cited inadequate deletion-on-request execution. Both translate directly to retention schedule + DSAR pipeline rigor. **GoodRx had a deletion-request UI but no actual backend pipeline** — the request UI was the FTC's exhibit A. This is the failure mode this ADR forecloses.

A specific high-risk variant: **research data**. Cessation peers (Pivot, Pelago, EX Program) all publish efficacy claims backed by their own retained data ("70% quit-rate at 12 weeks"). If Quilty wants to make any evidence-based positioning claim at M4+, it needs either (a) third-party RCT data, or (b) its own retained research data with explicit research-consent UX. This ADR commits the (b) shape now so that the research-claims path is not blocked by a wrong-default retention schedule.

The "do nothing" outcome: retention defaults end up vendor-driven (DynamoDB indefinite; PostHog 7-year default; Sentry 90-day default; Customer.io indefinite) → each subprocessor's retention is a separate compliance argument → DSAR pipeline is "delete from primary table" without subprocessor propagation → first DSAR FTC inquiry costs $1.5-7M (GoodRx + Cerebral precedent). Marketing copy at M4 ("70% quit at 12 weeks") is then either unsubstantiated (FTC §5 exposure) or substantiated by data the user can't retroactively opt out of (GDPR Art 17 + MODPA exposure).

## Decision

**Quilty operates a four-tier cessation data retention schedule (Operational / Account / Research / Marketing) with independent deletion controls, an explicit research-consent UX gating any data flow into the research tier, a DSAR pipeline implemented on top of the WorkflowEngine port (ADR-0021) using the Step Functions Standard adapter for durability, full subprocessor propagation via webhook + reconciliation queue, and a 30-day deletion-on-request SLA across all tiers.**

### Decision A — Four-tier retention schedule

| Tier            | Examples                                                                                                                           | Retention default                                                                         | User-deletable                                                                        | Survives account deletion?                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Operational** | Session records, CSRF tokens, opaque session IDs, rate-limit buckets, audit log of auth events                                     | 90 days rolling (auth events: 1 year per HIPAA Security Rule 45 CFR 164.312(b) precedent) | No (security)                                                                         | Yes — wiped at account deletion + 30-day grace |
| **Account**     | User profile, preferences, quit-streak, achievements, craving log, mood/trigger tags, in-app messages                              | Indefinite while account active; 30 days after account closure; user can wipe at any time | Yes (per field + bulk)                                                                | No — wiped at account deletion + 30-day grace  |
| **Research**    | De-identified, k-anonymized (k≥5), structured cessation-event data (quit attempts, durations, trigger categories, demographic bin) | 5 years rolling from event date; aggregate publications never expire                      | Source records: yes (drops them from research tier); aggregates: no (published forms) | Source records: deleted; aggregates: retained  |
| **Marketing**   | Email subscription state, lifecycle-campaign state, conversion attribution, A/B exposure                                           | 90 days inactive → archived; 1 year inactive → deleted; unsubscribe is immediate          | Yes (CAN-SPAM + per-tier toggle)                                                      | Yes — wiped at account deletion + 30-day grace |

**Operational tier rationale:** 90 days matches CloudWatch standard tier (D42d) + matches WA MHMDA "reasonably necessary" + matches MODPA minimization. Auth events at 1 year is the HIPAA Security Rule audit-log precedent.

**Account tier rationale:** Indefinite-while-active matches Smoke Free / Pivot / This Is Quitting; 30-day grace at deletion allows undo (Cerebral cited "no undo window" as confusing UX → FTC saw it as a dark pattern). MHMDA mandates 30 days max; the grace is within MHMDA window.

**Research tier rationale:** 5-year rolling matches NIH-funded research norms + Tobacco Control journal's de-identification standard + Cochrane review window. Aggregates "never expire" because they're already de-identified to k≥5 = no DSAR target exists. **Opt-in only** — see Decision C.

**Marketing tier rationale:** 90-day inactive matches HubSpot / Customer.io / Mailchimp engagement norms; 1-year-inactive deletion is more aggressive than CAN-SPAM requires but matches MODPA spirit + EU GDPR Art 5(1)(e) storage limitation principle.

### Decision B — Independent deletion controls (account-deletion ≠ data-deletion)

**Two independent UX surfaces:**

1. **"Delete my account"** — wipes Operational + Account + Marketing tiers + grace + subprocessor propagation. Research tier source records deleted unless user explicitly opts to keep them as a research contribution (UX confirm: "Keep your anonymized progress in the research dataset?").
2. **"Delete my data" (per-tier)** — granular per-tier deletion without account closure. Used by users who want to keep their account but reset their craving log (e.g., post-relapse clean slate).

Both surfaces accept partial scope (e.g., "delete only craving logs older than 90 days") and produce a confirmation email with an irrevocable confirmation link (matches Cerebral / Premom learnings — these are GoodRx's $1.5M failure mode).

### Decision C — Research-tier opt-in: explicit, granular, revocable

**Research data flow requires explicit opt-in at signup** (default OFF), with the UX:

> Quilty publishes anonymized aggregate research to help others quit. Would you like to contribute your progress to the research dataset?
>
> [ ] Yes — share my anonymized data
> [ ] No — keep my data to myself
>
> [Learn more about how we anonymize and use research data](link to research-data-policy.md)

The flag (`research_consent_granted_at`, timestamp + version) is stored on the user record. **Revocable at any time** — revocation drops the user's source records from the research tier (does NOT retract published aggregates, which are k≥5 by construction). Revocation propagates to research-tier subprocessors within 30 days.

**MODPA + MHMDA + GDPR Art 9 surface:** explicit, granular, separable from product consent, no bundling, no dark patterns. **FDA general-wellness ceiling:** research data flowing into a SaMD-claim path triggers reclassification (ADR-0023 Decision D); research-tier data may only support population-level cessation insights, not individual diagnosis/treatment recommendations.

### Decision D — DSAR pipeline shape

**Implemented on top of WorkflowEngine port (ADR-0021), Step Functions Standard adapter for durability + audit trail.**

DSAR workflow definition (the contract):

```ts
type DsarWorkflowInput = {
  readonly request_id: string; // ULID
  readonly user_id: string;
  readonly request_type:
    | 'access' // export of all CHD held about user
    | 'deletion' // full-account delete
    | 'tier_deletion' // per-tier delete
    | 'opt_out' // sale/share/AI-training opt-out
    | 'correction'; // data correction
  readonly scope?: ReadonlyArray<DsarTierScope>;
  readonly request_received_at: string; // ISO-8601
  readonly state_residence: string; // for state-specific SLA
};

type DsarWorkflowOutput = {
  readonly request_id: string;
  readonly completed_at: string;
  readonly tiers_processed: ReadonlyArray<DsarTierResult>;
  readonly subprocessors_notified: ReadonlyArray<SubprocessorResult>;
  readonly delivery_artifact_uri?: string; // S3 URI for access requests; PHI never in workflow state (D177-D178 + ADR-0021)
};
```

**Workflow steps** (each a Step Functions task):

1. **Validate request** (verify user_id matches authenticated session; verify scope is well-formed)
2. **Audit-log the request** (CloudWatch + DynamoDB DSAR-audit table; 7-year retention per HIPAA Security Rule precedent — operational-tier auth-log analog)
3. **Tier dispatch** (parallel state) — one task per tier in scope; each task runs the tier's delete or export procedure
4. **Subprocessor notification fan-out** (parallel state) — webhook to PostHog, Sentry, Customer.io, Cognito; await ack within 7 days; failures enter the reconciliation queue
5. **Reconciliation queue drain** — daily Lambda inspects pending subprocessor confirmations; retries; alerts at 14 days, escalates at 21 days, completes at 28 days (under 30-day SLA)
6. **Confirmation email + Cognito notification** to user (uses verified address only; no PHI in subject line or first 200 chars per D67)
7. **Mark request completed** + emit `quilty.dsar.completed` EventBridge event for downstream audit
8. **Archive workflow execution token** to S3 (encrypted at rest, k-anonymized, 7-year retention as required by HIPAA Security Rule audit-log precedent)

**PHI handling per ADR-0021 + D177-D178:** workflow state I/O carries no raw PHI; payloads are S3 URIs only; CloudWatch log level is ERROR not ALL; state log is a PHI store if abused.

### Decision E — Subprocessor propagation (the GoodRx failure mode)

**For every subprocessor that holds CHD,** Quilty maintains:

1. **A delete-by-user-id webhook integration** OR documented SDK call (PostHog `personDelete`, Sentry `delete_user`, Cognito `AdminDeleteUser`, Customer.io `delete_customer`).
2. **A confirmation contract** — the subprocessor's API/webhook ack within 7 days; logged to the DSAR audit table.
3. **A reconciliation queue** for failures + a 30-day SLA escalation procedure.
4. **An annual reconciliation audit** — sample 1% of completed DSARs; verify subprocessor compliance by re-querying the subprocessor's data export API to confirm no residual records.

**Subprocessor list (locked at M1.6):** PostHog, Sentry, Customer.io (TW-005 activation), Cognito, AWS DynamoDB/S3 (primary stores). Adding a subprocessor requires updating the DSAR pipeline contract + DPA + ADR-0024 + this ADR's subprocessor table.

### Decision F — Retention disclosure UX (CMIA AB-2089)

**A dedicated `/retention-policy` route** (linked from `/privacy` + signup flow + settings/data) presents the four-tier schedule in user-readable form. Reuses the Decision A table format. Markdown source lives in `apps/web/content/legal/retention-policy.mdx`.

### Decision G — Deletion grace period UX

**30-day grace at account deletion** — the account enters a "deletion pending" state; user receives an email with cancel link; daily cron drops the account at day 30. **Two notification emails:** day 1 (confirmation + cancel link), day 25 (final notice). After day 30 the account is irrecoverable; restoration requires a fresh signup (matches Cerebral / Pivot Breathe / Pelago canon — Cerebral as FTC enforcement anchor; Pivot + Pelago as cessation-peer UX precedent).

### Decision H — Out-of-tier data: legal hold + breach investigation

**Two exceptions** to the retention schedule:

1. **Litigation hold** — under counsel direction, named accounts may be retained beyond schedule + outside DSAR. Tracked in a separate `litigation-hold` DynamoDB table; flagged in DSAR pipeline as a hold-override; user notified per state law (varies). Trigger: written counsel direction only.
2. **Breach investigation hold** — incident response may freeze deletion for up to 90 days during forensic investigation; FTC HBNR notification supersedes.

Both holds are audit-logged with named human approval (founder + counsel at Phase 0; CISO + counsel at Phase 1+).

## Consequences

### Positive

- **GoodRx failure mode closed.** DSAR pipeline is durable + audit-logged + subprocessor-propagated; the "deletion UI but no backend" trap is structurally impossible.
- **Research-claims path preserved.** Quilty can make evidence-based positioning claims at M4+ backed by its own data — with an explicit opt-in UX that survives MHMDA + MODPA + GDPR scrutiny.
- **Cerebral failure mode closed.** Retention schedule + deletion grace + subprocessor propagation match the controls Cerebral was found to have violated.
- **DSAR pipeline reuses ADR-0021 WorkflowEngine port** — Step Functions Standard adapter is the right tool; in-memory fake supports contract tests at M1.6+.
- **Litigation + breach holds are first-class** rather than ad-hoc; counsel + auditors can locate them via a single table.

### Negative / Trade-offs

- **Subprocessor propagation costs ~1-2 days engineering per new subprocessor.** Mitigation: subprocessor list is locked at M1.6; additions require ADR amendment.
- **30-day grace creates an "I want to delete now" UX edge case** where a user demands faster deletion. State law (WA MHMDA / MD MODPA) caps at 30 days; can't go shorter without an irrevocable click that some users will regret. Acceptable trade-off.
- **Research-tier opt-in default OFF reduces research dataset size at M4+.** Mitigated by lifecycle-marketing prompt at day 30 + day 90 + day 365 to re-offer the opt-in (with the same explicit UX).
- **Annual reconciliation audit** is non-trivial ops cost (~1 day/year/subprocessor). Acceptable.

### Neutral

- **CloudWatch + DynamoDB DSAR-audit table at 7-year retention** is a new specific use of D42d — server-side, zero-PHI, mapped per D67. No PHI in audit logs; only request metadata + opaque user IDs.
- **GDPR Art 89 research carve-out is unused** at Phase 0 (no EU users); the structure exists for Phase 1.

## Alternatives considered

### Alternative A: Single retention tier with bulk delete

- **What it is:** All data has one retention default (e.g., 30 days post-account-closure); single delete-all UX.
- **Why rejected:** Breaks research-claims path; doesn't match cessation-app UX norms (quit-streak survives across periods of disengagement); doesn't satisfy MODPA's "purpose-limited retention" semantics.

### Alternative B: Vendor-default retention

- **What it is:** Accept each subprocessor's default retention; document but don't override.
- **Why rejected:** GoodRx + Cerebral failure mode. Subprocessor defaults are vendor-favorable, not user-favorable; MHMDA + MODPA require user-favorable defaults.

### Alternative C: Research-tier opt-out (instead of opt-in)

- **What it is:** Default ON; user can opt out at signup or later.
- **Why rejected:** WA MHMDA + MD MODPA + GDPR Art 9 all classify research as a "sharing/processing purpose beyond providing the product" — requires opt-in. FTC §5 deceptive-claims exposure if user reasonably believes their data won't be aggregated.

### Alternative D: Synchronous DSAR pipeline (no workflow engine)

- **What it is:** DSAR runs inline in an API route; user waits for confirmation; failures retry inline.
- **Why rejected:** Subprocessor latency (Sentry + PostHog webhooks are 1-7 days); reconciliation requires durable state; ADR-0021 WorkflowEngine port is the right primitive. Synchronous DSAR is the GoodRx failure mode.

### Alternative E: 7-year retention floor (HIPAA Security Rule audit-log analog)

- **What it is:** All tiers retained 7 years to match HIPAA precedent.
- **Why rejected:** Direct conflict with MODPA Section 14-4708 + MHMDA Section 2(6). HIPAA Security Rule applies only to operational audit logs, not user-facing data; auth-log tier already at 1 year.

## Compliance / Verification

- **DSAR pipeline integration test** (M5+, when first WorkflowEngine definition lands per TW-013): end-to-end test of access + deletion DSAR types across all four tiers + subprocessor propagation.
- **Subprocessor reconciliation audit** (annual, post-launch): sample 1% of completed DSARs; verify subprocessor compliance.
- **Retention schedule validation cron** (post-launch): daily Lambda inspects records past retention; alerts on overages; auto-deletes after 24h grace.
- **Research-consent flag invariant** (Vitest): research-tier writes must check `research_consent_granted_at IS NOT NULL`; tested via composition-root contract.
- **Litigation-hold audit** (quarterly, post-launch): manual review of `litigation-hold` table; verify all entries have counsel approval + user notification (where state law requires).
- **DSAR audit-log inspection** (annual): sample 50 DSARs; verify audit-log completeness + 7-year retention.
- **Day-30 cancel-link cron** (post-launch): verifies the cron fires + cancel-link emails are sent.

## Revisit triggers

- **First DSAR request received** — full pipeline activation; first end-to-end audit. (Tracked: TW-013.)
- **First subprocessor added or removed** — ADR amendment + pipeline contract update.
- **First research publication using Quilty data** — Decision C UX validation against publication's de-identification methodology.
- **Annual subprocessor reconciliation finding** — any subprocessor fails to honor DSAR within SLA → contract escalation + ADR amendment.
- **GDPR Art 89 research carve-out invoked** (Phase 1) — research methodology audit + DPO sign-off.
- **State CHD law amendment** changing retention floor or DSAR SLA — full schedule review.
- **FTC HBNR enforcement action against a cessation peer** (Pivot, Pelago, EX Program, 2Morrow) — full retention audit.

## References

- MODPA Section 14-4708 data minimization: <https://mgaleg.maryland.gov/2024RS/bills/sb/sb0541E.pdf>
- WA MHMDA Section 2(6) deletion-on-request: <https://app.leg.wa.gov/RCW/default.aspx?cite=19.373>
- CA CMIA AB-2089 retention disclosure: <https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202120220AB2089>
- GDPR Art 17 erasure + Art 89 research carve-out: <https://gdpr-info.eu/art-17-gdpr/> / <https://gdpr-info.eu/art-89-gdpr/>
- HIPAA Security Rule 45 CFR 164.312(b) audit-log precedent: <https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.312>
- FTC GoodRx settlement (deletion-pipeline failure mode, $1.5M, 2023-02): <https://www.ftc.gov/news-events/news/press-releases/2023/02/ftc-enforcement-action-bar-goodrx-sharing-consumers-sensitive-health-info-advertising>
- FTC Cerebral settlement (retention-beyond-purpose, $7M, 2024-04): <https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-action-leads-7-million-judgment-against-cerebral-failing-secure-sensitive-consumer-data>
- CAN-SPAM Act compliance: <https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business>
- W3C ULID spec: <https://github.com/ulid/spec>
- AWS Step Functions Express + Standard hybrid: <https://docs.aws.amazon.com/step-functions/latest/dg/concepts-standard-vs-express.html>
- Cochrane review on cessation aggregates: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12645533/>
- _Nicotine & Tobacco Research_ 2025 vaping-cessation systematic review: <https://academic.oup.com/ntr/article/27/2/169/7717604>
