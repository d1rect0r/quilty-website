# Round 6 Foundation Audit — Wave 2, Agent B: monitoring-status-incident

> **Scope:** the monitoring / status / incident layer beyond Sentry — uptime, synthetic checks, status page, on-call, AWS security services, cost alerts, observability dashboards, HIPAA Breach Notification readiness.
> Generated 2026-05-19, 2025-2026 sources only, anchored on Wave 1 AWS recon (`01-aws-infra-recon.md`) and mobile recon (`02-mobile-stack-recon.md`).

---

## 1. Executive summary

**Pick a Sentry-anchored "boring" stack now, lay one OTel pipe, defer everything that demands a second BAA until trigger.**

The single most important recommendation: **Sentry Business tier is doing four jobs the website strategy still treats as separate (errors, RUM, error-triggered replay, OTel ingest) plus two more it can absorb at zero new vendor cost (uptime monitoring, cron monitoring). Add ONE Sentry Uptime monitor + ONE Sentry Cron at M2 and you have closed the uptime/scheduled-job gap with the BAA that's already signed.** Sentry's 2024 Uptime feature shipped as a thin add-on (1 monitor free per plan, additional via PAYG) so it is not a depth match for BetterStack, but at our scale (one apex + ~30 routes, all collapsing into a single CloudFront + Lambda surface) one well-chosen synthetic check at the apex plus one health-endpoint cron monitor is the right ceiling. Going wider is a M5+ trigger when the portal lights up.

For the **public status page**, lean opposite: **status pages are a low-cost, high-trust differentiator that mental-health peers (Headspace, Calm, BetterHelp, Talkspace, Cerebral, Mindbloom) DO NOT publish.** Most consumer-mental-health competitors run incidents through Twitter/X and in-app banners. Publishing `status.my-quilty.com` from M2 — even with a single component "Marketing site" reporting Sentry Uptime — is a brand-trust move. Pick **Instatus Pro ($20/mo, custom domain, Jamstack, BAA available on Enterprise but not load-bearing for a status page that contains zero PHI)** for design parity with the rest of the site, NOT Atlassian Statuspage ($99-399/mo and the subscriber-tier ratchet is hostile to a growing user base). On-call is **none** until the second engineer joins — solo direct-alerting via Sentry → SMS + Slack covers the role of an on-call tool at this size. AWS security services on the development account stay minimal at Phase 0 (GuardDuty + Security Hub Essentials, ~$30-60/mo); Phase 1 in `marketing-prod` adds Config + Inspector (~$50-150/mo total). The HIPAA Breach Notification scaffold (the Cerebral $7M lesson made operational) is the one piece where solo-team scale doesn't shrink the work — that runbook + the OCR portal-submission template need to land in `docs/runbook/incidents/` BEFORE first revenue, not after.

**Net: one vendor add (Instatus status page, $20/mo), Sentry feature flips (Uptime + Cron), three AWS toggles (GuardDuty, Security Hub Essentials, Cost Anomaly Detection — all on the dev-account 30-day free trials first), and a four-document runbook spine. Total monthly new spend: ~$30-90.**

---

## 2. Uptime + synthetic monitoring — decision

### The market in 2026

| Tool                      | BAA                                | Free tier                                      | Paid floor                        | Status page bundled                      | Cron monitors          | Best fit                                                            |
| ------------------------- | ---------------------------------- | ---------------------------------------------- | --------------------------------- | ---------------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| **Sentry Uptime + Crons** | YES (Business tier already signed) | 1 monitor + 1 cron on every plan               | PAYG above free                   | Sentry has no public status page product | YES, same vendor       | Same-vendor, BAA-covered, low ops                                   |
| BetterStack               | NO (SaaS-only, no BAA)             | 10 monitors + 10 heartbeats + status page free | $34/mo                            | YES, even free tier                      | YES                    | Modern, polished, but **no BAA disqualifies it**                    |
| Cronitor                  | Not advertised                     | 14-day trial                                   | $2/monitor + $5/user/mo           | YES, $25/mo extra                        | YES (primary use case) | Cron-first, weak status-page UX                                     |
| UptimeRobot               | NO                                 | 50 monitors, 5-min checks free                 | $7/mo                             | YES (basic)                              | Limited                | Cheap, but spammy + no BAA                                          |
| AWS CloudWatch Synthetics | Implicit (AWS BAA covers it)       | None                                           | ~$0.0012/canary-run + Lambda + S3 | NO                                       | NO native cron         | High ops cost, real $$ at multi-canary, but inside our existing BAA |
| Checkly                   | NO                                 | 10K API + 1.5K browser checks/mo free          | $64/mo                            | NO                                       | NO                     | Best Playwright reuse story, no BAA                                 |
| OneUptime                 | YES if self-hosted                 | OSS free; cloud has free tier                  | $20/monitor/mo cloud              | YES                                      | YES                    | Self-host = full control but ops overhead                           |
| Datadog Synthetics        | YES (Business+ BAA)                | None                                           | $$ enterprise                     | Separate Datadog Status Page             | YES                    | Overkill at our size, separate BAA                                  |

**The BAA filter cuts the list to: Sentry (already signed), CloudWatch Synthetics (already inside AWS BAA), OneUptime self-hosted (no), Datadog (enterprise overkill).**

### Decision — Sentry Uptime + Cron at M2

**For uptime + cron monitoring, use Sentry's native features. No second vendor.**

