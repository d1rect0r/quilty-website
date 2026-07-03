# Website Deployment Plan — Infrastructure & Operations

> **Created:** 2026-06-19 · **Last revised:** 2026-06-19 (post-audit, see §12)
> **Owner:** Website team (executes), with `quilty-aws` collaboration on the `website-baseline` layer + DNS/account topology.
> **Status:** Planning — pre-first-deploy. AWS account-structure decisions locked (see `quilty-aws/docs/infrastructure/aws_org_evolution_plan_website_response_2026-06-18.md`); `website-baseline` Terraform layer not yet authored (the primary deploy blocker).
> **Sourced from:** three enterprise-benchmarked research passes (Edge & Delivery / Compute-Deploy-Account / Ops-Resilience-Govern) + a three-agent QA audit (internal consistency / repo-grounding accuracy / enterprise benchmark), reconciled against the actual repo state.

---

## 1. Purpose

This is the single source of truth for **what must exist, be configured, and be operated** to take `my-quilty.com` from "nothing" to a flawless, properly-run live website — and to keep it running. It is the operational counterpart to the strategy/roadmap docs: those say _why_ and _when_; this says _exactly what infrastructure_.

## 2. Scope & exclusions

**In scope** — website-tier + AWS-side + supporting infrastructure/services:

- Domain, DNS, TLS/certs, CDN/CloudFront, edge functions, WAF & perimeter, `.well-known`
- Compute/hosting (OpenNext SSR Lambda, S3 origins, image/revalidation/warmer Lambdas)
- Deployment pipeline & IaC (SST, the `website-baseline` Terraform layer, CI/CD, OIDC, stages, rollback)
- AWS account/org placement, OUs, SCPs, IAM boundaries, tagging
- Secrets & config management
- **Infrastructure** monitoring (uptime/synthetic, infra alarms, cost), backup/DR, retention/lifecycle, CI quality gates, operational governance

**Explicitly OUT of scope** (tracked elsewhere — different clusters of work):

- **Application telemetry as a product concern** — Sentry error reporting, Amplitude analytics, RUM, session replay, PHI scrubbing, consent logic. _Carve-out:_ provisioning the Sentry project + wiring the DSN as a deploy-gate var, and the source-map upload step, ARE in scope as deploy-pipeline mechanics; SDK behaviour configuration is not.
- **Auth / subscription workloads** — Cognito `web_bff` client, BFF token handling, the Rust API. (Tracked as the auth-integration milestone, M5/M6.)
- **Business-verification chores that merely touch the site** — AWS SES production access, Apple/Google developer-org enrollment, D-U-N-S. (Not website-tier infra.)
- **Hidden/visible/UI functionality tiers** — the separate "make functionality flawless" cluster.

## 3. Track model

