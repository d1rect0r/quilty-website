# Vendor erasure orchestration matrix

> **Decision reference:** D175 (per-vendor erasure orchestration spec) + D134 (Rust-orchestrated erasure) + Article 17(3)(b) GDPR (legal-obligation retention exception)
> **Audience:** privacy lead + on-call engineer fulfilling a DSAR (Data Subject Access Request) erasure
> **Companion docs:** `baa-inventory.md` (BAA status); `dsar-runbook.md` (operational fulfillment playbook); `apps/web/app/[locale]/(marketing)/legal/subprocessors/page.tsx` (public-facing sub-processor list)

## Purpose

When a Quilty user exercises Article 17 GDPR (right to erasure) — or the CCPA / WA MHMDA / Quebec Law 25 equivalent — the website tier does NOT issue vendor delete calls directly. Erasure is orchestrated by the Rust backend (D134) which fans out to each in-scope vendor's erasure API.

This matrix is the spec the Rust orchestrator implements against. Each row pins one vendor to: which API endpoint, which auth method, which fields identify the subject, which fields are deleted vs. redacted, which retention exception applies under Art 17(3)(b), and the current BAA status.

The website is in scope only insofar as it routes the request to the orchestrator and renders the SLA acknowledgment to the user.

## Identity mapping for erasure

The user identifier the website + portal expose is the Cognito `sub` (UUID). The backend must translate this to per-vendor identifiers before the fan-out:

| Vendor               | Vendor-side identifier                            | Translation source                                                                        |
| -------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| AWS — Cognito        | `cognito_sub` (UUID)                              | Identity carried directly                                                                 |
| AWS — DynamoDB       | `quilty_sub` (HMAC-pseudonymised cognito_sub)     | Derived deterministically via the HMAC chokepoint in `@quilty/security/pseudonymisation`  |
| AWS — CloudWatch     | n/a — logs are zero-PHI by D42d                   | No erasure needed; logs do not key on user identity                                       |
| Amplitude (mobile)   | `device_id` + `user_id` (Amplitude-assigned)      | Joined via the mobile-tier identity table; out-of-scope for the website-tier orchestrator |
| Sentry               | `user.id` (set on Sentry scope at session start)  | Set to `quilty_sub` at scope-setup; matches DynamoDB partition key                        |
| Cloudflare Turnstile | n/a — Turnstile does not persist user identifiers | Erasure is a no-op; the token exchange is stateless                                       |
| Microsoft 365 (SES)  | recipient `email` address                         | Pulled from Cognito User Pool attributes at orchestration time                            |
| Stripe (future)      | `customer.id` (Stripe-assigned `cus_...`)         | Stored on the subscription record once Stripe billing activates (M7+)                     |

## Matrix

### AWS — Cognito User Pool

| Field                          | Value                                                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Erasure API endpoint           | `AdminDeleteUser` (Cognito SDK)                                                                                                                                                                                                                        |
| Auth method                    | SigV4 from the Rust orchestrator's IAM role in the auth-prod account                                                                                                                                                                                   |
| Parameters                     | `UserPoolId` (from SSM), `Username` (cognito_sub)                                                                                                                                                                                                      |
| Fields deleted                 | Full user record: `email`, `email_verified`, `phone_number` (if set), all custom attributes, MFA enrollments, refresh tokens                                                                                                                           |
| Fields retained (Art 17(3)(b)) | None — Cognito has no clinical/transactional retention obligation                                                                                                                                                                                      |
| BAA status                     | EXECUTED (AWS BAA in the auth account)                                                                                                                                                                                                                 |
| Cross-effects                  | `AdminDeleteUser` invalidates all refresh tokens but does NOT publish a `quilty.auth.sessions_revoked` event — the orchestrator MUST publish to EventBridge separately so D9 fan-out reaches the web BFF session store + Rust backend revocation cache |

### AWS — DynamoDB (server-side session + consent stores)

| Field                          | Value                                                                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Erasure API endpoint           | `DeleteItem` on `quilty-session-store`, `quilty-consent-current`, `quilty-consent-audit`                                                                                                                                   |
| Auth method                    | SigV4 from the Rust orchestrator's IAM role                                                                                                                                                                                |
| Parameters                     | PK = `quilty_sub`; SK = appropriate per-table key                                                                                                                                                                          |
| Fields deleted                 | Session records (`quilty-session-store`): full delete. Consent current (`quilty-consent-current`): full delete                                                                                                             |
| Fields retained (Art 17(3)(b)) | Consent audit (`quilty-consent-audit`): RETAIN per Art 17(3)(b) — the audit log is a legal-obligation record under CCPA §1798.130 + GDPR Art 7(1) demonstrability requirements. Pseudonymise to `hashed_sub` after 30 days |
| BAA status                     | EXECUTED                                                                                                                                                                                                                   |
| Cross-effects                  | Session delete cascades naturally via TTL; explicit delete only required for active sessions                                                                                                                               |

### AWS — S3 (export-download bucket; D135 24h signed URL)

