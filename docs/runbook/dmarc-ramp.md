# DMARC progressive-ramp runbook

> **Decision reference:** D117 (DMARC progressive enforcement)
> **Domain:** `my-quilty.com`
> **DNS authority:** Route 53 (production account, `quilty-aws/dns/` layer)
> **Sender authority:** AWS SES (development account at Phase 0; Workloads-NonHIPAA at Phase 1 cutover)

## Why progressive

`p=reject` from day one breaks legitimate first-week mail (welcome flows, password resets) the moment a misconfigured envelope-From or a transient SPF/DKIM key sync fails. The Gmail Feb 2024 + Yahoo bulk-sender rules require `p≥quarantine` for sustained delivery, but they DO NOT require Day-0 `p=reject`. A progressive ramp from `none` → `quarantine` → `reject` over ~6 weeks gives the report aggregator (RUA) time to surface misconfigurations before they bounce a real user's reset email.

## Why no `ruf=` (forensic reports)

RFC 7489 forensic reports include verbatim message header + body fragments from failed mail. On a HIPAA-aligned consumer vaping cessation surface (ADR-0023 + ADR-0024), even transactional email fragments (an `auth.my-quilty.com` MFA code, a password-reset link embedding a username) could land outside a BAA-covered channel if delivered to an unscoped mailbox. This runbook intentionally OMITS the `ruf=` tag — aggregate (`rua=`) reports are sufficient for the progressive-ramp diagnostic flow + RUF activation would require a BAA-covered SES-inbound + S3 pipeline with retention controls, which is out of scope for the ramp.

## Pre-flight

| Item                                                              | How to verify                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route 53 hosted zone for `my-quilty.com` exists                   | `aws route53 list-hosted-zones --profile quilty-prod`                                                                                                                                                                                        |
| SES sending domain identity created                               | `aws sesv2 list-email-identities --profile quilty-dev`                                                                                                                                                                                       |
| SES DKIM signing enabled (Easy DKIM, 2048-bit)                    | `aws sesv2 get-email-identity --email-identity my-quilty.com` — `DkimAttributes.Status == "SUCCESS"`                                                                                                                                         |
| SPF record exists (`v=spf1 include:amazonses.com -all`)           | `dig +short TXT my-quilty.com \| grep spf1`                                                                                                                                                                                                  |
| DMARC RUA mailbox monitored                                       | `dmarc-reports@my-quilty.com` aliased to the security team                                                                                                                                                                                   |
| `auth.my-quilty.com` Cognito Managed Login sending domain aligned | Cognito Managed Login email-sending SES configuration set passes `adkim=s; aspf=s` alignment under the parent domain (Cognito sends OTP / verification mail from `auth.my-quilty.com` — alignment must be verified BEFORE Phase 1 activates) |
| Rollback Terraform resource provisioned                           | `aws_route53_record.dmarc_rollback` resource exists in `quilty-aws/dns/` — required prerequisite for the Rollback section below                                                                                                              |

## Phase 0 — `p=none` (observation only, weeks 1-2)

DNS record:

```
_dmarc.my-quilty.com.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc-reports@my-quilty.com; fo=1; adkim=s; aspf=s; sp=none"
```

Strict alignment (`adkim=s; aspf=s`) from Phase 0 surfaces the misconfigurations the lenient form would mask. `p=none` means no enforcement at the recipient; the RUA aggregate reports are the diagnostic channel.

Daily review cadence: pull the previous day's RUA aggregate (XML feed into a parser; `parsedmarc` is the open-source reference). Track:

- % of messages passing SPF + DKIM alignment
- Top failing sender IPs (forwarders, third-party-sending vendors)
- Volume by source

Exit criteria: ≥98% pass rate over 7 consecutive days.

## Phase 1 — `p=quarantine; pct=25` (weeks 3-4)

```
_dmarc.my-quilty.com.  TXT  "v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc-reports@my-quilty.com; fo=1; adkim=s; aspf=s; sp=quarantine"
```

`pct=25` quarantines 25% of failing messages at compliant recipients. The remaining 75% still pass — this is the ramp's safety valve. The aggregate reports surface any user-visible breakage; if support tickets cite missed password resets, roll back `pct` to 10 or `p` to `none`.

Exit criteria: ≥99% pass rate + zero user-reported delivery failures over 7 consecutive days.

## Phase 2 — `p=quarantine; pct=100` (weeks 5-6)

```
_dmarc.my-quilty.com.  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@my-quilty.com; fo=1; adkim=s; aspf=s; sp=quarantine"
```

`pct` defaults to 100. Every failing message is quarantined at the recipient. The RUA aggregate feed continues; the security team should expect the report volume to drop as misconfigured senders self-correct (they see their messages quarantined and contact the domain owner).

Exit criteria: ≥99.5% pass rate over 14 consecutive days + no open misconfiguration tickets.

## Phase 3 — `p=reject` (week 7+)

```
_dmarc.my-quilty.com.  TXT  "v=DMARC1; p=reject; rua=mailto:dmarc-reports@my-quilty.com; fo=1; adkim=s; aspf=s; sp=reject"
```

Failing messages are rejected outright at the recipient. This is the steady-state posture; the Gmail + Yahoo bulk-sender rules consider this the responsible-sender benchmark.

## Rollback

DNS propagation on the Route 53 side completes in ~60 seconds globally, but recursive resolvers cache at the record TTL (default 300 seconds = 5 minutes; the SOA TTL caps the negative cache for some resolvers). In-flight rejections within the current daily DMARC reporting window are not affected by the record change.

If a major Phase 2 or Phase 3 misconfiguration is discovered (e.g., SES Easy DKIM signing key rotation breaks alignment), roll back to `p=quarantine; pct=10` or `p=none` via Terraform. The Route 53 hosted zone lives in the **production** `quilty-aws` account, so authenticate to the production SSO profile first:

```bash
aws sso login --profile quilty-prod
cd quilty-aws/dns
AWS_PROFILE=quilty-prod terraform apply -target=aws_route53_record.dmarc_rollback
```

The `quilty-aws/dns/` layer maintains a parallel `*_rollback` resource for each enforcement record so emergency rollback is one targeted apply, not a re-edit.

## Subdomain policy

The `sp=` tag mirrors `p=` at each phase. `auth.my-quilty.com` (Cognito Managed Login) inherits the parent DMARC policy by default; the alignment mode applies because SES sends from the apex with `my-quilty.com` envelope-From.

## Triggering event

This runbook activates the day **AWS SES production-access sandbox lift** is granted for `my-quilty.com` AND the **AWS BAA inventory** (see `baa-inventory.md`) lists SES as covered. Until both are green, the `@quilty/email` SES adapter throws on `send()` and no email leaves the perimeter.
