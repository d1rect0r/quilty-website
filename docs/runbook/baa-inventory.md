# BAA inventory — vendor coverage surface

> **Decision reference:** D169 (BAA inventory placeholder; full inventory at the BAA-execute milestone)
> **Audience:** security + privacy lead; updates require legal sign-off

## Scope

Quilty's website tier sits in the `Workloads-NonHIPAA` OU after Phase 1 (today: `development` account, Phase 0). The PHI boundary lives in the **mobile** product (Flutter app + `quilty-aws` Rust backend), not the website. However, any vendor that COULD receive PHI in error — even through a misconfigured webhook, a stray analytics event, or a transactional email content drift — must hold a Business Associate Agreement (BAA) before it's loaded.

This document tracks which vendors currently hold BAAs vs. which are in negotiation vs. which the architecture has decided NOT to engage with. The Cerebral $7M lesson + Monument tracking-pixel cases established that BAA-by-claim (without execution) is not a defence.

## Status legend

- **EXECUTED** — BAA signed, in force, expiration tracked
- **PENDING** — BAA requested or in negotiation
- **REQUIRED-BEFORE-USE** — vendor cannot be wired in until a BAA is in force
- **NOT-PURSUED** — architectural decision to avoid the vendor entirely (no BAA required because the vendor never sees Quilty traffic)
- **OUT-OF-SCOPE** — vendor is consumed by the mobile/backend tier only; website tier has no surface

## Inventory (snapshot)

### Infrastructure + identity