Four tracks (the research agents' T1–T4 criticality tags map onto these 1:1). "Track 4" is the YAGNI/parking-lot tier.

| Track       | Name                 | Definition                                                                                                                                                             |
| ----------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track 1** | Live + stable + safe | Table-stakes to get the site publicly reachable AND keep it stable as a verification anchor. _Includes core monitoring_ (decision below). Nothing ships without these. |
| **Track 2** | Public-launch-grade  | Everything that must be in place before inviting real traffic: resilient, governed, observable, legitimate.                                                            |
| **Track 3** | Launch hardening     | Careful or irreversible steps (HSTS preload, DNSSEC DS, account migration, CSP enforce), and maturity that lands in the weeks around launch.                           |
| **Track 4** | YAGNI / post-revenue | What large enterprises run that we do not need yet. Enumerated for completeness so nothing is _silently_ missing.                                                      |

**Locked decision (2026-06-19):** because the site must **stay deployed and stable as a verification anchor**, core monitoring is pulled into **Track 1** — synthetic canaries, CloudFront-5xx + Lambda-error alarms, an SNS alert topic (email + Slack), AWS Budgets + Cost Anomaly Detection, plus the account threat-detection baseline (GuardDuty) and the log-buckets the canaries/WAF write to. The fuller observability stack (dashboards, status page, PagerDuty, AWS Health events) stays Track 2. This raises the realistic Track 1 estimate to **~1.5–2 weeks**.

**Status legend:** ✅ done · 🔧 partial / needs change · ➕ to build (greenfield) · ⛔ blocker / not started · ⏳ pending external sequencing · 🔎 verify

---

## 4. Critical path (how the first deploy actually happens)

The deploy is sequential and cross-repo. The **linchpin is `quilty-aws/website-baseline/`** — it vends everything `sst deploy` hard-gates on, and (per the monitoring decision above) it now also carries the canaries/alarms/SNS/budgets/log-bucket IaC.

1. **Account/OU** — repurpose `development` → `marketing-prod` (rename + OU move only; account ID `619758066987` unchanged), place in **Workloads/Production** OU, attach the minimal SCP denying PHI KMS/S3/data-plane. _(quilty-aws; org-tree ops, reversible.)_
2. **`website-baseline` Terraform** — author + apply: GitHub OIDC provider, `dev` + `preview` deploy roles + permission boundaries, WAF Web ACL, SSM params (WAF ARN, alerts-topic ARN, CF-log-bucket domain, hosted-zone ID), Secrets Manager pseudonym pepper, **plus** canaries/alarms/SNS/budgets/log-buckets, **and the ACM cert** (D-T1-5, `enable_website_certificate`). _(quilty-aws; the primary blocker. Resolved: standalone WAF ACL + PAYG, see §10.)_
3. **Website prep** — create Sentry project + DSN (deploy-gate var); set GitHub `production` environment protection (required reviewer); enable GHAS secret scanning. _(Note: the `sst.config.ts` gaps (image-opt memory, `warm:2`, price class, TLS min, invalidation, IPv6) are CLOSED; the M2 alarms/access-logging/dashboard + `deploy.yml` env wiring + `/api/health` + the `sst-deploy.md`/`log-retention.md` runbooks already exist — see §12.)_
4. **ACM cert (Pattern A, D-T1-5)** — quilty-aws `website-baseline/acm.tf` creates the us-east-1 `.com` cert (NOT SST), then `quilty-aws/dns/` writes the validation CNAMEs cross-account into the `.com` zone. Wait for ISSUED, then set `QUILTY_WEB_ACM_CERT_ARN` repo var.
5. **First `sst deploy --stage dev`** — provisions CloudFront + SSR Lambda + S3 and attaches the pre-issued cert. Capture the CloudFront distribution domain.
6. **Pattern A DNS apply** (`quilty-aws/dns/`, `website_cloudfront_domain` set) — apex/www alias (A + AAAA) → distribution. Apply sitewide `noindex`. Verify canaries green, alarms armed, WAF blocking. **Site is live + stable + hidden-from-search.**

> The `auth.my-quilty.com` custom-domain flip and the `web_bff` Cognito client are **deliberately deferred** (auth-integration milestone), and depend on this deploy completing first.

---

## 5. Track 1 — Live, stable, safe (the working set)

### 5.1 Edge & Delivery

| ID  | Item                                                       | Configure / mechanism                                                                                                                                                                                                                                | Cadence              | Status                                                                                                                                                                                           |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | Registrar transfer lock                                    | `clientTransferProhibited` on `.com`/`.app`/`.net` at Porkbun                                                                                                                                                                                        | one-time             | 🔎 verify                                                                                                                                                                                        |
| E2  | Registrar auto-renew                                       | Auto-renew ON + valid payment method; consider 5–10yr registration                                                                                                                                                                                   | one-time             | 🔎 verify                                                                                                                                                                                        |
| E3  | WHOIS privacy                                              | Enabled at Porkbun                                                                                                                                                                                                                                   | one-time             | 🔎 verify                                                                                                                                                                                        |
| E4  | Registrar 2FA                                              | MFA on the Porkbun account                                                                                                                                                                                                                           | one-time             | 🔎 verify                                                                                                                                                                                        |
| E5  | Hosted zones (zone-as-code)                                | Route 53 zones in prod account, Terraform-managed                                                                                                                                                                                                    | one-time             | ✅ done                                                                                                                                                                                          |
| E6  | Apex A/AAAA alias → CloudFront                             | Pattern A two-step; alias to CF zone `Z2FDTNDATAQYW2`                                                                                                                                                                                                | one-time             | ⛔ pending (post-SST; see §9 Pattern A)                                                                                                                                                          |
| E7  | `www` → apex 301                                           | Redirect at SST/CloudFront                                                                                                                                                                                                                           | one-time             | ✅ planned in SST                                                                                                                                                                                |
| E8  | CAA records                                                | Lock issuance to Amazon CAs (`amazon.com`, `amazontrust.com`)                                                                                                                                                                                        | one-time             | 🔧 `.com` done; `.app` missing `amazontrust.com`                                                                                                                                                 |
| E9  | DNS query logging                                          | Route 53 → CloudWatch/log-archive                                                                                                                                                                                                                    | ongoing              | ✅ done                                                                                                                                                                                          |
| E10 | Email auth records (SPF/DKIM/DMARC)                        | In `.com` zone                                                                                                                                                                                                                                       | one-time             | ✅ done                                                                                                                                                                                          |
| E11 | ACM cert `my-quilty.com` + `www.my-quilty.com` (us-east-1) | DNS-validated; CloudFront requires us-east-1, same account as the distribution. **D-T1-5 / Pattern A:** quilty-aws `website-baseline/acm.tf` creates it (NOT SST); validation CNAMEs written cross-account into the `.com` zone by quilty-aws `dns/` | one-time(auto-renew) | 🔧 scaffolded (var-gated `enable_website_certificate`) → created at Phase D                                                                                                                      |
| E12 | TLS min protocol `TLSv1.2_2021`                            | CloudFront viewer policy (upgrade to `TLSv1.2_2025` in Track 3)                                                                                                                                                                                      | one-time             | ✅ done (`minimumProtocolVersion` set in `sst.config.ts`)                                                                                                                                        |
| E13 | OCSP stapling                                              | CloudFront automatic                                                                                                                                                                                                                                 | —                    | ✅ auto                                                                                                                                                                                          |
| E14 | Distribution topology                                      | OpenNext: S3 static + Lambda SSR + image origins                                                                                                                                                                                                     | one-time             | ✅ SST                                                                                                                                                                                           |
| E15 | Cache policies per behavior                                | `_next/static`+assets 365d immutable; **`/api/*`, `/auth/*`, SSR HTML = `CachingDisabled`/no-store** (zero-PHI rule D31)                                                                                                                             | one-time             | 🔧 verify no-store on dynamic                                                                                                                                                                    |
| E16 | OAC (S3 lockdown)                                          | S3 reachable only via CloudFront OAC                                                                                                                                                                                                                 | one-time             | ✅ SST auto                                                                                                                                                                                      |
| E17 | Compression (Brotli+Gzip)                                  | CloudFront automatic on text                                                                                                                                                                                                                         | one-time             | ✅ SST; 🔎 verify                                                                                                                                                                                |
| E18 | HTTP→HTTPS + apex/www canonical                            | CloudFront redirect                                                                                                                                                                                                                                  | one-time             | ✅ SST                                                                                                                                                                                           |
| E19 | Cache invalidation (basic `/*`)                            | On deploy; OpenNext handles hashed assets                                                                                                                                                                                                            | per-deploy           | ✅ done (`invalidation: { paths: 'all', wait: true }`)                                                                                                                                           |
| E20 | Price class `PriceClass_100`                               | Cost control (US/EU edges). _Becomes free `PriceClass_All` if flat-rate plan adopted — see §10_                                                                                                                                                      | one-time             | ✅ done (`PriceClass_100` set)                                                                                                                                                                   |
| E21 | IPv6 + AAAA alias                                          | Enable on distribution + AAAA record                                                                                                                                                                                                                 | one-time             | ✅ done (`isIpv6Enabled` + apex/www AAAA aliases in quilty-aws `dns/website_com.tf`)                                                                                                             |
| E22 | CFF `security-headers`                                     | HSTS/XCTO/XFO/COOP/CORP injection. _Track 2 (E2-10): migrate static headers to native Response Headers Policy_                                                                                                                                       | —                    | 🗑 RETIRED (Wave-1 close-out) — superseded by the live ResponseHeadersPolicy (E2-10); the cf-functions workspace was deleted (TW-023 closed-superseded).                                         |
| E23 | CFF `gpc-force-off`                                        | `Sec-GPC:1` → default-deny consent cookie                                                                                                                                                                                                            | —                    | 🗑 RETIRED (Wave-1 close-out) — duplicated the proxy.ts GPC force-off that runs on every HTML response (no CloudFront-cached HTML exists to cover); workspace deleted.                           |
| E24 | CFF `robots-tag-defense`                                   | `X-Robots-Tag: noindex` on `/api`,`/auth`,`/account`,`/dev`,status                                                                                                                                                                                   | —                    | 🗑 RETIRED (Wave-1 close-out) — duplicated the proxy.ts per-path X-Robots-Tag; workspace deleted.                                                                                                |
| E25 | WAF Web ACL (CLOUDFRONT)                                   | Common + KnownBadInputs + IpReputation + **Bot Control (Common)** + **Host-header allowlist** (`my-quilty.com`/`www`) + rate-limit; ATP deferred to auth milestone; **hard deploy gate**                                                             | ongoing              | ✅ done — `quilty-marketing-prod-cloudfront-waf` live in `website-baseline/waf.tf`, attached to the distribution; SQLi/BotControl/AnonymousIP in COUNT pending the Wave-3 flip (launch-gate.md). |
| E26 | Origin-bypass protection                                   | OAC-signed Lambda URL                                                                                                                                                                                                                                | one-time             | ✅ SST auto                                                                                                                                                                                      |
| E27 | robots policy (AI-crawler policy D66)                      | `app/api/robots/route.ts` (+ `robots.spec.ts`, `x-robots-tag.spec.ts`)                                                                                                                                                                               | ongoing              | ✅ done (dynamic route, not `robots.ts`)                                                                                                                                                         |
| E28 | `sitemap.xml`                                              | `sitemap.ts`                                                                                                                                                                                                                                         | dynamic              | ✅ done                                                                                                                                                                                          |
| E29 | `manifest.webmanifest`                                     | `manifest.ts` (PWA manifest)                                                                                                                                                                                                                         | one-time             | ✅ done                                                                                                                                                                                          |
| E30 | Sitewide `noindex` (placeholder phase)                     | Meta + header until launch; drop at go-public                                                                                                                                                                                                        | toggle               | ✅ done (`SITE_FORCE_NOINDEX` env → `next build` X-Robots-Tag + runtime; deploy.yml SEO fail-safe verify)                                                                                        |

### 5.2 Compute & Hosting

| ID  | Item                                       | Configure / mechanism                                                                                                                                                                                        | Cadence  | Status                           |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------- |
| C1  | SSR Lambda config                          | arm64, 1024 MB, 15 s timeout, reserved concurrency 100, 6yr JSON logs, `retainOnDelete`                                                                                                                      | one-time | ✅ done                          |
| C2  | Image-optimization Lambda memory           | Explicit `imageOptimization: { memory: '1536 MB' }` (Sharp)                                                                                                                                                  | one-time | ✅ done (1536 MB + `staticEtag`) |
| C3  | Revalidation Lambda + SQS FIFO             | OpenNext auto-provisions                                                                                                                                                                                     | auto     | ✅ auto (DLQ → Track 2)          |
| C4  | Warmer Lambda                              | `warm: 2` in `sst.config.ts` (SST API; not `open-next.config.ts`). _Aug-2025 INIT billing makes cold starts a cost item; if cold-start rate >5% post-launch, upgrade to provisioned concurrency 2 (Track 2)_ | one-time | ✅ done (`warm: 2`)              |
| C5  | S3 static-assets bucket                    | OAC + versioning + `forceDestroy:false` (dev) + tags                                                                                                                                                         | one-time | ✅ done                          |
| C6  | S3 ISR cache bucket + DDB tag table        | OpenNext auto-provisions                                                                                                                                                                                     | auto     | ✅ auto                          |
| C7  | Account-level Lambda concurrency guardrail | Reserved 100 protects shared dev-account pool                                                                                                                                                                | one-time | ✅ done                          |
| C8  | SST/Pulumi state bucket                    | Auto-created on first deploy; versioning on                                                                                                                                                                  | auto     | ⏳ on first deploy               |
| C9  | SST state passphrase                       | SSM SecureString + **back up to 1Password** (loss = unrecoverable IaC)                                                                                                                                       | one-time | ➕ back up after first deploy    |
| C10 | `sst.config.ts` app definition             | Deploy gate + 3 hard env guards + 8 typed tags                                                                                                                                                               | —        | ✅ done                          |
| C11 | `/api/health` endpoint                     | Lightweight Route Handler (no DB) for canaries/health-checks                                                                                                                                                 | one-time | ✅ done (`route.ts` + tests)     |

### 5.3 Build, Deploy & Account

| ID  | Item                                     | Configure / mechanism                                                                                                                  | Cadence      | Status                               |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------ |
| B1  | **`website-baseline` Terraform layer**   | OIDC provider + `dev`/`preview` deploy roles + permission boundaries + WAF ACL + SSM params + pepper secret (+ Track-1 monitoring IaC) | one-time     | ⛔ **PRIMARY BLOCKER — not started** |
| B2  | OIDC deploy roles                        | Branch/PR-scoped trust; no static keys                                                                                                 | one-time     | ⛔ in B1                             |
| B3  | IAM permission boundaries                | Cap deploy roles to `quilty-web-*` ARNs; deny escalation/PHI                                                                           | one-time     | ⛔ in B1                             |
| B4  | Account placement                        | Repurpose `development`→`marketing-prod` (rename + OU move only — the org-tree op), ID unchanged                                       | one-time     | ⏳ org decision (locked)             |
| B5  | OU placement                             | **Workloads/Production** (NOT Non-Prod)                                                                                                | one-time     | ⏳ apply                             |
| B6  | SCP — deny PHI access (minimal)          | Deny PHI KMS/S3/data-plane (ARN-condition syntax). Critical-path step 1. _Full hardened suite → T3-5_                                  | one-time     | ⛔ in critical path                  |
| B7  | CI workflow (`ci.yml`)                   | 8 jobs incl. hygiene/typecheck/test/e2e/build/size-limit                                                                               | ongoing      | ✅ done                              |
| B8  | Deploy workflow (`deploy.yml`)           | preview / cleanup / deploy-prod; pepper-env wired ✅; remaining action = flip `DEPLOY_ENABLED`                                         | ongoing      | 🔧 inert (flip gate)                 |
| B9  | GitHub `production` env protection       | Required reviewer + branch restriction + scoped secrets                                                                                | one-time     | ➕ set in GitHub UI                  |
| B10 | Node/pnpm pinning + frozen lockfile      | `.nvmrc` + `packageManager` + `--frozen-lockfile`                                                                                      | one-time     | ✅ done                              |
| B11 | Resource tagging (in code)               | 8 typed tags via transforms                                                                                                            | —            | ✅ done                              |
| B12 | Cost-allocation tag activation           | Activate `quilty:*` tags in Billing console                                                                                            | one-time     | ➕ console step                      |
| B13 | Rollback procedure                       | `git revert` + redeploy from known-good SHA → documented in `rollback.md` (see O10)                                                    | one-time doc | ➕ → O10                             |
| B14 | GHAS secret scanning + Dependabot alerts | Enable in GitHub repo settings (near-zero cost; catches leaked DSN/pepper). Complements pre-commit gitleaks                            | one-time     | ➕                                   |

### 5.4 Secrets & Config

| ID  | Item                                 | Configure / mechanism                                                                     | Cadence  | Status                  |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------- | -------- | ----------------------- |
| S1  | Pseudonym pepper secret              | Secrets Manager → deploy-time `QUILTY_PSEUDONYM_PEPPER`                                   | one-time | ⛔ in B1                |
| S2  | SSM cross-stack params               | WAF ARN, hosted-zone ID; strict-path IAM                                                  | one-time | ⛔ in B1                |
| S3  | Typed fail-closed env (`lib/env.ts`) | `@t3-oss/env-nextjs` + Zod, boot-time validation (ADR-0030)                               | —        | ✅ done                 |
| S4  | Sentry DSN (deploy-gate var)         | Create Sentry project; wire `NEXT_PUBLIC_SENTRY_DSN` as deploy-gate var (pipeline prereq) | one-time | ➕ create project + DSN |

### 5.5 Ops, Resilience & Monitoring (pulled into Track 1)

| ID  | Item                                     | Configure / mechanism                                                                                                                     | Cadence  | Status                     |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------- |
| O1  | CloudWatch Synthetics canaries           | Apex + `/en/features`,`/pricing`,`/science`,`/legal/privacy` + `/api/health`; every 1–5 min; us-east-1; IaC in `website-baseline/`        | ongoing  | ➕                         |
| O2  | CloudFront alarm — 5xx / origin latency  | `5xxErrorRate>1%` (3×1min) → SNS; composite w/ `OriginLatency`                                                                            | ongoing  | ➕                         |
| O3  | Lambda alarm — errors/throttles/duration | `Errors>5`/min, `Throttles>0`, `Duration p95>10s`, concurrency→80                                                                         | ongoing  | ➕                         |
| O4  | SNS alert topic (email + Slack)          | `quilty-web-critical` → email + AWS Chatbot→Slack (free, 20-min setup). PagerDuty → Track 2                                               | one-time | ➕                         |
| O5  | AWS Budgets                              | Monthly account + per-`quilty:service` tag budget; 80% forecast / 100% actual                                                             | ongoing  | ➕                         |
| O6  | AWS Cost Anomaly Detection               | Monitors CloudFront/Lambda/S3/CW-Logs; >$50 → SNS                                                                                         | ongoing  | ➕                         |
| O7  | Route 53 Accelerated Recovery            | Enable on `my-quilty.com` zone (zero cost, 60-min RTO). ⚠ _Incompatible with CloudFront flat-rate plans — gate on §10 decision_           | one-time | ➕                         |
| O8  | CloudFront access logs → S3 + lifecycle  | Standard Logging v2 (⚠ not native in TF provider — use Delivery API / CFN custom resource, or v1 fallback); IA@30d→Glacier@90d→expire 2yr | ongoing  | ➕                         |
| O9  | WAF logs → CloudWatch + retention        | `/aws/waf/quilty-web-*`, 1yr; metric filter on `BLOCK`                                                                                    | ongoing  | ➕                         |
| O10 | Core runbooks                            | `sst-deploy.md` ✅ + `log-retention.md` ✅ exist; `dr.md` (restore procedure) ➕ + `rollback.md` ➕ to write                              | one-time | 🔧 two exist, two to write |
| O11 | Source-map upload verification           | Confirm `withSentryConfig` uploads on deploy (pipeline mechanics)                                                                         | one-time | 🔎 verify                  |
| O12 | GuardDuty (account threat detection)     | Enable on the account (<$5/mo single-account); covers IAM-credential compromise — the other half of the Cerebral breach vector            | one-time | ➕                         |

---

## 6. Track 2 — Public-launch-grade

### 6.1 Edge & Delivery

| ID    | Item                                           | Notes                                                                                                                                                                                          | Status                                 |
| ----- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| E2-1  | Custom error pages (CloudFront-level)          | Map S3/Lambda errors to branded pages; correct status codes                                                                                                                                    | 🔧 components exist, CF config missing |
| E2-2  | Locale-default redirect                        | `/` → `/en` at edge/proxy                                                                                                                                                                      | ✅ proxy.ts                            |
| E2-3  | `auth.my-quilty.com` delegation                | CNAME for Cognito custom domain (auth milestone)                                                                                                                                               | ⏳ deferred                            |
| E2-4  | Third-party verification TXT                   | Google Search Console, etc.                                                                                                                                                                    | 🔧 partial (M365, GSC)                 |
| E2-5  | HSTS proper (`max-age≥1yr; includeSubDomains`) | Ramp from scaffold `max-age=300` (runbook `hsts-preload-gate.md` exists)                                                                                                                       | 🔧 escalation not wired                |
| E2-6  | Certificate Transparency monitoring            | crt.sh / Cert Spotter feed alerting                                                                                                                                                            | ➕                                     |
| E2-7  | `.well-known/security.txt`                     | RFC 9116 contact + `Expires`                                                                                                                                                                   | ➕                                     |
| E2-8  | `.well-known/change-password`                  | Password-manager deep-link                                                                                                                                                                     | ➕                                     |
| E2-9  | Defensive typo domain                          | `myquilty.com` (no-hyphen) register + redirect                                                                                                                                                 | ➕                                     |
| E2-10 | CloudFront Response Headers Policy (static)    | Move static headers (HSTS/XCTO/XFO/Referrer-Policy) from CFF to native RHP; keep CFF for dynamic-only (GPC/nonce/conditional robots) — reduces CFF maintenance surface (root of E23 bug class) | ➕                                     |

### 6.2 Compute & Hosting

| ID   | Item                              | Notes                                                                               | Status         |
| ---- | --------------------------------- | ----------------------------------------------------------------------------------- | -------------- |
| C2-1 | Revalidation SQS DLQ + alarm      | Failed revalidations silently dropped otherwise                                     | ➕             |
| C2-2 | Image-opt explicit arm64 + `etag` | Avoid Sharp cross-arch issues; 304s                                                 | ➕             |
| C2-3 | Response streaming config         | `open-next.config.ts` streaming wrapper for portal routes; CloudFront non-buffering | ➕             |
| C2-4 | Lambda concurrency quota increase | Shared dev-account pool may be tight                                                | ➕             |
| C2-5 | Assets bucket lifecycle           | Noncurrent versions expire 30d                                                      | ➕             |
| C2-6 | Provisioned concurrency (trigger) | Upgrade from `warm:1` if cold-start rate >5% or p99 TTFB >800ms post-launch         | ➕ conditional |

### 6.3 Build, Deploy & Account

| ID   | Item                                        | Notes                                                                                                  | Status                                                                                                         |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| B2-1 | `marketing-prod` baseline controls          | Apply account-baseline module + billing separation (account already renamed in B4)                     | ⏳                                                                                                             |
| B2-2 | Preview-env orphan GC + log-retention cap   | Weekly stage-vs-open-PR reconcile; preview logs 7d                                                     | ➕                                                                                                             |
| B2-3 | CMK encryption                              | S3 + SSM SecureStrings + Secrets Manager                                                               | ➕                                                                                                             |
| B2-4 | AWS Tag Policy (core value set)             | OU-level value standardization for `quilty:env`/`cost-center`. _Full mandatory-tag enforcement → T3-9_ | ➕                                                                                                             |
| B2-5 | Turbo remote cache activation               | `TURBO_TEAM`/`TOKEN` wired; activate cache                                                             | 🔧                                                                                                             |
| B2-6 | Runtime Secrets Manager fetch for pepper    | Removes redeploy-on-rotation                                                                           | ✅ done (T2-15; Wave-1 removed the deploy-time env copy entirely — runtime-only, same posture as the CSRF key) |
| B2-7 | `CODEOWNERS` for `.github/`+`sst.config.ts` | IaC-aware review gate                                                                                  | ➕                                                                                                             |
| B2-8 | SHA-pin third-party GitHub Actions          | Pin `uses:` to commit SHAs (tj-actions-class supply-chain defense). _Before first real deploy_         | ➕                                                                                                             |

### 6.4 Ops, Resilience & Governance

| ID    | Item                                        | Notes                                                                 | Status |
| ----- | ------------------------------------------- | --------------------------------------------------------------------- | ------ |
| O2-1  | PagerDuty escalation                        | PagerDuty webhook on `quilty-web-critical` (Slack already Track 1 O4) | ➕     |
| O2-2  | AWS Health events → EventBridge → SNS       | Proactive maintenance/incident notice                                 | ➕     |
| O2-3  | CloudWatch dashboard (web tier)             | CF/Lambda/WAF/canary widgets                                          | ➕     |
| O2-4  | Public status page                          | Better Stack / Instatus; wired to canaries                            | ➕     |
| O2-5  | Route 53 health checks (apex)               | Data-plane; gates failover later                                      | ➕     |
| O2-6  | WAF blocked-request spike alarm             | `>3×` baseline → SNS                                                  | ➕     |
| O2-7  | `.well-known` + security.txt runtime canary | Asserts 200 + `Expires` freshness                                     | ➕     |
| O2-8  | ACM / TLS expiry monitoring (canary)        | Alert <45d remaining (auto-renew safety net)                          | ➕     |
| O2-10 | RTO/RPO targets documented                  | Phase 0 48h/24h; Phase 1 6h/1h                                        | ➕     |
| O2-11 | S3 log-bucket governance                    | Delivery-principal-only writes, PAB, encryption                       | ➕     |
| O2-12 | Lighthouse CI → blocking + mobile preset    | Currently informational/desktop-only                                  | 🔧     |
| O2-13 | Broken-link checker in CI                   | `lychee`/`linkinator` on build output                                 | ➕     |
| O2-14 | Field CWV (Google Search Console CrUX)      | Free aggregate field data, no SDK                                     | ➕     |
| O2-15 | On-call / escalation path                   | P1/P2/P3 + MTTR targets                                               | ➕     |
| O2-16 | IaC compliance scanning (Checkov/Trivy)     | CI step on Pulumi graph + TF                                          | ➕     |
| O2-17 | CodeQL + Dependabot auto-merge              | (secret scanning moved to Track 1 B14)                                | ➕     |
| O2-18 | Scheduled prod smoke tests                  | Playwright smoke subset vs live URL, hourly                           | ➕     |
| O2-19 | AWS Security Hub + Inspector                | CSPM + Lambda vuln scan (GuardDuty now Track 1 O12)                   | ➕     |
| O2-20 | Renovate `minimumReleaseAge` → 7d           | Currently 3d (supply-chain safety)                                    | 🔧     |

---

## 7. Track 3 — Launch hardening (careful / irreversible / weeks-around-launch)

| ID    | Item                                             | Notes                                                                                                                                                                                                           | Status         |
| ----- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| T3-1  | **DNSSEC DS publication** at Porkbun             | IaC done; DS at registrar is fiddly/irreversible (SERVFAIL risk). **Wire `DNSSECInternalFailure` + `KeySigningKeysNeedingAction` alarms** + annual KSK-rotation runbook at the same time (KMS key in us-east-1) | 🔧             |
| T3-2  | **HSTS preload submission**                      | Irreversible-ish; only after all subdomains confirmed HTTPS-only (`hsts-preload-gate.md` runbook exists)                                                                                                        | 🔧             |
| T3-3  | **Phase 1 account migration**                    | Cut deploy target `development`→`marketing-prod`; raise/remove SSR reserved-concurrency cap (set per-fn 500 or unreserved; verify account quota)                                                                | ⏳             |
| T3-5  | Full SCP suite                                   | Expands B6: ARN-condition PHI deny + leave-org deny + IAM-key deny, etc.                                                                                                                                        | ➕             |
| T3-7  | CloudFront Continuous Deployment (canary) wiring | Blue-green ≤15% traffic split                                                                                                                                                                                   | ➕             |
| T3-8  | Scheduled drift detection                        | `sst diff`/`pulumi preview --expect-no-changes` → GH issue                                                                                                                                                      | ➕             |
| T3-9  | AWS Organizations Tag Policies (full)            | Full mandatory-tag enforcement + non-compliant alerting (expands B2-4)                                                                                                                                          | ➕             |
| T3-11 | CloudWatch Logs Insights saved queries           | Pre-built incident queries                                                                                                                                                                                      | ➕             |
| T3-12 | Visual regression                                | Playwright `toHaveScreenshot` (Linux CI) first; Percy only when design system stable + page count >20                                                                                                           | ⏳ post-M3     |
| T3-13 | GameDay / restore drill                          | Prove the DR runbook; measure actual RTO                                                                                                                                                                        | ➕             |
| T3-14 | AWS Config rules                                 | Change-history compliance evidence                                                                                                                                                                              | ➕             |
| T3-15 | Post-mortem template + culture                   | Blameless; GH-issue action tracking                                                                                                                                                                             | ➕             |
| T3-16 | CloudFront origin-group separation verify        | Static vs SSR origin isolation                                                                                                                                                                                  | ➕             |
| T3-17 | Preview CloudFront distribution quota monitoring | 200/account default cap                                                                                                                                                                                         | ➕             |
| T3-18 | MTA-STS + `mta-sts.txt`                          | Inbound-mail transport hardening                                                                                                                                                                                | ➕             |
| T3-19 | Vanity/campaign redirect CFF                     | First marketing campaign                                                                                                                                                                                        | ➕             |
| T3-20 | Geo rules (api/auth)                             | Reduce abuse surface                                                                                                                                                                                            | ➕             |
| T3-21 | Shield Advanced evaluation                       | At Phase 1                                                                                                                                                                                                      | ➕             |
| T3-22 | Cross-TLD edge redirects                         | `.net`/`.app` → canonical                                                                                                                                                                                       | ➕             |
| T3-23 | Subresource Integrity (SRI)                      | If any external `<script>` is added                                                                                                                                                                             | ➕             |
| T3-24 | CloudWatch Log-volume budget alarm               | CW Logs ingestion cost spiral guard                                                                                                                                                                             | ➕             |
| T3-25 | CloudFront real-time logs (Kinesis)              | Conditional on WAF event-response need; always-on variant → Track 4                                                                                                                                             | ➕ conditional |
| T3-26 | SLSA build provenance attestation                | `actions/attest-build-provenance` (SHA-pinning itself moved to Track 2 B2-8)                                                                                                                                    | ➕             |
| T3-27 | CSP report-only → enforce                        | Flip once the CSP violation report stream is clean (2–4 wk window)                                                                                                                                              | ➕             |
| T3-28 | TLS policy upgrade `TLSv1.2_2025`                | Tighten cipher suite (from E12's `TLSv1.2_2021`)                                                                                                                                                                | ➕             |
| T3-29 | AWS Firewall Manager (WAF governance)            | OU-scoped WAF policy enforcement once ≥3 accounts (post Phase 1 migration); prevents WAF drift                                                                                                                  | ➕             |

---

## 8. Track 4 — YAGNI / post-revenue / enterprise-scale

Enumerated so nothing is _silently_ missing. None of these are needed for a correct launch.

| Item                                                        | Why deferred                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registry lock (`serverTransferProhibited`)                  | Registrar lock sufficient pre-scale                                                                                                              |
| Lambda@Edge for SSR                                         | CFF + regional Lambda cheaper/faster                                                                                                             |
| Multi-region active-active SSR + CloudFront origin failover | Op complexity ≫ DTC availability need                                                                                                            |
| S3 cross-region replication (assets)                        | Assets are re-deployable                                                                                                                         |
| **SST/Pulumi state bucket cross-region replication**        | State is reconstructible via `sst refresh`; versioning + MFA-delete + Object Lock suffices (moved from Track 2)                                  |
| **PrivateLink BFF→API**                                     | BFF→API is already Cognito-auth'd HTTPS over non-public Lambda URL; VPC+NAT+endpoints (~$22+/mo) not justified at Phase 0–1 (moved from Track 3) |
| **CUR → S3 → Athena billing analytics**                     | Cost Explorer hourly + O6 Cost Anomaly Detection suffice until multi-account FinOps (moved from Track 3)                                         |
| Application Signals + X-Ray SLO service map                 | Sentry traces cover Phase 0–1                                                                                                                    |
| AWS Resilience Hub RTO/RPO scoring                          | Useful as B2B evidence later                                                                                                                     |
| Lambda canary / weighted-alias traffic shifting             | Low deploy frequency; redeploy rollback fine                                                                                                     |
| Lambda SnapStart                                            | Node already starts fast (Java-focused)                                                                                                          |
| CloudFront access-log Athena analytics pipeline             | No traffic to analyze pre-launch                                                                                                                 |
| Role Vending Machine (RVM)                                  | Justified >10 engineers                                                                                                                          |
| Pulumi Cloud Enterprise (auto drift remediation)            | Scheduled `sst diff` is equivalent                                                                                                               |
| Multi-AZ NAT Gateway                                        | No VPC at Phase 0; single NAT fine at Phase 1                                                                                                    |
| Spacelift / Atlantis for TF                                 | `quilty-aws` team decision                                                                                                                       |
| `llms.txt`                                                  | After content strategy finalized                                                                                                                 |
| Comprehensive brand-protection (GlobalBlock, ccTLDs)        | Typo `.com` is the only near-term risk                                                                                                           |
| CloudFront real-time logs → Kinesis (always-on)             | Standard + WAF logs sufficient; conditional variant → T3-25                                                                                      |

---

## 9. Cross-repo dependencies (what `quilty-aws` must deliver)

| Item                                                                     | quilty-aws location                  | Blocks                                 |
| ------------------------------------------------------------------------ | ------------------------------------ | -------------------------------------- |
| Account repurpose + OU move + PHI-deny SCP                               | `management/` + org tree             | Track 1 deploy (B4/B5/B6)              |
| **`website-baseline/` layer** (OIDC, WAF, SSM, pepper, + monitoring IaC) | `quilty-aws/website-baseline/` (new) | **Everything — primary blocker (B1)**  |
| Pattern A DNS records (ACM validation + apex/www alias)                  | `quilty-aws/dns/`                    | E6, E11 (cert validation + resolution) |
| Route 53 Accelerated Recovery enable                                     | `quilty-aws/dns/`                    | O7                                     |
| `auth.my-quilty.com` custom-domain flip                                  | `quilty-aws/auth/`                   | Auth milestone (deferred)              |
| `web_bff` Cognito client + cross-account secret distribution             | `quilty-aws/auth/`                   | Auth milestone (deferred)              |

## 10. Open decisions / verifications

- **CloudFront flat-rate pricing plan (Nov 2025)** — ✅ RESOLVED: `website-baseline/` was authored (and is now live) with a **standalone WAF ACL** + `PriceClass_100`, deliberately NOT the flat-rate plan — preserving Route 53 Accelerated Recovery (O7) + the price-class control (E20). This "resolve before authoring" note predated the now-live layer.
- **CFF vs Response Headers Policy** — ✅ DONE (Track-2 T2-6/T2-7): static headers (incl. the apex-only HSTS ramp) are on the native ResponseHeadersPolicy; the CFF workspace was deleted at the Wave-1 close-out (TW-023 closed-superseded). See `quilty-aws` Track-2.
- **OU/SCP final shape** — ✅ RESOLVED (Track-2 T2-1): marketing-prod was moved to a dedicated **Customer-Surface OU** (activating the `phi_deny` SCP + the `hipaa_eligible_only` service allowlist).
- **`shared-services` account + Vault Lock mode** — GOVERNANCE vs COMPLIANCE (confirm with auditor); still deferred (needs auditor; out of the Track-2 AWS-side scope per D-T2-A).
- **GPC `functional` value** (E23) — ✅ RESOLVED / was never a bug: `functional: true` is consistent across the CFF, `proxy.ts`, and the parity test — the spec-correct CCPA §7025 narrow reading. No code/test change is needed (the "parity bug" framing was stale).
- **Verify** at first deploy: cache no-store on dynamic routes (E15), Brotli (E17), SST state versioning (C8), source-map upload (O11), CAA `.app` completeness (E8).

---

## 11. Realistic effort

- **Track 1:** ~1.5–2 weeks focused (dominated by authoring `website-baseline` + monitoring IaC; calendar slips on DNS/ACM propagation and the cross-account ceremony). Website authors IaC; an operator runs `terraform apply` / `sst deploy` (prod is human-gated).
- **Track 2:** ~2–3 weeks, parallelizable; gates _public_ launch, not _live-hidden_.
- **Track 3:** weeks around launch; sequence the irreversibles (DNSSEC DS, HSTS preload, CSP enforce) last.

---

## 12. Audit pass (2026-06-19)

Three QA agents reviewed this doc (internal consistency / repo-grounding accuracy / enterprise benchmark). Findings were verified against the repo and folded in. Key corrections and additions:

**Accuracy corrections (stale "to-do" items that already exist — removed from critical path):**

- `/api/health` (C11) **exists** (`route.ts` + tests) → was wrongly `➕`.
- `sst-deploy.md` + `log-retention.md` (O10) **exist** → "referenced but absent" was false; only `dr.md` + `rollback.md` remain.
- `deploy.yml` `QUILTY_PSEUDONYM_PEPPER` env (B8) **already wired** (fixed 2026-06-03) → bug clause removed.
- robots policy (E27) **exists** at `app/api/robots/route.ts` (the grounding agent searched only for `robots.ts`) → kept ✅, mechanism label corrected.
- ACM `.com` cert (E11) does **not** exist (only `.app`) → status corrected to "SST creates on first deploy."
- E23 was NOT a bug (corrected 2026-07, Track-2 T2-16): `functional: true` is spec-correct (CCPA §7025 narrow reading) and already consistent across the CFF, `proxy.ts`, and the parity test — nothing to fix.

**Scope & naming fixes:** "Tier 4" → "Track 4" throughout; O2-14 reframed off Sentry/CrUX-RUM (now Search Console CrUX, no SDK); Sentry-DSN carve-out clarified in §2; split items disambiguated (B4/B2-1/T3-3 account work; B6/T3-5 SCP; B2-4/T3-9 tag policy; B13→O10 rollback); Track 3 given a Status column; removed temporal "Sep-2025" label.

**Enterprise additions folded in:** WAF Bot Control + Host-header allowlist (E25); GuardDuty → Track 1 (O12); GHAS secret scanning → Track 1 (B14); SNS Slack → Track 1 (O4); SHA-pin Actions → Track 2 (B2-8); Response Headers Policy (E2-10); Firewall Manager (T3-29); CSP enforce (T3-27); TLS `TLSv1.2_2025` (T3-28); DNSSEC KSK-rotation alarms (T3-1); provisioned-concurrency trigger (C2-6); CloudFront Standard Logging v2 TF caveat (O8); CloudFront flat-rate plan evaluation + O7 conflict (§10).

**Tier moves (enterprise YAGNI re-grading):** PrivateLink BFF→API (T3-4 → Track 4), SST state cross-region replication (O2-9 → Track 4), CUR→Athena (T3-10 → Track 4), Percy→Playwright-first (T3-12).

---

## 13. Track 1 execution phasing

Track 1 is **not** executed as one plan. It spans two repos, has hard sequencing gates with real-world propagation waits, and interleaves operator-run `apply`/console steps that Claude cannot run. It is therefore split into four phases along the natural dependency seams, each with its own verification gate before the next.

### Rationale for splitting (not one-shot)

- **Cross-repo** — most items live in `quilty-aws` (account/OU, `website-baseline`, DNS); plan mode is most accurate scoped to one repo at a time, and IAM/SCP/WAF deserve their own review surface.
- **Real-world gates** — `website-baseline` must apply _before_ the first `sst deploy`; that deploy must _emit_ the CloudFront domain + ACM CNAMEs _before_ the DNS PR can be written; DNS validation must complete _before_ re-deploy. Cannot be authored-and-applied in one pass.
- **Compounding accuracy** — each phase verifies (CI green / `terraform plan` / canaries green) before the next; small verified plans beat one ~40-item plan.

### The four phases

| Phase                                | Scope                                                                                                                                                                                                                                                                                                                                                                                                   | Repo / session              | Mode                                         | Depends on                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------- | ------------------------- |
| **A — Website prep**                 | `sst.config.ts` gaps (C2 image-opt mem, C4 `warm:1`, E12 TLS min, E19 invalidation, E20 price class, E21 IPv6/AAAA); GPC `functional`=true verified consistent (E23 — no fix needed, spec-correct); sitewide `noindex` (E30); `dr.md`+`rollback.md` runbooks (O10/B13). Checklist for operator-console items: Sentry project (S4), GHAS secret scanning (B14), GitHub `production` env protection (B9). | `quilty-website`            | plan-mode (code)                             | nothing — start here      |
| **B — Account / OU / SCP**           | Repurpose `development`→`marketing-prod` rename + OU move (B4/B5); minimal PHI-deny SCP (B6).                                                                                                                                                                                                                                                                                                           | `quilty-aws`                | plan-mode (IaC, small)                       | org decision (locked)     |
| **C — `website-baseline` Terraform** | **C1 deploy-enablers** (hard gates): OIDC roles + boundaries (B1/B2/B3), WAF ACL incl. Bot Control + host-header (E25), SSM params (S2), pepper secret (S1). **C2 monitoring IaC** (post-deploy-OK): canaries (O1), alarms (O2/O3), SNS (O4), budgets (O5/O6), log-buckets (O8/O9), GuardDuty (O12), Route 53 Accelerated Recovery (O7).                                                                | `quilty-aws`                | plan-mode (IaC) — 1–2 sessions               | B (C1); first deploy (C2) |
| **D — Deploy ceremony**              | Flip `DEPLOY_ENABLED` (B8); first `sst deploy --stage dev`; capture outputs; Pattern A DNS PR (E6/E11); re-deploy; apply `noindex`; verify canaries green + WAF blocking.                                                                                                                                                                                                                               | cross-repo, operator-driven | **runbook** (`sst-deploy.md`), not plan-mode | A + C1                    |

### Dependency graph

```
A (website prep) ──┐
                   ├─► C1 (baseline gates) ─► D.1 first deploy ─► D.2 DNS PR ─► D.3 re-deploy
B (account/OU/SCP)─┘                                                              │
                                                  C2 (monitoring) ◄──────────────┘
```

A and B are independent and can run in parallel. C1 needs B. The ceremony (D) needs A + C1. C2 trails the first deploy.

### Authoring vs operator-run

- **Claude-authored (plan-mode):** all of A; the Terraform in B and C; the DNS PR records in D.2.
- **Operator-run (cannot be automated here):** every `terraform apply` / `sst deploy`; Porkbun registrar verifications (E1–E4); AWS console steps (billing tag activation B12, GuardDuty enable, the GitHub `production` environment UI B9); Sentry project creation (S4). These are checklisted in their owning phase.

### Recommended order

Start with **Phase A** (self-contained, this repo, unblocks nothing-blocked work), then move to a **`quilty-aws` session** for B → C1 (so that repo's guard hooks, `terraform plan` CI, and state govern the IaC), run the **D ceremony**, then land **C2** once the site is up.

---

_Related: `docs/website_workflow_roadmap.md` (milestones), `docs/website_strategy_discussion.md` (D45/D47/D179), ADR-0029 (BFF auth), ADR-0030 (fail-closed config), and `quilty-aws/docs/infrastructure/aws_org_evolution_plan_website_response_2026-06-18.md` (account/OU/DNS locks)._
