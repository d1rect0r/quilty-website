# DSAR fulfillment runbook

> **Decision references:** D99 (DSAR entry-points) + D134 (Rust-orchestrated erasure) + D135 (Rust-orchestrated export + 24h-TTL signed URL) + D151 (identity-verification anti-pattern) + D152 (per-jurisdiction SLA matrix) + D175 (vendor-erasure-orchestration matrix) + D176 (audit-log retention)
> **Audience:** privacy lead + on-call engineer fulfilling a Data Subject Access Request
> **Companion docs:** `vendor-erasure-matrix.md` (per-vendor erasure spec); `baa-inventory.md` (BAA status); `apps/web/app/[locale]/(marketing)/legal/privacy-choices/page.tsx` (public-facing rights summary); `apps/web/app/[locale]/(account)/account/privacy/page.tsx` (signed-in self-serve hub)

## Purpose

Operational playbook for fulfilling Data Subject Access Requests (DSARs) — GDPR Articles 15-22 + CCPA / CPRA equivalents + WA MHMDA + Quebec Law 25. Defines the SLA matrix, the identity-verification gate, the orchestration handoff to the Rust backend, the audit-log discipline, and the failure-mode + escalation procedure.

## Per-right SLA matrix (internal)

The **published** SLA on `/legal/privacy-choices` is a single conservative 45-day floor (D152). Internal targets are tighter and per-jurisdiction:

| Right                  | GDPR (EU/UK)                            | CCPA (CA)                 | WA MHMDA                | Quebec Law 25 |
| ---------------------- | --------------------------------------- | ------------------------- | ----------------------- | ------------- |
| Access (Art 15)        | 30 days, extendable to 90               | 45 days, extendable to 90 | 45 days                 | 30 days       |
| Rectification (Art 16) | 30 days                                 | 45 days                   | n/a (covered by access) | 30 days       |
| Erasure (Art 17)       | 30 days, extendable to 90               | 45 days, extendable to 90 | 45 days                 | 30 days       |
| Portability (Art 20)   | 30 days                                 | 45 days (under access)    | n/a                     | 30 days       |
| Objection (Art 21)     | 30 days; immediate for direct marketing | 45 days                   | n/a                     | 30 days       |

**Operational target:** acknowledge within 1 business day; fulfill simple cases within 7 days; complex orchestrations (involving the Rust backend's per-vendor erasure fan-out) within 30 days. The 45-day published floor is the legal ceiling, not the engineering target.

## Identity verification (anti-pattern guidance)

D151 forbids photo-ID-as-routine-DSAR-friction. The Dutch DPA fined DPG Media €525K for that pattern; EDPB Guidelines 01/2022 explicitly call it out as disproportionate.

| Request source                              | Verification                                                                                                                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed-in user                              | Existing authenticated session is sufficient for access + correction + opt-out. Destructive actions (export + delete) trigger Cognito `prompt=login` step-up (D54 elevated_until 5-min window) |
| Unsigned user                               | Single-use email-link token (24-hour TTL) sent to the email address on file. Token confirmation = identity proof for routine requests                                                          |
| Cognito email change pending                | Pause the DSAR clock + require the change to settle first (otherwise the export delivers to a not-yet-verified address)                                                                        |
| Account doesn't exist on the email provided | Confirm + close; we may not even hold data for that email. Do NOT escalate to ID verification — that would imply we hold data                                                                  |

**Photo ID is only acceptable** in the narrow case where (a) the request is for a deceased data subject's records, OR (b) the requestor cannot complete email verification AND the request is for a high-risk action (account delete + export for a minor's record, etc.), AND the privacy lead has personally approved the photo-ID exception in a written decision. The decision must reference D151 + the specific reason it doesn't apply.

## Orchestration handoff (the Rust backend)

The Rust orchestrator owns the cross-system erasure + export. The website tier surfaces DSAR affordances + records the audit trail + receives orchestration results. The website does NOT issue per-vendor delete/export calls directly.