| Field                          | Value                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Erasure API endpoint           | `DeleteObject` on `quilty-export-{stage}` bucket                                                               |
| Auth method                    | SigV4 from the Rust orchestrator's IAM role                                                                    |
| Parameters                     | Object key = `exports/{quilty_sub}/{export_id}.json.gz`                                                        |
| Fields deleted                 | Full object delete + version delete (versioning enabled; delete-markers insufficient)                          |
| Fields retained (Art 17(3)(b)) | None on the export bucket                                                                                      |
| BAA status                     | EXECUTED                                                                                                       |
| Cross-effects                  | The signed CloudFront URL becomes 403 immediately upon object delete; the 24h TTL is upper-bounded by deletion |

### AWS — CloudWatch Logs

| Field                          | Value                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Erasure API endpoint           | n/a — logs are zero-PHI by D42d (`@quilty/security` sanitizer chokepoint enforces) and do not key on user identity                                  |
| Auth method                    | n/a                                                                                                                                                 |
| Parameters                     | n/a                                                                                                                                                 |
| Fields deleted                 | None per-user; logs roll off via the per-log-group retention policy (`log-retention.md`)                                                            |
| Fields retained (Art 17(3)(b)) | n/a                                                                                                                                                 |
| BAA status                     | EXECUTED                                                                                                                                            |
| Cross-effects                  | If a sanitizer leak ever surfaces user PII into a log (incident), the response is a log-group purge under incident playbook, not a per-user erasure |

### Amplitude (mobile-tier only)

| Field                          | Value                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Erasure API endpoint           | Amplitude HTTP API V2 User Deletion: `POST https://amplitude.com/api/2/deletions/users`                           |
| Auth method                    | HTTP Basic with API key + secret (rotated quarterly; stored in `quilty-1password`)                                |
| Parameters                     | `{ "user_ids": ["{amplitude_user_id}"], "requester": "{operator_email}" }`                                        |
| Fields deleted                 | All Amplitude events keyed on `user_id`; also covers `device_id` association via 30-day window                    |
| Fields retained (Art 17(3)(b)) | None — Amplitude has no retention obligation                                                                      |
| BAA status                     | PENDING — Amplitude Enterprise tier required for BAA; the website tier does NOT load Amplitude (D42b mobile-only) |
| Cross-effects                  | The website tier orchestrator routes only if a mobile-tier user existed; for website-only users this is a no-op   |

### Sentry (errors + RUM + replay)

| Field                          | Value                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Erasure API endpoint           | Sentry GDPR Tooling: `DELETE https://sentry.io/api/0/organizations/{org}/users/{user_id}/`                                                                    |
| Auth method                    | OAuth bearer with org-admin scope (rotated quarterly; stored in `quilty-1password`)                                                                           |
| Parameters                     | `user_id` = `quilty_sub` set on the Sentry scope at session start                                                                                             |
| Fields deleted                 | All events tagged with the matching `user.id`; replay sessions purged from blob storage within Sentry's 30-day SLA                                            |
| Fields retained (Art 17(3)(b)) | Aggregate error-frequency counters (non-personal; Sentry retains for SaaS analytics on its own infra)                                                         |
| BAA status                     | REQUIRED-BEFORE-USE — Sentry Business tier offers BAA; D165 explicit-request verification mandatory before consent flips off default-deny                     |
| Cross-effects                  | Replay blob deletion is asynchronous; the orchestrator should poll the Sentry deletion-status endpoint and wait for `complete` before closing the DSAR ticket |

### Amplitude (analytics + flags + experiments)