The AWS BAA does not cover every AWS service — it covers only the services on the [AWS HIPAA Eligible Services](https://aws.amazon.com/compliance/hipaa-eligible-services-reference/) list, AND only in accounts where the BAA has been accepted (per-account, not per-organization). Each row below tracks one service that the website tier consumes; the BAA acceptance must be verified separately in EACH account that runs that service (today the `development` account; at Phase 1 cutover, the `marketing-prod` account).

| Vendor                     | Purpose                                         | Status       | Notes                                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AWS — Lambda               | Serverless compute (Next.js BFF runtime)        | EXECUTED     | On the HIPAA-eligible list; BAA acceptance must be verified per-account via AWS Artifact. The website's TS BFF runs here; PHI invariant enforced by `@quilty/security` sanitizer chokepoint            |
| AWS — Cognito (User Pools) | Managed Login + auth tokens (D6)                | EXECUTED     | On the HIPAA-eligible list; per-account BAA acceptance. Cognito User Pool tokens carry `email` + `cognito_sub` (patient-linkable identifier). Verify BAA acceptance in `development` + Phase-1 account |
| AWS — CloudFront           | CDN for marketing static + portal RSC streams   | EXECUTED     | On the HIPAA-eligible list; per-account BAA acceptance                                                                                                                                                 |
| AWS — DynamoDB             | Server-side session store (D51 opaque-ID)       | EXECUTED     | On the HIPAA-eligible list; per-account BAA acceptance                                                                                                                                                 |
| AWS — S3                   | Static asset hosting + future Velite output     | EXECUTED     | On the HIPAA-eligible list; per-account BAA acceptance                                                                                                                                                 |
| AWS — CloudWatch           | Structured logs (zero PHI by D42d)              | EXECUTED     | On the HIPAA-eligible list; per-account BAA acceptance. PHI invariant enforced by the `@quilty/security` sanitizer chokepoint                                                                          |
| Cloudflare (CDN)           | Originally proposed for marketing CDN; rejected | NOT-PURSUED  | D2 revised — SST + AWS native; Cloudflare CDN no longer in the stack. (Cloudflare Turnstile is a separate evaluation — see "Transactional surfaces" below.)                                            |
| Microsoft Entra            | Staff IdP                                       | OUT-OF-SCOPE | Entra is staff-only; never sees customer traffic                                                                                                                                                       |
| Porkbun                    | Domain registrar                                | NOT-PURSUED  | Registrar never sees traffic; no BAA needed                                                                                                                                                            |

### Observability + analytics

The web analytics vendor for the website tier is locked at D42b (revised Round 5) to PostHog Cloud Boost. Amplitude remains the mobile-tier vendor under a separate contract; the website's `makeAmplitudeAnalytics` factory is a transitional name retained for the transitional compose-root scaffolding and will be renamed at the PostHog activation milestone. (See ADR-0010 + the @quilty/observability port for the role-shaped vendor-agnostic API.)

| Vendor                 | Purpose                                        | Status              | Notes                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sentry (Business tier) | Error reporting + RUM + error-triggered Replay | REQUIRED-BEFORE-USE | Sentry offers a BAA on Business tier; must be in force before the marketing tier flips to non-default-deny consent                                                     |
| PostHog Cloud Boost    | Web analytics + replay + flags + experiments   | REQUIRED-BEFORE-USE | D42b Round-5 lock. PostHog offers a BAA on its paid Cloud Boost plan. The website tier consumes default-deny until BAA + consent are both green                        |
| Amplitude              | Mobile-tier analytics + experiments only       | OUT-OF-SCOPE        | Mobile-only per D42b Round-5. Separate contract managed by the mobile team; the website tier's adapter factory name is transitional and will be renamed at activation. |

### Transactional surfaces

| Vendor               | Purpose                                                                                   | Status              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS — SES            | Transactional email send (D31 scope: identity + auth + billing only, no clinical content) | REQUIRED-BEFORE-USE | On the HIPAA-eligible list since 2023; per-account BAA acceptance via AWS Artifact. Production-access sandbox lift + AWS BAA SES coverage both required before the `@quilty/email` SES adapter activates; see `dmarc-ramp.md`                                                                                                                                                                                                       |
| Stripe               | Subscription billing                                                                      | REQUIRED-BEFORE-USE | Stripe holds standard BAAs on a case-by-case basis for healthcare customers. The website collects payment method only (PCI scope through Stripe Elements, not the Lambda). **Critical scope note:** Stripe metadata fields (product names, statement descriptors, customer.description) MUST NEVER carry clinical PHI regardless of BAA status — the standard Stripe BAA covers payment-card + payment-metadata, not healthcare PHI |
| Cloudflare Turnstile | CAPTCHA on auth forms (separate product from Cloudflare CDN)                              | REQUIRED-BEFORE-USE | Turnstile is a distinct Cloudflare product; loading it routes request metadata (IP, device fingerprint, browser signals) through `challenges.cloudflare.com`. Cloudflare-CDN is NOT-PURSUED above; Cloudflare-Turnstile is a separate evaluation. Confirm BAA coverage before use; alternatives if BAA negotiation stalls: hCaptcha (offers BAA), AWS WAF CAPTCHA (under existing AWS BAA)                                          |

### Future / under evaluation

| Vendor             | Purpose            | Status  | Notes                                                                                             |
| ------------------ | ------------------ | ------- | ------------------------------------------------------------------------------------------------- |
| Sanity             | CMS (D30 trigger)  | PENDING | Engages only at the content-volume trigger; BAA required if any clinical content lands in the CMS |
| Zendesk / Intercom | Hosted help center | PENDING | The help center surface CAN carry PHI (user-submitted free text); BAA mandatory before launch     |

## Snapshot — sprint-close authority

This in-repo Markdown file is a **snapshot** of the current BAA
state for code-review traceability. The authoritative artefact
lives cross-repo at `quilty-aws/docs/legal/baa_inventory.md` per
D169 — the cross-repo §164.404 breach-notification SOP +
art_17_19_cascade.md + CC9_risk_mitigation.md all cite this
specific path. The spreadsheet form (`baa_inventory.xlsx`)
optionally lives alongside the .md at the same path for vendor-
audit filtering. Creation of the cross-repo artefact is a manual
user action tracked at `docs/runbook/m1.5-post-sprint-checklist.md`
item 2.

When the cross-repo spreadsheet exists, this Markdown snapshot
is updated at every M-milestone close + on vendor BAA status
changes; the spreadsheet remains the source of truth for vendor
audit + legal review.

### Column-schema note (snapshot vs authoritative)

This in-repo snapshot uses a **4-column shape** (Vendor /
Purpose / Status / Notes) optimised for human readability inside
a Markdown table. The cross-repo authoritative spreadsheet uses
the **14-column shape** specified at
`docs/runbook/m1.5-post-sprint-checklist.md` item 2 (9 baseline

- 5 enterprise-canon fields from the Stripe / Plaid 2024+ Vendor
  Risk Management standard: sub-processor location, vendor breach-
  notification SLA, BAA retention period, vendor SOC 2 Type II
  valid-until, vendor escalation contact). The narrowing here is
  deliberate — the snapshot trades audit-completeness for
  in-codebase legibility; the authoritative spreadsheet carries
  the full Vendor Risk Management surface.

## Review cadence

- **Quarterly:** legal + security walk the inventory + confirm executed BAAs are current + flag expiring ones
- **On every new vendor evaluation:** add a row + assign a status before any code references the vendor
- **On status change to EXECUTED:** the corresponding adapter in the codebase may activate (e.g., `makeSesEmailSender` skeleton becomes the real send path)
- **At sprint close:** update this Markdown snapshot + the cross-repo spreadsheet in lockstep. Sprint-close diff goes to legal review per the quarterly cadence above.

## What this document is NOT

This file does not duplicate the AWS BAA covered-services list (canonical source: AWS BAA portal in the master payer account). It tracks the SUPERSET — every third-party that Quilty Inc. has engaged or evaluated, including vendors not covered by the AWS umbrella.

PHI scope is enumerated in `docs/research/round_5_independent_review/` (the audit-frozen baseline). The `apps/web/lib/*` modules + the `packages/security/src/domain/sanitize.ts` denylist are the runtime enforcement of "what counts as PHI on the website tier."