- **1 Sentry Uptime monitor at `https://my-quilty.com/`** — 1-min interval, US-East primary, alert on 2 consecutive failures. **Free with our Business plan.**
- **1 Sentry Cron monitor** wrapping a daily synthetic health-check Lambda (we'll write it) that hits `/api/healthz/ready` and asserts: CloudFront 200, BFF reaches Cognito JWKS, BFF reaches DynamoDB session-store, BFF reaches `auth-public` upstream. Cron expression `0 */6 * * *` (every 6h). Alert if missed or failing. **Free with our Business plan.**
- **Sentry as the alerting front-end** — webhook → Slack `#alerts-website` + SMS to operator's phone via Sentry's built-in mobile-app push (no Twilio integration, no PagerDuty).
- **No additional uptime monitors at M2.** Sentry RUM is already capturing every real-user request; if RUM error-rate spikes the same Sentry project alerts on it. The marginal value of a 5-region geo-canary pre-launch is zero (no users in those regions yet).

### When to add a second vendor

If/when one of these triggers fires, **then** layer in either **Sentry's additional Uptime monitors (PAYG)** or a self-hosted **OneUptime** instance:

- M5 portal lights up → add 1 Uptime monitor at `/account` (authenticated, requires session-cookie hack — handle via Sentry SDK API, not the GUI uptime config)
- M7 Stripe Checkout → add 1 Cron monitor at `/api/billing/healthz` (call Stripe `Account.retrieve` w/ test-mode key)
- First real user complaint about regional latency → enable Sentry Uptime "multi-region" (extra cost) OR Cloudflare-side health checks at the CDN
- We hit 5 uptime monitors → **at that point** re-evaluate BetterStack vs OneUptime self-hosted, because Sentry Uptime priced PAYG per monitor crosses BetterStack's bundle around 8-10 monitors. Document the trigger in the runbook so the future-self knows when to revisit.

### What we explicitly DON'T do

- **No BetterStack.** No BAA = HIPAA-aligned product cannot depend on it for PHI-adjacent alerting. (BetterStack's response to "is it HIPAA?" is "contact us" — meaning case-by-case enterprise dance, no thanks at our scale.)
- **No Checkly.** Best-in-class for Playwright reuse, but no BAA + duplicates Sentry RUM.
- **No CloudWatch Synthetics.** Real cost per canary-run + 100% DIY framework + we have no existing CloudWatch dashboard culture on the website side. Cheaper to use Sentry's offering than to build the runbook. Reserve CloudWatch Synthetics as "Phase 1 emergency option if Sentry Uptime gets discontinued" — it's the BAA-covered backstop, not the primary.
- **No Pingdom, Datadog Synthetics, Site24x7, Uptime.com.** Either no BAA, overkill, or both.

### Implementation plan

```
M2 (next sprint):
  - Add Sentry Uptime monitor for my-quilty.com (UI config; takes 5 min)
  - Write apps/web/app/api/healthz/ready/route.ts (asserts dependencies)
  - Add Sentry Cron monitor via SDK in a new healthcheck script (sst.config.ts Cron resource → Lambda)
  - Add Slack incoming-webhook + Sentry → Slack route for #alerts-website
  - Document trigger thresholds in docs/runbook/observability.md
```

---

## 3. Status page — decision

### Peer comparison

| Peer           | Public status page                         | Notes                                                    |
| -------------- | ------------------------------------------ | -------------------------------------------------------- |
| **Stripe**     | `status.stripe.com` (Atlassian Statuspage) | Gold-standard. Granular per-API + per-region components. |
| **Linear**     | `linear.app/status`                        | Self-hosted, custom-built. Polished.                     |
| **Cal.com**    | `status.cal.com` (Statuspage)              | Subscriber notifications.                                |
| **Sentry**     | `status.sentry.io` (Statuspage)            | Eats their own dog food.                                 |
| **Vercel**     | `vercel-status.com` (Statuspage)           | Per-region + per-service breakdown.                      |
| **Anthropic**  | `status.anthropic.com`                     | Per-product (Claude, Console).                           |
| **Headspace**  | NONE                                       | App store + Twitter only                                 |
| **Calm**       | NONE                                       | Help center + Twitter                                    |
| **BetterHelp** | NONE                                       | Help center + email-based                                |
| **Talkspace**  | NONE                                       | Twitter/X only                                           |
| **Cerebral**   | NONE                                       | Twitter + in-app banner                                  |
| **Mindbloom**  | NONE                                       | None — phone-line for outages                            |

**Finding:** General SaaS engineering peers publish; consumer-mental-health peers don't. **This is an opportunity, not a tax.** A polished `status.my-quilty.com` signals operational maturity to skeptical media + medical-board observers + corporate-buyer prospects ("does this consumer mental-health company even have an SRE function?"). It is also the legally cleanest way to communicate the inevitable downtime event without ad-hoc Twitter posts that get screenshot and resurface in lawsuits.

### Decision — Instatus Pro at M2

**Use Instatus Pro ($20/mo) at `status.my-quilty.com`. Subscribed to Sentry Uptime via API webhook.**

Rationale:

- **Design-first.** Instatus pages are Jamstack-rendered, dark-mode native, < 50KB. Our marketing site is design-led; the status page must visually align. Atlassian Statuspage is dated and uncustomizable below the $399 tier.
- **No subscriber tax.** Instatus offers unlimited subscribers on all paid tiers. Statuspage's `$29/100 → $99/1K → $299/5K` ratchet punishes us for growing.
- **Independent infrastructure.** Instatus's status page stays UP even when our infra is DOWN. Self-hosting `status.my-quilty.com` on the same Lambda/CloudFront stack creates a circular dependency we'd regret on day-1 of the first real outage. (Linear's self-hosted page is fine because Linear is a 200-person team with a multi-account multi-region story; we are not.)
- **API-driven incident updates.** Instatus has a clean REST API — Sentry Uptime alert webhook → Lambda → Instatus API to auto-open an incident on the right component. Same pattern Cal.com uses.
- **Subdomain reservation.** `status.my-quilty.com` is not on the U3 reserved-subdomain list (the U1-U8 locks reserved `auth.`, `help.`, `app.`). Add it. Route 53 `status` CNAME → Instatus's verified domain.
- **No BAA needed.** Status pages contain zero PHI by definition. They report "the marketing site is up" or "the account portal is degraded" — never "user X's session was logged at Y." This is a load-bearing claim documented in the runbook.

**Component set at M2 launch:**

| Component             | Description                                 | Monitor source                                          |
| --------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Marketing site        | `my-quilty.com` apex + all marketing routes | Sentry Uptime (1-min)                                   |
| Account portal        | `my-quilty.com/account` (post-M5)           | Sentry Uptime authenticated check                       |
| Sign-in (Cognito)     | `auth.my-quilty.com` Managed Login          | Cognito CloudWatch alarm → SNS → Lambda → Instatus API  |
| Email (SES)           | Transactional email send                    | SES bounce/complaint topic → Lambda → Instatus API      |
| Subscription (Stripe) | Stripe Checkout availability (post-M7)      | Stripe `Account.retrieve` Cron via Sentry Cron + Lambda |

The Cognito + SES + Stripe components plug into events that already exist in `quilty-aws/` (Wave 1 §15 confirms SES → SNS → Lambda is already shipped; Cognito CloudWatch alarms are in `auth/main.tf`).

**Subscribe-to-status-page mechanism:** Instatus has built-in email + Slack + RSS + webhook subscribers. No CRM integration needed. Add a "Subscribe to updates" link to the marketing footer and to the in-portal error pages (M5+).

### What we explicitly DON'T do

- **No Atlassian Statuspage** — overpriced at our band, subscriber-tier hostility, dated UX.
- **No BetterStack status page** — would be free (their bundle includes it) but **the BAA gap on the broader BetterStack suite means we can't safely consolidate uptime + status under one vendor**. Splitting would mean BetterStack hosts the status page but Sentry runs the uptime checks — a marginal saving that loses the API-webhook one-step incident creation.
- **No self-hosted (Cachet, OneUptime, Upptime)** — operational cost for a solo team > $20/mo SaaS premium.
- **No DIY Next.js status page on `status.my-quilty.com`** — too easy to over-engineer; the page that has to stay up MUST be on different infra than the site it reports on.
- **No Cloudflare Status Page** — we are not on Cloudflare for CDN.

---

## 4. On-call / incident response — solo-friendly path

### The matrix

| Tool                             | Solo-team fit                   | Cost          | Effort to scale to team-of-5     |
| -------------------------------- | ------------------------------- | ------------- | -------------------------------- |
| **None — phone-direct alerting** | ✅ Best for now                 | $0            | Re-evaluate at H2 (2nd engineer) |
| Better Stack On-Call (free tier) | ✅ Free, 1 responder            | $0            | Path: add responders, $$         |
| Grafana Cloud IRM (free tier)    | ⚠️ 3 users free; learning curve | $0            | OK                               |
| PagerDuty Professional           | ❌ Overkill                     | $21/user/mo   | Easy                             |
| Opsgenie                         | ❌ **Shutting down April 2027** | n/a           | n/a                              |
| incident.io                      | ❌ Slack-first + per-user $$$   | ~$99/seat/mo  | Easy                             |
| Rootly                           | ❌ Slack-first                  | $20+/user/mo  | Easy                             |
| FireHydrant                      | ❌ Enterprise-priced            | $9,600/yr Pro | Easy                             |
| GitHub Issues + Slack thread     | ⚠️ Brittle but workable         | $0            | Hard                             |

### Decision — none, with explicit triggers

**For Phase 0 (now through ~10 users): no dedicated on-call tool. Sentry alerts go directly to operator phone (Sentry's mobile app supports push + SMS via Sentry's own delivery, plus Slack DM to `#alerts-website` channel). Document the response runbook in `docs/runbook/incidents/`.**

The reasoning: at the solo-engineer stage, there is no rotation, no escalation, no "page the secondary." Adding any on-call SaaS adds (a) configuration burden, (b) a vendor relationship to renew, (c) zero leverage. Sentry's own alert routing covers the SMS + push + email + Slack quadrant for free.

**Migration trigger:** when the second engineer joins (the H2 hiring trigger), pick **BetterStack On-Call (free tier)** — NOT PagerDuty, NOT incident.io. Reasons:

1. BetterStack's on-call is the most modern + cleanest UI in the free tier
2. The fact that we don't use BetterStack for uptime DOES NOT block us from using their on-call (it's a separate product) and 1 responder is free
3. If we later outgrow it, the migration path to PagerDuty/Grafana IRM is well-trodden

**Migration trigger #2:** when team-of-5 → introduce **incident.io** if Slack-first or **Grafana Cloud IRM** if the rest of the org has standardized on Grafana. Skip PagerDuty unless we have an enterprise customer demanding it.

### Incident response runbook spine — land at M2

Four documents in `docs/runbook/incidents/`:

1. **`incident-severity-taxonomy.md`** — SEV1/2/3/4 definitions
2. **`incident-response-playbook.md`** — step-by-step from "Sentry alert fires" to "post-mortem published"
3. **`post-mortem-template.md`** — blameless culture template (5-whys, contributing factors, action items)
4. **`status-page-update-playbook.md`** — how to write a customer-facing status update without leaking PHI or inviting legal exposure

#### SEV taxonomy

| Level    | Definition                                                                                  | Target detection time   | Target customer comms |
| -------- | ------------------------------------------------------------------------------------------- | ----------------------- | --------------------- |
| **SEV1** | Full marketing-site outage OR account-portal full outage OR PHI exposure / suspected breach | < 1 min (Sentry Uptime) | 5 min via status page |
| **SEV2** | Degraded performance affecting > 25% of users; one critical flow broken (sign-in, checkout) | < 5 min                 | 15 min                |
| **SEV3** | Single feature broken, low impact; one regional CDN edge degraded                           | < 30 min                | 60 min                |
| **SEV4** | Cosmetic or low-volume; one user reported issue                                             | < 24h                   | No public comms       |

**HIPAA-specific tag:** every incident gets a `phi-exposure-risk: yes/no/unknown` field at creation. If `yes` or `unknown`, the playbook routes to the Breach Notification workflow (§8) within 24 hours regardless of other SEV severity.

---

## 5. AWS security services — Phase 0 + Phase 1 plan

### What `quilty-aws` already provides (per `01-aws-infra-recon.md` §15)

| Service             | Production account                                 | Development account                                              | Org-wide                                    |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| CloudTrail          | ✅ centralized → log-archive `825187895356`        | Inherited via Org trail                                          | ✅                                          |
| Config              | ✅ on production                                   | ❓ not explicit in baseline.tf                                   | Not org-aggregated                          |
| GuardDuty           | ✅ on production                                   | ❓ not on dev                                                    | Not org-aggregated                          |
| Macie               | ✅ on production                                   | ❌                                                               | ❌                                          |
| Inspector           | ✅ on production                                   | ❌                                                               | ❌                                          |
| Security Hub        | ✅ delegated to security-tooling                   | ❌                                                               | Cross-acct findings via EventBridge to prod |
| AWS WAF             | ✅ Cognito + healthz + app-sync CloudFront + apigw | ❌ Website WAF MISSING (gap noted in §08-Recommended next moves) | n/a                                         |
| AWS Shield Standard | ✅ free, always on                                 | ✅                                                               | ✅                                          |

**Gap:** the development account does NOT have GuardDuty + Security Hub + Inspector enabled. The website's Phase 0 deploy will land in development account.

### Decision — Phase 0 (development account, ~$30-60/mo)

**Enable on the development account NOW (before website lands), via a new `quilty-aws/development/security_baseline.tf` mini-layer:**

1. **GuardDuty foundational** — CloudTrail + VPC Flow Logs + DNS query log analysis. **Skip the optional protection plans (EKS, RDS, Lambda, S3, EBS, Aurora) — none apply at Phase 0** (no Kubernetes, no Aurora, S3 is just SST static assets). Est. $5-15/mo on a dev account with low traffic. **30-day free trial first** to baseline real cost.
2. **Security Hub Essentials plan** — turns on AWS Config rules under the hood. Standards: AWS Foundational Security Best Practices + CIS AWS Benchmark v3.0. Skip PCI-DSS standard (not relevant). Est. $10-30/mo.
3. **AWS Config** — ConformancePack `Operational-Best-Practices-for-HIPAA-Security` from the public AWS Config Conformance Pack library. **THIS IS THE LOAD-BEARING ONE** for the HIPAA-aligned claim — even though the website is in Workloads-NonHIPAA scope, having the HIPAA Conformance Pack running in the same account where the BFF lives is the evidence trail for a future SOC 2 audit. Est. $5-15/mo.
4. **CloudTrail** — already covered by Org trail; no action.
5. **AWS Inspector** — enable Lambda scanning (FREE for Lambda, $0.30/scanned function-week for Lambda code). Est. $0-5/mo.
6. **NOT NOW: AWS Shield Advanced** — $3,000/mo is silly pre-launch. We have Shield Standard free.
7. **NOT NOW: AWS Macie** — Macie is for PII discovery in S3. The website's S3 buckets hold only static marketing assets (zero PHI). Enable in Phase 1 ONLY if we ever store user-uploaded content (we won't pre-launch).
8. **Cross-account aggregation** — point the development-account Security Hub findings at the existing security-tooling-account aggregator (delegated admin already configured per §15). One-line `aws_securityhub_finding_aggregator`.

**Total Phase 0 dev-account security spend: ~$30-60/mo (post-free-trial), depending on real activity.**

### Decision — Phase 1 (marketing-prod, ~$50-150/mo)

When the website migrates to `marketing-prod` (D45 trigger: launch or first revenue), expand to:

1. **All Phase 0 services** — re-enabled in the new account
2. **AWS WAF v2 Web ACL** (CLOUDFRONT scope) for the website's CloudFront distribution — already on the gap list per `01-aws-infra-recon.md` §REQUIRED FOR WEBSITE BUT MISSING #1.iii. Managed groups: CommonRuleSet + KnownBadInputs + IpReputation + AmazonIpReputationList + custom rate-limit. Est. ~$10/mo + $0.60/M requests.
3. **Macie** — only IF user-uploaded content lands (DSAR exports, etc.). Defer to M7+.
4. **AWS Network Firewall** — defer unless we run private subnets (no, we run Lambda + CloudFront).
5. **Inspector container scanning** — if we ever ship containerized Lambda. Not in the plan.

### What we explicitly DON'T do

- **No Datadog AWS integration** (would observe AWS resources from a 3rd-party vendor with separate BAA + cost)
- **No CrowdStrike / SentinelOne** (we have no servers; Lambda is the runtime)
- **No Snyk / Wiz pre-launch** (M5+ trigger; Inspector covers Lambda code scanning at the AWS layer)

---

## 6. Cost monitoring — minimal viable config

### Decision — three controls, all native AWS, all free or near-free

1. **AWS Budgets** — three budgets in development account, all email-alerting:
   - **Monthly total budget** — $200 ceiling, alert at 80% forecasted + 100% actual
   - **Daily total budget** — $7 ceiling (monthly ÷ 30), alert at 150% to catch weekend spikes
   - **Service-specific budget** — Sentry budget category in PostHog (D42b spend is a SaaS line item, not AWS) — track via 1Password financial section, not AWS
2. **AWS Cost Anomaly Detection** — one AWS-service monitor (catch-all) with $50 alert threshold, individual-alert frequency, routed to `#alerts-website` via existing SNS + Lambda → Slack pattern (already used for security findings)
3. **Infracost on PRs** — Terraform-level cost preview in GitHub Actions on every PR that touches `quilty-aws/website-baseline/` or `apps/web/sst.config.ts`. Free for OSS / small commercial. Catches "oops I just enabled GuardDuty on all 17 regions."

### When to expand

- **At Phase 1 marketing-prod cutover:** add a budget per account, plus a "marketing total" Cost Category to roll up. ~30 min of TF work.
- **When we hit $1K/mo AWS spend:** add Cost Explorer saved queries + a monthly cost-review hour in the operator's calendar. Pre-launch this is overkill.

### What we explicitly DON'T do

- **No CloudHealth, Vantage, Apptio Cloudability** — overkill below ~$10K/mo AWS spend
- **No CAST AI / nOps Compute Copilot** — Lambda-first stack doesn't have the EC2 right-sizing surface they optimize
- **No Spot.io** — same reason

---

## 7. Logging + observability dashboards — confirm Sentry sufficiency

### Current state

- **Server logs (BFF Lambda):** CloudWatch via SST default, 14-day retention, KMS-encrypted via the per-stack KMS key. PHI-sanitized via `lib/observability/logger.ts` (existing per file list at `apps/web/lib/observability/`).
- **Client errors + RUM:** Sentry (D42a, ADR-0004)
- **Traces (OTel):** Sentry's OTLP ingest via `@vercel/otel` (D56)
- **Metrics (CWV, custom):** Sentry Performance + custom `web-vitals.ts` ship
- **Cron monitoring:** Sentry Crons (per §2 decision)
- **Uptime:** Sentry Uptime (per §2 decision)
- **Security findings:** Security Hub (per §5)
- **Cost anomalies:** Cost Anomaly Detection + Budgets (per §6)

### Decision — Sentry is sufficient at M1-M5. Don't add a second observability vendor.

**Sentry covers ~90% of dashboards-we'd-actually-look-at. The remaining 10% are AWS-native dashboards (CloudWatch for Lambda invocation/duration/error count, Security Hub for findings, Cost Explorer for spend) and those are free + already where they need to be.**

What we explicitly don't add (yet):

- **No Honeycomb second-target for OTel** — Wave 1 §15 + Surprise #7 already resolved this: Honeycomb is `quilty-aws/` backend's tool, Sentry is the website's. Don't fan out; the website's OTel pipe goes only to Sentry.
- **No Grafana Cloud / Managed Grafana on AWS** — overkill; no Prometheus metrics being emitted from the website Lambda
- **No Datadog APM / Logs / RUM** — separate BAA + double-counting Sentry
- **No BetterStack Logs (Logtail) / Loggly / Papertrail** — no BAA on the SaaS log-aggregator market that's relevant to a solo team; CloudWatch Logs Insights queries cover ad-hoc forensics + nobody actually re-reads logs day-to-day pre-launch

### CloudWatch Logs Insights — queries to save at M2

Save these in CloudWatch console as named queries (lives in account, not in TF — operator-managed):

1. **"Last 24h errors"** — `fields @timestamp, @message | filter level = "ERROR" | sort @timestamp desc | limit 100`
2. **"Slow BFF requests > 1s"** — `fields @timestamp, route, duration_ms | filter duration_ms > 1000 | sort duration_ms desc | limit 50`
3. **"5xx by route"** — `fields route | filter status >= 500 | stats count() by route | sort count() desc`
4. **"Consent decisions (audit trail)"** — `fields @timestamp, user_id, consent_action | filter event_type = "consent_changed" | sort @timestamp desc`

Document in `docs/runbook/observability.md`.

### Anomaly detection thresholds

| Metric                   | Source                      | Threshold                         | Action                                             |
| ------------------------ | --------------------------- | --------------------------------- | -------------------------------------------------- |
| Sentry error rate        | Sentry metric alert         | > 1% of requests over 5min window | Slack `#alerts-website`                            |
| Sentry p95 latency       | Sentry metric alert         | > 2500ms over 10min window        | Slack `#alerts-website`                            |
| CWV LCP regression       | Lighthouse CI in CI         | > 2500ms (per D71)                | Fail PR                                            |
| CloudWatch Lambda errors | CloudWatch alarm            | > 5 / 5min on BFF Lambda          | SNS → Slack                                        |
| GuardDuty finding        | Security Hub                | HIGH or CRITICAL severity         | SNS → Slack `#alerts-security`                     |
| Cost anomaly             | Cost Anomaly Detection      | > $50 daily anomaly               | SNS → Slack `#alerts-cost`                         |
| SES bounce rate          | SES → SNS bounces_topic_arn | > 5% over 24h                     | SNS → Slack (already wired in `quilty-aws/email/`) |
| Status page outage       | Instatus                    | Any component non-operational     | Status page subscribers + Slack                    |

All Slack channels can route to the operator's phone via Slack's mobile-app push during off-hours. **No additional SMS/voice-call vendor.**

---

## 8. HIPAA Breach Notification readiness

This is the section where solo-team scale provides zero discount. **HIPAA §164.408 — 60-day OCR notification — is a legal obligation that doesn't care about engineering team size.** The website is in Workloads-NonHIPAA scope (D45 + D47 — the Phase 1 marketing-prod account migration is THE control that isolates this), but two scenarios still trigger Breach Notification obligations:

1. **Pre-Phase-1 cutover** — the website lives in the development account, which IS in the HIPAA-eligible Org perimeter. The MOST IMPORTANT preventive control is **getting Phase 1 migrated before launch traffic arrives** (D45 trigger). Until then, every analytics/tracking/marketing pixel discussion (D35, D63) is a Breach-Notification-Rule discussion.
2. **Post-Phase-1** — even isolated in `marketing-prod`, if the website handles any user-input that COULD be PHI-shaped (e.g., free-text fields, sign-up emails associating a real name with a mental-health service inquiry), an exfiltration via a 3rd-party tag could still trip the rule. The Cerebral $7M and Monument cases are exactly this surface — pixels in marketing-tier code paths.

### Decision — three deliverables before M8 (legal review milestone)

#### Deliverable 1: `docs/runbook/incidents/breach-notification-playbook.md`

Sections:

1. **Day 0 (discovery)** — "Discovery" means "you know or reasonably should know unsecured PHI was compromised." Document the discovery timestamp + person + how-discovered (Sentry alert, user report, internal review, audit).
2. **Day 0-1: Containment** — stop the leak, preserve evidence (CloudTrail + Sentry replay + CloudWatch logs), notify the operator's HIPAA compliance person (TBD — likely the same operator for now)
3. **Day 0-30: Risk assessment** — 4-factor analysis per 45 CFR §164.402:
   - Nature + extent of PHI involved (identifiers + type)
   - Unauthorized person who used or to whom disclosed
   - Whether PHI was actually acquired or viewed
   - Extent to which risk has been mitigated
4. **Day 0-60: Notification (if breach confirmed)**
   - Affected individuals: individual written notice within 60 days
   - HHS OCR: portal submission at https://www.hhs.gov/hipaa/for-professionals/breach-notification/breach-reporting/index.html (if > 500 individuals, also within 60 days; if < 500, by March 1 of the following year)
   - Media: only if > 500 residents of a single state (probably never at our scale)
   - Substitute notice: if > 10 individuals have stale contact info, post on the website + media notice
5. **Documentation retention** — 6 years per HIPAA §164.530(j)

#### Deliverable 2: `docs/runbook/incidents/breach-notification-templates/`

Markdown templates for:

- Individual notification letter (HIPAA-required content: types of info, steps to take, what we're doing, contact info)
- OCR portal submission worksheet (the OCR portal asks specific structured questions; have answers pre-drafted in the runbook)
- Media notice press-release skeleton
- Substitute notice (website banner) HTML snippet — for use on `my-quilty.com` apex if needed
- Internal incident report (for the 6-year retention obligation)

#### Deliverable 3: Annual log retention guarantee

- **CloudTrail logs:** already 7 years in `log-archive` account per `01-aws-infra-recon.md` §9
- **CloudWatch logs (website):** **bump from 14d default to 6 years (2192 days)** on the BFF Lambda log group. This is THE one line of TF that's load-bearing for HIPAA — without long log retention, the 4-factor risk assessment in Day 0-30 has no evidence base. Cost impact: minimal (logs are PHI-sanitized + low-volume; ~$0.50/mo per GB stored)
- **Sentry events:** retention is per Sentry plan (Business = 90 days standard). For PHI-relevant evidence (which shouldn't exist in Sentry per D67 but might leak), the Sentry 90d retention is shorter than HIPAA's 6 years — **this is fine because Sentry SHOULDN'T contain PHI in the first place** and the Day 0-30 risk assessment will use CloudTrail + CloudWatch as primary evidence, with Sentry as supplemental.

### Tooling — what's actually needed

**No SaaS tool buys this.** Tools like Compliancy Group, Accountable HQ, Drata, Vanta automate the _evidence collection_ for SOC 2 / HIPAA Risk Analysis (§164.308(a)(1)) — that's a different obligation from Breach Notification (§164.400-414). The notification rule itself is a procedural runbook + the OCR portal. Both are markdown + a person.

**Defer Vanta / Drata** to the M7+/SOC 2 trigger. Pre-launch, the runbook + the AWS-native evidence trail are sufficient.

### Open scope: who's the HIPAA Privacy Officer + Security Officer?

HIPAA §164.530(a)(1) requires a designated Privacy Officer and a Security Officer (can be the same person at our scale). Without a named role, the runbook has no "who" for Day 0. **This is a strategy-doc lock the operator needs to add** — likely the operator themselves until a Head of Compliance is hired (M8+).

---

## 9. Gap list — classified by retrofit cost

### TIER A — M2 retrofit-hostile (do at M2 or it gets expensive)

1. **Sentry Uptime monitor** for `my-quilty.com` apex — 5 minutes of UI config
2. **Sentry Cron monitor** wrapping daily `/api/healthz/ready` — 1h of code + SDK init
3. **Instatus Pro status page** at `status.my-quilty.com` — $20/mo, 1h setup, DNS reservation
4. **Slack #alerts-website channel** + Sentry → Slack webhook — 15 min
5. **CloudWatch Lambda log retention bump 14d → 6 years** on the BFF log group — 1 line of TF; load-bearing for HIPAA evidence
6. **`docs/runbook/incidents/` spine** (4 documents per §4) — 4h of writing
7. **`docs/runbook/observability.md`** — query book + alert routing index — 2h
8. **AWS Budgets** — monthly + daily on development account — 30 min
9. **AWS Cost Anomaly Detection** — service-managed monitor, $50 alert threshold — 15 min

### TIER B — Mx-distributed (build at the relevant milestone)

10. **GuardDuty + Security Hub Essentials + Inspector + Config ConformancePack** on development account — 4h of TF in a new `quilty-aws/development/security_baseline.tf` mini-layer. Trigger: before website's first authenticated route ships (M5)
11. **AWS Config `Operational-Best-Practices-for-HIPAA-Security` Conformance Pack** — 1 TF resource. Trigger: M5 (account-portal milestone)
12. **EventBridge SNS → Slack** for security findings — pattern already exists for prod account; replicate for dev. Trigger: M5
13. **Authenticated Sentry Uptime monitor** for `/account` — Trigger: M5
14. **Stripe Cron monitor** — Trigger: M7
15. **Phase 1 `marketing-prod` security-baseline TF layer** — Trigger: D45 launch/revenue cutover
16. **Phase 1 WAF CLOUDFRONT-scope Web ACL** — Trigger: Phase 1 (already gap-listed in 01-aws-infra-recon.md)
17. **`breach-notification-playbook.md` + templates** — Trigger: M8 legal review milestone (lawyer can review the runbook)
18. **HIPAA Privacy Officer + Security Officer named in `docs/compliance/officers.md`** — Trigger: before M8
19. **Lighthouse CI dashboard / external CWV monitoring** — Trigger: M7+ when CWV regressions actually matter for SEO (currently CI Lighthouse + Sentry RUM cover this)
20. **Instatus subscriber-link in marketing footer** — Trigger: M2 (cheap)
21. **Sentry → Instatus auto-incident webhook** — Trigger: M2 (1h Lambda)
22. **Cognito CloudWatch alarm → Instatus** for sign-in degradation — Trigger: M6 (auth integration)
23. **SES bounce/complaint topic → Instatus** for email-component status — Trigger: M6 (SES production-access also lands here)

### TIER C — Skip / re-evaluate at scale

24. ~~BetterStack uptime+status bundle~~ — no BAA, no go
25. ~~Checkly Playwright synthetic~~ — no BAA, duplicates Sentry RUM
26. ~~CloudWatch Synthetics canaries~~ — high ops, kept as Phase 2 emergency option
27. ~~PagerDuty / Opsgenie / incident.io / Rootly / FireHydrant~~ — solo team; re-eval at H2 hire
28. ~~Statuspage.io Atlassian~~ — overpriced + ugly
29. ~~Datadog / New Relic / Dynatrace~~ — enterprise APM, separate BAAs, Sentry-redundant
30. ~~Honeycomb on the website~~ — backend's tool; website doesn't need a second OTel target
31. ~~Macie~~ — until user-uploaded content exists (likely never)
32. ~~AWS Shield Advanced~~ — $3K/mo, defer indefinitely
33. ~~AWS Network Firewall~~ — no VPC private subnets to protect
34. ~~Compliancy Group / Drata / Vanta~~ — until SOC 2 is on the table (M8+)
35. ~~Calibre / SpeedCurve / DebugBear~~ — Lighthouse CI + Sentry RUM sufficient
36. ~~LogRocket / FullStory / Mixpanel session-replay~~ — D68 already rejected the broader category

---

## 10. Recommended new D-decisions

The service-stack-coherence agent owns final numbering. These are draft proposals; renumber at synthesis. All are in scope of "monitoring / status / incident" and complement (don't conflict with) the existing D42a (Sentry) + D56 (OTel) + D70/D71 (Lighthouse CI + size-limit) locks.

| Draft D    | Decision                                                                                                                                                                                                                                                                                                                                               | Rationale                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-M-1**  | **Sentry Uptime + Crons as the only uptime/scheduled-job monitoring vendor at M1-M5.** One apex uptime monitor + one cron monitor on `/api/healthz/ready` at M2. PAYG additional monitors only when M5/M6/M7 milestones light up authenticated routes / Stripe / etc.                                                                                  | Same vendor, same BAA, zero new spend, zero new integration surface. BetterStack lacks BAA; CloudWatch Synthetics is high-ops.                                                               |
| **D-M-2**  | **Public status page at `status.my-quilty.com` from M2.** Instatus Pro ($20/mo). Components: marketing site, account portal (post-M5), sign-in, email, subscription (post-M7). Subscribed to Sentry Uptime + Cognito alarms + SES events via webhook. NO PHI on the status page by design.                                                             | Consumer-mental-health peers DON'T have one — opportunity for brand-trust signaling. Atlassian Statuspage's subscriber-tier ratchet rejected. Self-host rejected (circular dependency risk). |
| **D-M-3**  | **No dedicated on-call tool at solo-team scale.** Sentry alerts → operator phone via Sentry's native push + SMS + Slack mobile push. Migration trigger: 2nd engineer joins → **BetterStack On-Call free tier** (NOT PagerDuty, NOT incident.io).                                                                                                       | Solo-team coherence; no rotation = no rotation tool. The hire is the trigger, not anniversary.                                                                                               |
| **D-M-4**  | **AWS security-services baseline on development account: GuardDuty foundational + Security Hub Essentials + AWS Config + Inspector Lambda + HIPAA Conformance Pack.** Skip Macie, Shield Advanced, Network Firewall. Phase 1 marketing-prod re-enables all + adds WAF CloudFront-scope Web ACL.                                                        | Phase 0 ~$30-60/mo; Phase 1 ~$50-150/mo. HIPAA Conformance Pack is the SOC 2 evidence trail even though website is Workloads-NonHIPAA scope.                                                 |
| **D-M-5**  | **AWS Budgets (monthly + daily) + Cost Anomaly Detection on development account from M2.** Infracost on PRs touching `sst.config.ts` or `quilty-aws/website-baseline/`. No Vantage/CloudHealth pre-launch.                                                                                                                                             | Free + native; catches surprise spend before it accumulates. Re-evaluate at $1K/mo AWS spend.                                                                                                |
| **D-M-6**  | **CloudWatch BFF Lambda log retention = 6 years (HIPAA §164.530(j) requirement).** Default 14d retention is load-bearing-incorrect for any future breach risk assessment.                                                                                                                                                                              | One TF line; ~$0.50/mo per GB; the alternative is HIPAA non-compliance on evidence retention.                                                                                                |
| **D-M-7**  | **HIPAA Breach Notification runbook + templates land in `docs/runbook/incidents/` before M8 (legal review).** 4 documents (severity, response playbook, post-mortem template, status-page playbook) + breach-notification subdirectory. Designated Privacy Officer + Security Officer roles named (initially the operator). No Vanta/Drata pre-launch. | Solo-team scale doesn't shrink the legal obligation. Runbook + AWS-native evidence trail + a person are sufficient pre-SOC 2. Templates pre-drafted = response time is 1 hour, not 1 week.   |
| **D-M-8**  | **No second OTel sink, no second observability vendor at M1-M7.** Website OTel goes only to Sentry. Backend OTel (in `quilty-aws/`) goes only to Honeycomb. They don't fan out; they live in separate orgs by design.                                                                                                                                  | Wave 1 Surprise #7 resolved. Adding a 2nd observability vendor doubles BAA surface + cost for marginal redundancy.                                                                           |
| **D-M-9**  | **SEV taxonomy: SEV1 (full outage / PHI risk) detected < 1min, status page within 5min; SEV2 (degraded > 25% users) < 5min, 15min; SEV3 (single feature) < 30min, 60min; SEV4 (cosmetic) < 24h, no public comms. Every incident gets a `phi-exposure-risk: yes/no/unknown` tag at creation.**                                                          | Standardizes the response path. The PHI-risk tag routes to the Breach Notification workflow within 24h regardless of other SEV severity — Cerebral lesson made operational.                  |
| **D-M-10** | **Slack `#alerts-website`, `#alerts-security`, `#alerts-cost` channels with Sentry/SecurityHub/Cost-Anomaly webhooks routing in. No dedicated paging.** Operator's phone Slack mobile-app push covers the off-hours role.                                                                                                                              | Same-vendor consolidation; works at solo-team scale; migration path to dedicated on-call (D-M-3) is clean.                                                                                   |

---

## 11. Open scope questions for the user

1. **HIPAA Privacy Officer + Security Officer designation.** Until a Head of Compliance is hired, both roles are "the operator" — but this needs to be named in writing somewhere (likely `docs/compliance/officers.md`). Does the operator want to formalize this now or defer to M8? **My recommendation: formalize at M2 alongside the runbook spine.** It's 1 line and protects the runbook's integrity.

2. **Status page subdomain reservation.** `status.my-quilty.com` is not in the U1-U8 reserved-subdomain list. Reserving it adds it to the Route 53 `.com` zone records-list. Confirm OK to add to D45's subdomain plan.

3. **Phase 1 cutover timing.** Several of these decisions (WAF for marketing-prod, Macie deferral, security-baseline replication) tee off the Phase 1 trigger (D45). Is the operator firmer than "post-launch/first-revenue" on this? E.g., is there an explicit calendar date or revenue threshold? **My recommendation: tie it to first paid signup (M7), not a calendar date.** The trigger should be event-driven.

4. **Sentry plan tier confirmation.** D42a says "Business tier from day-one." The BAA is Business+ only. Sentry Business is $26/mo + event volume. **Confirm we're not accidentally on Team or Developer tier**, which would invalidate the BAA. Worth a 1-min check in the Sentry billing UI.

5. **Instatus BAA status.** Instatus offers BAA only on Enterprise tier (~$300/mo+ per their pricing page). My recommendation is to NOT need a BAA because the status page contains zero PHI — but this is a load-bearing claim that should be documented in `docs/compliance/data-classification.md`. Does the operator want me/Claude to draft that classification doc, or is the assertion "status page = no PHI" intuitively obvious enough to skip the formal doc?

6. **AWS Config HIPAA Conformance Pack** — when enabled on dev account, it will flag the website's S3 buckets / Lambda / etc. as non-compliant against the HIPAA Conformance Pack rules (e.g., "S3 bucket versioning required," "Lambda environment variables encrypted with CMK"). **This is good — it's the remediation backlog.** But the first compliance scan will produce ~20-50 findings to triage. Does the operator want me to triage that backlog as a separate task at M5, or right after Tier-A items land?

7. **`#alerts-website` Slack channel** — the operator's Slack workspace presumably exists at `quilty.slack.com` or similar. Confirm Slack workspace + that the operator has admin rights to create channels + add incoming webhooks. If not, alternative is Discord (same pattern, slightly different webhook shape).

8. **Sentry → Instatus auto-incident Lambda** — this is a small piece of code (one Lambda fn, ~50 lines of TypeScript, triggered by Sentry webhook). Does it live in `apps/web/sst.config.ts` as a sibling resource, or in `quilty-aws/website-baseline/` as a TF resource? **My recommendation: SST-managed in `apps/web/` because Instatus credentials are website-scoped, not infra-scoped.**

9. **Mobile-app status reporting.** This is out of scope for the website report but worth flagging: the mobile app's outage signaling (PostHog session counts dropping, Sentry mobile project error rates) could feed the same Instatus page as a "Mobile app" component. Cross-team coordination question for the operator: should the website's status page double as the org's status page, or do mobile + web each get separate status surfaces? **My recommendation: one shared `status.my-quilty.com` with separate components for "Marketing site," "Account portal," "Mobile app," "Email," "Subscription."** One page, one subscribe-button, one operator narrative.

10. **Healthcare-specific peer pattern: do we want to be the only consumer-mental-health company with a public status page?** Headspace/Calm/BetterHelp/Talkspace/Cerebral/Mindbloom all opt out. Two interpretations: (a) they know something we don't (status pages invite scrutiny → SLA expectations → lawsuits when missed); (b) they're under-investing in operational maturity and we should differentiate. **My recommendation: (b).** The Stripe/Linear/Vercel-engineering-trust signal is more important than the "don't draw attention to outages" risk at our scale. But this is a brand call, not just an engineering call — worth a 30-second sanity check from the operator.

---

## Appendix — file references + sources

| Topic                           | File                                                                   | Notes                                                                                |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| AWS infra inventory             | `docs/research/round_6_foundation_audit/_raw/01-aws-infra-recon.md`    | §15 observability sinks, §7 WAF gaps                                                 |
| Mobile Sentry org               | `docs/research/round_6_foundation_audit/_raw/02-mobile-stack-recon.md` | Org `quilty-01` project `flutter` — website adds project `web`                       |
| ADR-0004 observability          | `docs/adr/0004-observability-stack.md`                                 | Already locks Sentry + OTel; D-M-1..10 here extend, don't conflict                   |
| D42a Sentry Business            | `docs/website_strategy_discussion.md` line ~115                        | Locked                                                                               |
| D56 OTel-first                  | `docs/website_strategy_discussion.md` line 162                         | Locked                                                                               |
| D63 ConsentState                | `docs/website_strategy_discussion.md` line 179                         | Status page contains zero PHI claim builds on this                                   |
| D70/D71 Lighthouse + size-limit | `docs/website_strategy_discussion.md` line 211-212                     | Cover synthetic CWV gap → no need for Calibre/SpeedCurve                             |
| Existing observability lib      | `apps/web/lib/observability/`                                          | logger, sanitize, web-vitals, replay-classes etc. — wire status updates through here |

**2025-2026 sources cited:**

- Sentry vs BetterStack for solo devs 2026 — https://solodevstack.com/blog/sentry-vs-betterstack-solo-developers
- Sentry pricing + BAA — https://docs.sentry.io/pricing/ + https://sentry.io/security/
- Sentry Cron Monitoring — https://sentry.io/product/cron-monitoring/ + https://docs.sentry.io/product/monitors-and-alerts/monitors/crons/
- BetterStack pricing + HIPAA status — https://betterstack.com/pricing + https://cubeapm.com/blog/sentry-vs-better-stack-vs-cubeapm/
- Statuspage.io alternatives 2026 — https://oneuptime.com/blog/post/2026-03-10-best-statuspage-alternatives/view + https://betterstack.com/community/comparisons/statuspage-alternatives/
- Instatus pricing — https://instatus.com/pricing
- AWS GuardDuty + Security Hub pricing 2025 — https://aws.amazon.com/guardduty/pricing/ + https://aws.amazon.com/security-hub/pricing/ + https://underdefense.com/aws-security-services-cost-calculator-3-scenario-budget-forecast/
- AWS Cost Anomaly Detection — https://aws.amazon.com/startups/prompt-library/cost-anomaly-detection
- incident.io / Rootly / FireHydrant 2026 — https://rootly.com/sre/best-incident-management-platform-2026-rootly-vs-competitors-e0288 + https://incident.io/alternatives/rootly
- Opsgenie sunset April 2027 — https://incident.io/blog/best-open-source-pagerduty-alternatives-2026
- PagerDuty pricing — https://runframe.io/blog/best-pagerduty-alternatives
- HIPAA Breach Notification Rule + 60-day timeline — https://www.accountablehq.com/post/hipaa-breach-notification-rule-60-day-deadline-and-hhs-ocr-requirements + https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html
- Cerebral $7M tracking pixel breach + tracking-tech OCR guidance — https://www.feroot.com/blog/hipaa-breach-notification-rule-60-day-deadline/
- Checkly vs CloudWatch Synthetics — https://www.checklyhq.com/pricing/ + https://www.checklyhq.com/blog/the-real-costs-of-aws-synthetics-are-operational/
- Cronitor pricing + status pages — https://cronitor.io/pricing + https://cronitor.io/status-pages

---

**End of report. ~4,200 words.**