| Field                          | Value                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Erasure API endpoint           | Amplitude User Privacy API: `POST https://amplitude.com/api/2/deletions/users` (asynchronous job-based deletion; status polled via `GET https://amplitude.com/api/2/deletions/users/{request_id}`)                                                                                          |
| Auth method                    | API key + secret pair with org-admin scope (rotated quarterly; stored in `quilty-1password`)                                                                                                                                                                                                |
| Parameters                     | `user_ids` array containing `quilty_sub` set on the Amplitude identity at session start; `delete_from_org` boolean controls cross-project deletion                                                                                                                                          |
| Fields deleted                 | All event records keyed on `user_id`; user-property records; cohort memberships; experiment-exposure events. Session Replay product is not engaged (rejected per D68), so no replay-blob purge step is needed                                                                               |
| Fields retained (Art 17(3)(b)) | Aggregate cohort + funnel counters (non-personal, retained on the vendor's own analytics infra)                                                                                                                                                                                             |
| BAA status                     | REQUIRED-BEFORE-USE — Amplitude Enterprise tier offers BAA; pre-launch posture starts without BAA per the locked policy, upgrade pre-launch when PHI risk becomes real. D165 explicit-request verification mandatory before consent flips off default-deny                                  |
| Cross-effects                  | Deletion is asynchronous (24-72h SLA); the orchestrator polls the status endpoint and waits for completion before closing the DSAR ticket. The orchestrator additionally emits a client-side identity-reset signal via the analytics adapter (`reset()` semantics) at the same submit point |

### Cloudflare Turnstile (CAPTCHA token exchange)

| Field                          | Value                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Erasure API endpoint           | n/a — Turnstile does not persist user-keyed records                                                                                        |
| Auth method                    | n/a                                                                                                                                        |
| Parameters                     | n/a                                                                                                                                        |
| Fields deleted                 | None — the token exchange is stateless from a subject-rights perspective                                                                   |
| Fields retained (Art 17(3)(b)) | n/a                                                                                                                                        |
| BAA status                     | REQUIRED-BEFORE-USE (per `baa-inventory.md`)                                                                                               |
| Cross-effects                  | If Turnstile is replaced by hCaptcha or AWS WAF CAPTCHA, re-evaluate; AWS WAF CAPTCHA logs to CloudWatch and falls under the AWS row above |

### Microsoft 365 — SES (transactional email)

| Field                          | Value                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Erasure API endpoint           | SES does not retain content after send; suppression-list management via `PutSuppressedDestination` / `DeleteSuppressedDestination`              |
| Auth method                    | SigV4 from the Rust orchestrator                                                                                                                |
| Parameters                     | `EmailAddress` from Cognito attributes                                                                                                          |
| Fields deleted                 | Suppression-list entry (if any); SES sent-mail metadata rolls off via the CloudWatch log-group retention policy                                 |
| Fields retained (Art 17(3)(b)) | None on SES infrastructure; downstream Microsoft 365 mailbox retention is governed by the recipient's own M365 tenant (out-of-scope for Quilty) |
| BAA status                     | REQUIRED-BEFORE-USE                                                                                                                             |
| Cross-effects                  | Already-sent emails cannot be unsent; the DSAR fulfillment notice acknowledges this                                                             |

### Stripe (subscription billing — future, M7+)

| Field                          | Value                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Erasure API endpoint           | `Customer.delete` (Stripe SDK) — soft-deletes the customer record; PII fields are scrubbed but the financial transaction ledger is RETAINED                                                                                                                                                                        |
| Auth method                    | Stripe restricted-key with `customer:delete` permission                                                                                                                                                                                                                                                            |
| Parameters                     | `customer.id` (Stripe `cus_...`)                                                                                                                                                                                                                                                                                   |
| Fields deleted                 | `email`, `name`, `phone`, `address`, `description`, `metadata`                                                                                                                                                                                                                                                     |
| Fields retained (Art 17(3)(b)) | Charge records + invoice records + dispute records + tax-reporting records — RETAINED per Art 17(3)(b) for the duration of legal-obligation tax + financial-reporting periods (US: 7 years per IRS § 6501; EU: 10 years per most member-state VAT law). Stripe automates this scope correctly on `Customer.delete` |
| BAA status                     | REQUIRED-BEFORE-USE (case-by-case Stripe BAA for healthcare customers; D165 explicit-request verification mandatory)                                                                                                                                                                                               |
| Cross-effects                  | Future PaymentMethod records auto-cascade; future Subscription records cancel-then-soft-delete                                                                                                                                                                                                                     |

### Cognito (future) — Hosted help center (Zendesk / Intercom)

| Field  | Value                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Status | PENDING — vendor selection deferred to the help-center launch trigger; matrix entry will be authored at vendor-selection time |

## Failure modes + escalation

- **Vendor erasure API returns 5xx:** retry with exponential backoff (3 attempts); on exhaustion, the orchestrator records a `vendor_erasure_failed` event + the privacy lead receives a ticket. Manual fulfillment via vendor support is the fallback.
- **BAA status changes to NOT-EXECUTED mid-flight:** the orchestrator pauses + the privacy lead reviews. The user's DSAR clock pauses per GDPR Art 12(3) "without undue delay" + the user is notified of the operational interruption.
- **Identity translation fails:** the orchestrator falls back to email-keyed deletion for vendors that accept email; for UUID-keyed vendors, escalates to privacy-lead for manual fulfillment.

## SLA accounting

- The orchestrator's per-vendor timeouts roll up to the 45-day published SLA (D152). Internal targets are tighter: most vendors should complete within 24h; Sentry replay blob purge dominates the worst-case (~30 days from request).
- The user receives a single acknowledgment + a single completion notice; per-vendor confirmations are operational artifacts, not user-facing.

## Audit log

- Every orchestration run writes to `quilty-erasure-audit` (DynamoDB) keyed on `quilty_sub#timestamp` with per-vendor result codes. Retention: 6 years per D176.
- The audit log is itself subject to Art 17(3)(b) retention — it is the legal-obligation record demonstrating that erasure was fulfilled, and survives the user's account deletion in pseudonymised form.

## Review cadence

- **Quarterly:** privacy lead walks the matrix + confirms each vendor's API endpoint + auth scope is still current
- **On vendor change of status:** matrix updated atomically with the corresponding `baa-inventory.md` row
- **On new vendor onboarding:** matrix row authored BEFORE the vendor adapter activates; the activation gate is matrix-completion