```
[User] -> /account/privacy or privacy@my-quilty.com email
       -> Verification (session or email-link)
       -> Website tier: write DSAR ticket to quilty-dsar-tickets
                       + publish quilty.privacy.request_received to EventBridge
       -> Rust orchestrator: consume event
                            + per-vendor fan-out per vendor-erasure-matrix.md (D175)
                            + per-vendor result write-back to quilty-erasure-audit
                            + publish quilty.privacy.request_completed
       -> Website tier: consume completion event
                       + email user the resolution notice
                       + close ticket
```

**Export specifics (D135):** the orchestrator emits a 24-hour-TTL signed CloudFront URL pointing at the export object in `quilty-export-{stage}`. The URL is sent to the user via email; the website does NOT host the export itself + does NOT proxy the download. After 24h the object is deleted (per the vendor-erasure-matrix.md S3 row).

**Erasure specifics (D134):** the orchestrator fans out per the matrix. Cognito `AdminDeleteUser` invalidates refresh tokens but the orchestrator MUST also publish `quilty.auth.sessions_revoked` to EventBridge so the D9 fan-out reaches the web BFF session store + Rust backend revocation cache.

## Audit-log discipline (D176)

Every DSAR action writes to two tables:

1. **`quilty-dsar-tickets`** (per-ticket workflow state) — short-lived; deleted after 90 days of closed status
2. **`quilty-erasure-audit`** (per-vendor result codes, identity-pseudonymised) — retained 6 years (D176) keyed on `quilty_sub#timestamp`

The audit log is itself subject to Article 17(3)(b) retention — it is the legal-obligation record demonstrating fulfillment + survives the user's account deletion in pseudonymised form. Pseudonymisation happens within 30 days of the user's erasure completion: `cognito_sub` -> `hashed_sub` via the same HMAC chokepoint used elsewhere.

## Failure modes + escalation

| Failure                                                          | Response                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vendor erasure API 5xx                                           | Orchestrator retries with exponential backoff (3 attempts); on exhaustion, ticket flagged `vendor_erasure_failed` + privacy lead receives an ops alert. Manual vendor-support fulfillment is the fallback |
| BAA status changes to NOT-EXECUTED mid-flight                    | Orchestrator pauses; DSAR clock pauses per GDPR Art 12(3) "without undue delay"; user notified of the operational interruption                                                                            |
| Email-link verification not completed within 24h                 | Token expires; ticket closes with `verification_lapsed` status; user receives a follow-up offering re-verification                                                                                        |
| Identity-translation fails (no per-vendor identifier resolvable) | Orchestrator falls back to email-keyed deletion for vendors that accept email; UUID-keyed vendors escalate to privacy lead for manual fulfillment                                                         |
| Request is for clinical data we don't hold on the website tier   | Redirect to the mobile-product DSAR surface (the Rust backend owns the clinical data scope)                                                                                                               |
| Supervisory authority forwards a complaint                       | Privacy lead owns; treat as a parallel workflow with its own 30-day reply SLA (independent of the user's 45-day fulfillment SLA)                                                                          |

## Out-of-scope (clarifying boundaries)

- **Push notifications + email-marketing preferences** are handled via `/account/notifications` (not via DSAR). Article 21 (objection to direct marketing) is the immediate-effect path for those.
- **Cookie / consent preferences** are handled via the cookie banner + `ConsentStore.set(...)` Server Action. Not a DSAR ticket.
- **Stripe payment data** is in scope when Stripe activates (M7+). Until then, the orchestrator's Stripe-fan-out is a no-op.

## Review cadence

- **Quarterly:** privacy lead walks an active ticket end-to-end + confirms SLA targets met + reviews the audit table for retention drift
- **On any vendor change to BAA status or erasure API:** matrix updated atomically + this runbook's failure-modes table refreshed
- **Annually:** legal review of the SLA matrix against current EU + US enforcement guidance
