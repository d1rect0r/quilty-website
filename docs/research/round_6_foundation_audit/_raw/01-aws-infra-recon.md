# Round 6 Foundation Audit — Track 1, Agent A: aws-infra-recon

> **Read-only inventory of `quilty-aws/` mapped to `quilty-website` integration needs.**
> Generated 2026-05-19 from in-tree HCL + Cargo.toml inspection (no live AWS API calls).

---

## Executive summary

`quilty-aws/` is a mature 11-layer Terraform monorepo (`management`, `foundation`, `dns`, `auth`, `email`, `app-sync`, `log-archive`, `development`, `github`, `bootstrap`, `security-tooling`) that deploys to four real AWS accounts: **management `570263067251`**, **production `975630231383`** (where DNS + auth + email + the Rust API gateway live today), **development `619758066987`** (Phase 0 target for `quilty-website` per D47), and **log-archive `825187895356`**. ~53 Rust crates ship from `lambdas/rust/crates/`. The auth, email, and DNS spines are production-grade — Cognito Plus tier with Lambda triggers + WAF + DKIM/SPF/DMARC + DNSSEC + ACM wildcard cert + EventBridge bus are all live in the production account.

**Critical surprise:** the primary infrastructure zone is `my-quilty.app`, **not** `my-quilty.com` as the website strategy doc states. The `.com` zone exists with SES email infrastructure (transactional + notifications + marketing) but has no website / `auth.` A-record / CloudFront association yet. `auth.my-quilty.com` IS TF-defined in `auth/dns.tf` but currently gated off (`var.enable_custom_domain = false`). The website will inherit a zone that has full email infra but zero website / app records — a clean canvas with the `.com` ACM cert layer not yet built. The biggest gap is the entire `quilty-aws/website-baseline/` layer the SST runbook lists as a prerequisite: **it does not exist on disk.** No `/quilty/website/*` SSM tree, no `quilty-website-deploy-*` OIDC roles, no website WAF Web ACL (CloudFront-scope).

---

## EXISTS today

### 1. DNS

**Zone topology (lives in `quilty-aws/dns/`, production account `975630231383`):**

- `aws_route53_zone.primary` — `my-quilty.app` (THE primary infra zone) — `dns/hosted_zone.tf:11`
- `aws_route53_zone.com` — `my-quilty.com` (brand domain; outputs `com_hosted_zone_id`) — `dns/hosted_zone.tf:33`
- `aws_route53_zone.net` — `my-quilty.net` (brand-protection only, null-MX SPF reject-all DMARC reject) — `dns/hosted_zone.tf:47`

All three are `lifecycle.prevent_destroy = true` and have DNSSEC enabled via shared ECC_NIST_P256 KMS key `dns/dnssec.tf:10`. CAA records lock issuance to Amazon CAs only on all three zones.

**Records on `my-quilty.com` (`dns/records_com.tf`):**

- M365 inbound MX → `myquilty-com0e.mail.protection.outlook.com.` (line 47)
- SPF: `include:amazonses.com include:spf.protection.outlook.com -all` + M365 verification + Google Site Verification (line 60)
- M365 DKIM selector1 + selector2 CNAMEs (lines 88, 96)
- DMARC `_dmarc.my-quilty.com` at `p=quarantine` (warmup); sp=reject; reports route to `dmarc-reports@my-quilty.app` + `dmarc_agg@vali.email` (line 112)
- SES Easy DKIM 3-CNAMEs × 3 identities (transactional / notifications / marketing) — `for_each = toset(tokens)` against email-layer remote-state outputs
- Custom MAIL FROM MX + SPF for `mail.my-quilty.com`, `mail.notifications.my-quilty.com`, `mail.marketing.my-quilty.com` (lines 227-277)
- TLS-RPT TXT (line 283); CAA Amazon-only (line 299) — adds `amazontrust.com` for CA chain swaps
- **No website A/AAAA record.** `dns/records.tf:167-179` has `aws_route53_record.website_root` declared but `count = 0` — disabled, will be replaced with CloudFront Alias in Phase 2.
- Old `widgetbook.my-quilty.app` CNAME → `quilty-widgetbook.pages.dev.` still pointing at Cloudflare Pages (`dns/records.tf:182`).

**Records on `my-quilty.app`:** M365 MX, M365 DKIM selectors, M365 autodiscover, SPF (`include:spf.protection.outlook.com -all`), DMARC `p=reject` + Valimail aggregator, TLS-RPT, CAA, DMARC cross-domain reporting authorization for `.com` reports landing on `.app` (`dns/records.tf:131`).

**ACM wildcard cert:** `aws_acm_certificate.primary` covers `my-quilty.app` + `*.my-quilty.app` (ECDSA P-256, DNS-validated, us-east-1). `dns/acm.tf:12`. Output: `acm_certificate_arn`.

**Other DNS-layer features:** Route 53 query logging to CloudWatch (`dns/query_logging.tf`), `dns/brand_protection.tf` anti-spoofing for the `.net` zone (null MX + DKIM null key + DMARC reject), DNS Firewall rules in `foundation/dns_firewall.tf`.

**`auth.my-quilty.com` is TF'd but gated off.** `auth/dns.tf` declares:

- `aws_acm_certificate.auth_domain` — `auth.my-quilty.com` (us-east-1, ECDSA P-256, validates via Route 53 record on the `.com` zone)
- `aws_cognito_user_pool_domain.custom[0]` — `auth.my-quilty.com` (gated by `var.enable_custom_domain`, currently `false`)
- `aws_cognito_user_pool_domain.prefix[0]` — fallback `quilty-${var.environment}` (currently active)
- `aws_route53_record.auth_alias[0]` — A-record alias to Cognito CloudFront distribution (gated)

Per D45 + U5, M1 cutover flips `enable_custom_domain = true` in `auth.auto.tfvars`. 15-60 min provisioning window.

### 2. Email infrastructure

**`quilty-aws/email/` is a complete 3-tier SES build in `us-east-2` (verify in `email.auto.tfvars`):**

- **Three SES domain identities (`email/identities.tf`):**
  - `aws_sesv2_email_identity.transactional` → `my-quilty.com` (auth verify, password reset, MFA codes, admin)
  - `aws_sesv2_email_identity.notifications` → `notifications.my-quilty.com` (engagement, streaks)
  - `aws_sesv2_email_identity.marketing` → `marketing.my-quilty.com` (campaigns, newsletters)
- **Easy DKIM** with 2048-bit RSA keys (3 CNAMEs per identity, tokens flowed to dns/ via `terraform_remote_state`)
- **Four configuration sets (`email/configuration_sets.tf`):** `quilty-prod-transactional`, `quilty-prod-notifications`, `quilty-prod-marketing`, `quilty-prod-admin` — all enforce `tls_policy = "REQUIRE"`, all have reputation metrics + bounce/complaint suppression
- **VDM enabled** for ISP-level deliverability optimization (`email/vdm.tf`)
- **Custom MAIL FROM** per identity with `behavior_on_mx_failure = "REJECT_MESSAGE"` (`email/mail_from.tf`)
- **SES → SNS event destinations** (`email/event_destinations.tf` + `email/sns.tf`) — bounce + complaint topics published as `bounces_topic_arn` / `complaints_topic_arn`
- **Email-processor Lambda** (`email/lambda.tf`) Rust binary that handles bounce/complaint events
- **Firehose** + DLQ (`email/firehose.tf`, `email/dlq.tf`)
- **DMARC**: `p=quarantine` on `.com` during SES warmup; `p=reject` on `.app` (M365 only)
- **IAM `aws_iam_policy.ses_send`** (output `ses_send_policy_arn`) — granting `ses:SendEmail/SendRawEmail` on all 3 identities; attach to any Lambda role that sends email
- **KMS:** dedicated `aws_kms_key.ses` (output `kms_ses_key_arn`)

**SES production-access state:** Variable `ses_daily_send_threshold` defaults to 180 (90% of 200 sandbox limit per `email/variables.tf:166`). Comment at `email/alarms.tf:228`: "Update ses_daily_send_threshold variable when production access is granted." → **SES is still in sandbox today.** Production-access request not yet filed.

**No Resend / SendGrid / Postmark** — Postmark removed 2026-04-12 (`dns/records.tf:33`), SendGrid/Cloudflare email routing decommissioned. M365 (Exchange Online) is the inbound MTA for shared mailboxes (`support@`, `legal@`, `privacy@`, `dmarc@`, `tls-reports@`).

### 3. Auth (Cognito) — `quilty-aws/auth/` (production account)

- **`aws_cognito_user_pool.main`** (`auth/main.tf:23`):
  - Name: `quilty-production-user-pool`
  - **Tier: `PLUS`** — enables passkeys/WebAuthn, advanced security, choice-based auth
  - Username = email, case-insensitive (immutable)
  - **MFA: OPTIONAL** with TOTP (no SMS, no Cognito email MFA — backup codes handled in-app per D55)
  - Password policy: 15-char min, no composition rules (NIST SP 800-63B-4 §A.4.5)
  - Account recovery: verified_email priority 1
  - **WebAuthn**: `relying_party_id = my-quilty.com`, `user_verification = required`
  - Advanced security: `ENFORCED` when `threat_protection_enforced=true`, else `AUDIT`
  - Custom attributes: `onboarding_complete`, `account_tier`, `external_idp_id`, `consent_tos_v2`, `consent_mkt_v2`, `mfa_required_at`, `passkey_required_at`, `synthetic`, `synthetic_run`
  - SES email: `email_sending_account = "DEVELOPER"`, `source_arn = ses:identity/my-quilty.com`, `configuration_set = quilty-production-transactional`
  - Six Lambda triggers wired (`auth_triggers` Lambdalith OR five split Lambdas — gated by `q_topo_4_split_enabled`): PreSignUp, PostConfirmation, PreAuth, PostAuth, PreTokenGenV2, CustomEmailSender, + custom-auth challenges
  - `deletion_protection = "ACTIVE"`, `prevent_destroy = true`

- **App clients (`auth/client.tf`):**
  - `mobile` — public client (no secret), SRP + CUSTOM_AUTH + USER_AUTH; access/id TTL = 5 min, refresh TTL = 30 days, rotation enabled, `prevent_user_existence_errors = ENABLED`
  - `m2m_partner_reserved` — confidential client (B2B reserved), client_credentials only; no scopes wired yet
  - `verification_only` — confidential client for CI/load-test harness (tagged `quilty:cleanup_when=dev_account_exists`)
  - **No `web` confidential client exists yet** — needed for the website BFF per U7 (Round 5 lock)

- **`auth/identity_providers.tf`** — Google OIDC + Apple SignInWithApple, both gated by tfvars-supplied secrets, currently `count = 0` unless `google_client_id`/`apple_service_id` set
- **`auth/triggers.tf`** — Lambdalith `quilty-production-auth-triggers` (Rust on `provided.al2023` arm64, 256MB/5s) with DLQ + p99 duration alarm
- **`auth/waf.tf`** — REGIONAL WAFv2 `aws_wafv2_web_acl.cognito` attached to the user pool: rate-limit (100 req / 5 min / IP) + AWS managed IP reputation + Common Rule Set + Known Bad Inputs
- **`auth/cache_elasticache.tf`** — Valkey JTI denylist (refresh-token-rotation revocation cache, sub-200ms)
- **`auth/outbox.tf`** — `aws_cloudwatch_event_bus.quilty_auth_events` ("`quilty-production-auth-events`") + `aws_dynamodb_table.quilty_outbox` for the transactional-outbox pattern
- **Step-up auth + canary infra:** synthetic_canaries.tf, jwt_test_pool.tf, retry_signup_canary.tf, canary_refresh_token_rotation.tf
- **SSM exports** (`auth/ssm.tf`) under `/quilty/auth/*`: `cognito_pool_id`, `cognito_pool_arn`, `cognito_client_id` (mobile), `cognito_jwks_uri`, `cognito_issuer`, `cognito_audience`, `cognito_kms_email_arn`

**The website's BFF will need to read `/quilty/auth/cognito_pool_id` + `cognito_issuer` + `cognito_jwks_uri` and add a NEW `/quilty/auth/cognito_client_id_web` for its own confidential app client.**

### 4. KMS

**Production account CMKs (a non-exhaustive sample):**

- `foundation/log_bucket.tf` — `aws_kms_key.security_logs` (CloudTrail/Config/VPC Flow Logs)
- `foundation/lambda_artifacts.tf` — `aws_kms_key.artifacts` (alias `alias/artifacts/production`)
- `foundation/sns_topics.tf` — `aws_kms_key.sns_notifications`
- `auth/kms.tf` — `aws_kms_key.cognito_email` (CustomEmailSender), `aws_kms_key.cloudwatch_logs`, `aws_kms_key.auth_signing_keys` (auth/ssm.tf:138; alias `alias/quilty-production-auth-signing-keys`; encrypts consent-receipt HMAC + AE14 pepper SSM SecureStrings), `aws_kms_key.cosign_signing` (artifact signing)
- `auth/secrets_turnstile.tf` — Turnstile secret CMK
- `auth/jwt_test_rotation.tf` — JWT-test pool secret CMK
- Per-purpose aliases: `alias/auth-deeplink`, `alias/quilty-production-jwt-test-secrets`, etc.
- `dns/dnssec.tf` — `aws_kms_key.dnssec` (ECC_NIST_P256, alias `alias/dnssec/production`) — shared across `.app/.com/.net` zones
- `email/kms.tf` — `aws_kms_key.ses` (SES)

**Management account CMKs (`management/kms.tf`):** cloudtrail, config, identity_center, billing, access_logs (deprecated), s3_events — all `enable_key_rotation = true`, aliases `alias/<service>/management`.

All Quilty CMKs have annual rotation enabled (CIS v5.0.0 3.6). Per-purpose convention is locked.

### 5. IAM + OIDC

**`foundation/oidc.tf` (production account):**

- `module.oidc_layer` — GitHub OIDC provider trust for `d1rect0r/quilty-aws` (only)
- **Per-layer plan + apply roles** (all scoped to `quilty-aws` repo only):
  - `tf-foundation-plan` + `tf-foundation-apply`
  - `tf-dns-plan` + `tf-dns-apply`
  - `tf-app-sync-plan` + `tf-app-sync-apply`
  - `tf-email-plan` + `tf-email-apply`
  - `tf-auth-plan` + `tf-auth-apply`
  - `tf-auth-jwt-test` (narrow CI role for jwt_tool attack matrix)
- Plan roles get `ReadOnlyAccess` + state-bucket S3 + artifact-bucket S3 + signer + SSM `/quilty/<env>/lambda-artifacts/*` PutParameter
- Apply roles get `AdministratorAccess` + permission boundary from `modules/oidc-layer` + GitHub Environment gate (`github_environment = "<layer>-apply"`)
- Trust policy pins to `d1rect0r/quilty-aws`

**`development/oidc.tf`** — same `oidc_layer` shape; only `tf-development-plan` + `tf-development-apply` roles (admin + boundary). **No quilty-website OIDC role exists in the development account yet.**

**`management/scps.tf`** — SCPs at Root:

- **SCP 12 — Identity Perimeter** — Force SSO, deny `iam:CreateUser/CreateAccessKey/CreateLoginProfile`, deny `organizations:LeaveOrganization`
- **SCP 13 — Data Exfiltration Prevention** — Deny RAM external sharing, Lambda Function URLs (!), `s3:PutAccountPublicAccessBlock`, public snapshot sharing
- **SCP 3 — Deny Region** — restrict to `us-east-1` + `us-east-2` + `us-west-2`
- **SCP 5 — Deny Disable Security** — protects CloudTrail/Config/GuardDuty/SecurityHub/Inspector + IMDSv2 mandate
- **SCP 10 — HIPAA-Eligible Services Only** — `production_ou_id` attachment: AppSync, Bedrock, etc. allowlist
- **SCP 11 — Protect Log Archive** — prevents log deletion in the log-archive account

**Permission boundary** (`modules/oidc-layer`) applied to every apply role denies IAM escalation (CreateUser/CreateAccessKey/etc.).

### 6. SSM Parameter Store

**`/quilty/foundation/*` exports** (`foundation/ssm_exports.tf`):

- `vpc/vpc_id`, `vpc/private_subnet_ids`
- `kms/security_logs_arn`, `kms/sns_notifications_arn`, `kms/artifacts_arn`
- `sns/ops_critical_alerts_arn`, `sns/app_alerts_arn`
- `s3/access_log_bucket_name`, `s3/artifact_bucket_name`, `s3/artifact_bucket_arn`
- `oidc/provider_arn`, `oidc/permissions_boundary_arn`
- `auth/supabase_jwks_uri`, `auth/supabase_jwt_issuer`, `auth/supabase_jwt_audience` (legacy — will retire post-Cognito-cut)

**`/quilty/auth/*` exports** (`auth/ssm.tf`):

- `cognito_pool_id`, `cognito_pool_arn`, `cognito_client_id` (mobile), `cognito_jwks_uri`, `cognito_issuer`, `cognito_audience`, `cognito_kms_email_arn`
- `/quilty/production/auth/consent_receipt_signing_key_hex` (SecureString, operator-managed)
- `/quilty/production/auth/ae14_pepper_hex` (SecureString, operator-managed)
- `/quilty/production/verification/cognito_client_id` + `client_secret` (verification harness — flagged `quilty:cleanup_when=dev_account_exists`)

**`/quilty/<env>/lambda-artifacts/*`** — CI-managed signed-artifact metadata for Rust Lambdas.

**`/quilty/website/*`** — DOES NOT EXIST. SSM tree is empty for this prefix.

### 7. WAF v2

**Three Web ACLs live:**

- `auth/waf.tf:13` — `aws_wafv2_web_acl.cognito` — **REGIONAL scope** (associated with Cognito user pool); 4 rules: rate-limit-auth (100/5min/IP), AWSManagedRulesAmazonIpReputationList, AWSManagedRulesCommonRuleSet, KnownBadInputs
- `auth/health.tf:235` — `aws_wafv2_web_acl.healthz` — REGIONAL (healthcheck API GW)
- `app-sync/waf.tf:153` — `aws_wafv2_web_acl.cloudfront` — **CLOUDFRONT scope** (us-east-1 required); 13 rules covering EmergencyIpBlock, BodySizeBlock, ContentTypeEnforcement, CRS, KnownBadInputs, IP Reputation, AnonymousIpList (COUNT), SQLi, RateLimitAnonymousIP, RateLimitBlanket (500/5min), RateLimitSyncPush (100/5min), RateLimitSyncPull (500/5min), RateLimitAccessExport (10/5min). WCU ~1195/5000.
- `app-sync/waf.tf:840` — `aws_wafv2_web_acl.apigw` — REGIONAL
- Runtime IP-set: `aws_wafv2_ip_set.emergency_ip_block` (IPv4) + `_v6` (IPv6) + `load_test_operators`

**Website-targeted WAF: does NOT exist.** The Round 5 IaC reviewer's CLAUDE.md NEVER list requirement (CloudFront-scope ACL for `my-quilty.com`) is unmet — the SST runbook expects this from a yet-to-be-built `website-baseline` layer.

### 8. EventBridge

**Production-account event buses:**

- `default` bus — receives GuardDuty + SecurityHub findings → SNS security alerts (`foundation/eventbridge.tf`)
- `aws_cloudwatch_event_bus.security_findings` (`quilty-prod-security-findings`) — cross-account ingress from management account for SecurityHub aggregation (`foundation/eventbridge_cross_account.tf`)
- `aws_cloudwatch_event_bus.quilty_auth_events` (`quilty-production-auth-events`) — **the auth transactional outbox bus**, consumed by audit pipeline, compliance lambda, cognito-sync-reconciler, RISC processor. Lives in `auth/outbox.tf`.

**The strategy doc's `quilty.auth.sessions_revoked` (D9 Round 5) does NOT exist as a separate bus name.** Sessions-revocation events are emitted via `quilty-production-auth-events` (single shared auth-outbox bus) and the Rust handlers (`auth-user::sessions_revoke_all`) produce events with their own detail-type discrimination. The website BFF will consume revocation signals from `quilty-production-auth-events` via an EventBridge rule, not via a dedicated bus.

### 9. S3

**Buckets relevant to the website:**

- `foundation/log_bucket.tf` — `aws_s3_bucket.security_logs` = `quilty-1383-prod-use1-infra-security-logs` (Object Lock GOVERNANCE, KMS-encrypted, Glacier transitions). Website CloudFront access logs CAN target this bucket via the standard log-delivery pattern.
- `foundation/lambda_artifacts.tf` — `quilty-prod-use1-lambda-artifacts` (Rust Lambda zip artifacts; KMS `alias/artifacts/production`)
- `foundation/access_log_bucket.tf` / `access_log_bucket_use2.tf` — S3 access log destination bucket
- `foundation/replication.tf` — three replicas to log-archive account `825187895356`: security-logs-replica, audit-reports-replica, macie-results-replica

**Asset bucket for SST will be created by SST itself** under stage-scoped `quilty-web-*` naming. The development-account S3 PAB is on (CIS baseline).

### 10. DynamoDB

**Tables in production account:**

- `auth/audit_log.tf` — `auth_audit_log` (HIPAA §164.528 audit ledger, DDB Streams → Pipes → Firehose → Object Lock S3)
- `auth/cw_alarm_history.tf` — `cw_alarm_history`
- `auth/compliance.tf` — `quilty_compliance`
- `auth/verification_test_users.tf` — `verification_test_users`
- `auth/outbox.tf` — `quilty_outbox` (transactional outbox)
- `app-sync/dynamodb.tf:14` — `quilty_main` (single-table design — the canonical user/session/data table)
- `app-sync/dynamodb.tf:166` — `quilty_idempotency`
- `app-sync/dynamodb.tf:217` — `quilty_audit_fallback`

**Strategy-doc-required tables NOT yet present:**

- **Session-store table** for ADR-0002 (opaque session ID + DynamoDB store, NOT iron-session) — needs new website-owned table OR a new partition on `quilty_main`
- **ConsentState table** for D63 — does not exist

Likely both will land in the `quilty-website` Phase 0 SST stack itself (development account) OR get vended by `quilty-aws/website-baseline/` if cross-stack readability is needed.

### 11. Rust backend (`quilty-aws/lambdas/rust/crates/`) — 53 crates

**Foundation libs (path deps, no Lambda binary):**

- `quilty-core` — pure-Rust primitives (no AWS SDK), foundation crate
- `quilty-events` — CloudEvents v1.0 envelope
- `quilty-persistence` — DynamoDB layer
- `quilty-observability` — OTel + metrics + logging + secrets (heavy `tracing-subscriber` + `opentelemetry*`)
- `quilty-resilience` — circuit breakers, rate limits, kill switches, AppConfig fetcher, JWKS cache, AsyncCache (Valkey backed)
- `quilty-audit` — audit-event envelope + DDB writer
- `quilty-auth-domain` — auth/Cognito/OAuth/SES/schema/middleware domain logic
- `quilty-auth-http` — shared Lambdalith primitives (correlation-id, RFC 9457 envelopes, HSTS, panic-safe dispatch)
- `quilty-compliance` + `quilty-compliance-signer` — compliance event Lambdalith + daily Merkle-root signer
- `quilty-openapi-emitter` — CI-only crate that walks `#[utoipa::path]` annotations to emit `docs/auth/auth_v2_openapi.yaml`. **THIS IS THE OPENAPI CONTRACT EMITTER per D48.**

**Auth Lambdaliths (the website's primary integration targets):**

- **`auth-public`** — unauthenticated routes: `GET /.well-known/openid-configuration`, `GET /.well-known/jwks.json`, `GET /healthz/live`, `GET /healthz/ready`, `POST /v1/auth/signup`, `POST /v1/auth/signin`, `POST /v1/auth/signin/challenge`, `POST /v1/auth/password/reset`, `POST /v1/auth/password/reset/confirm`, `POST /v1/auth/email/verify`. **Website BFF will call signup/signin/password/reset endpoints over `api.my-quilty.app`.**
- **`auth-user`** — Cognito-JWT-authenticated user routes: passkeys CRUD, account access-export, password change, sessions list/revoke/revoke-all, MFA enroll/disable/recovery-codes, provider link/unlink, email change, account delete request/cancel/export
- **`auth-admin`** — operator/admin routes (gated by Cognito admin-group + four-eye approval): revoke-sessions/suspend/unsuspend/mfa-force/config-refresh
- **`auth-discovery`** — public OIDC discovery endpoints (`/.well-known/...`)
- **`auth-health`** — `/health` (liveness) + `/ready` (deep dep check)
- `auth-triggers` (monolith) and split Lambdas: `cognito-trig-pre-signup`, `cognito-trig-post-confirm`, `cognito-trig-post-auth`, `cognito-trig-pretoken-gen-v2`, `cognito-trig-custom-email-sender`
- `authorizer` — API Gateway Lambda authorizer (JWT validation + claim injection)
- `oauth-bootstrap` — Custom Auth Challenge flow for Google/Apple

**Async workers + canaries:**

- `cognito-sync-reconciler`, `worker-outbox-status-updater`, `worker-risc-event-processor`, `worker-risc-cascade-dlq-handler`, `audit-shim`, `audit-processor`, `audit-replay`, `audit-pipeline-canary`, `alarm-history-recorder`, `canary`, `canary-refresh-rotation`, `retry_signup_canary` (TF only — no crate)
- `unconfirmed-cleanup`, `dormant-cleanup`, `email-change-cleanup`, `mfa-recovery-notifier`
- `account-delete-warning` (Day-6), `account-delete-hard-delete` (Day-7)
- `dsar-init`, `dsar-verify`, `dsar-exporter`, `dsar-status` (DSAR/GDPR export pipeline)
- `risc-webhook` (Google RISC + Apple S2S inbound)
- `secret-rotation`, `email-processor`, `auth-deploy-hooks`, `rust-benchmark`, `integration-tests`

**Sync pipeline:**

- `sync-push`, `sync-pull` — bidirectional mobile↔backend sync over `api.my-quilty.app/v1/sync/*`

**Website BFF will need to integrate with `auth-public` (signup/signin/password reset), `auth-user` (sessions, passkeys, account-delete), and consume OpenAPI emitted by `quilty-openapi-emitter` for end-to-end TypeScript types.**

### 12. OU / account topology

**AWS Organization:** `o-ww52ocogji`. Root accounts + OUs:

- **management** — `570263067251` (org master; CloudTrail/Config/Identity Center/Macie/GuardDuty admin delegated to security-tooling)
- **Production OU** (manually created, NOT TF-managed)
  - **production** — `975630231383` (DNS + auth + email + app-sync + foundation here; this is "production AWS account")
- **Security OU** — created by management
  - **log-archive** — `825187895356` (`management/cloudtrail_bucket.tf` ships logs here)
  - **security-tooling** — TF-managed account via `aws_organizations_account.security_tooling` in `management/accounts.tf:46`
- **Workloads OU** (manually created)
  - **development** — `619758066987` (Phase 0 home for `quilty-website` per D47)
- **Sandbox OU** — TF-managed (`aws_organizations_organizational_unit.sandbox`)
- **Suspended OU** — TF-managed

**No `marketing-prod` account or `Workloads-NonHIPAA` OU exists yet.** Strategy doc D45 + D47 say these are Phase 1 (post-launch/revenue trigger) — confirmed by topology.

### 13. Mandatory `quilty:*` tags

**Tag Policy** (`management/tag_policies.tf:11`) — currently in MONITOR mode at Org level; OPA/Conftest gate at CI-plan time enforces violations:

| Tag                          | Values                                                                 | Notes                                        |
| ---------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| `quilty:environment`         | `production`, `staging`, `development`, `management`                   | Closed-set                                   |
| `quilty:service`             | (open)                                                                 | E.g. `auth`, `dns`, `email`, `sync`, `infra` |
| `quilty:owner`               | (open)                                                                 | Operational team name                        |
| `quilty:cost-center`         | `infrastructure`, `engineering`, `platform`, `operations`, `marketing` | Closed-set                                   |
| `quilty:compliance`          | `hipaa`, `soc2`, `hipaa-soc2`, `none`                                  | Closed-set                                   |
| `quilty:data-classification` | `public`, `internal`, `confidential`, `restricted`, `phi`              | Closed-set                                   |
| `quilty:managed-by`          | `terraform`, `manual`, `cdk`, `cloudformation`                         | Closed-set                                   |
| `quilty:backup-policy`       | `critical`, `standard`, `minimal`, `none`                              | Closed-set                                   |
| `quilty:component`           | (open, per-layer closed-set via OPA)                                   | Cost-rollup grain                            |
| `quilty:owner-email`         | (open, regex validated)                                                | Per-resource contact                         |
| `quilty:criticality`         | `critical`, `high`, `standard`, `minimal`, `none`                      | Closed-set                                   |
| `quilty:deployment-id`       | (open)                                                                 | Typically git SHA, set by CI -var            |

**SST config emits these:** `quilty:owner`, `quilty:service`, `quilty:env`, `quilty:stack`, `quilty:repo`, `quilty:cost-center` plus `workload` + `stage` (lower-cased). **Mismatch — `quilty:env` vs `quilty:environment` is a divergence.** The tag-policy keys are `quilty:environment` not `quilty:env`. See Surprises.

The website `sst.config.ts:71` also omits `quilty:compliance`, `quilty:data-classification`, `quilty:managed-by`, `quilty:backup-policy`, `quilty:component`, `quilty:owner-email`, `quilty:criticality`, `quilty:deployment-id` — 8 tags that the Tag Policy requires for compliance visibility. CI OPA gate will flag these as soon as the tag enforcement crosses from MONITOR to ENFORCE (D27 deferred follow-up).

### 14. Secrets management

**Pattern across `quilty-aws/`:**

- **AWS Secrets Manager** is used for Honeycomb API key (`quilty/prod/honeycomb-api-key`), Turnstile secret, x-origin-verify, cursor-signing-key, JWT-test fixture password — all KMS-encrypted with per-purpose CMKs
- **SSM SecureString** for operator-rotated values (`consent_receipt_signing_key_hex`, `ae14_pepper_hex`, verification client_secret) — KMS-encrypted via dedicated `alias/quilty-production-auth-signing-keys`. Pattern: TF declares with placeholder + `lifecycle.ignore_changes = [value]`; operator rotates via `aws ssm put-parameter --type SecureString` per runbook (`docs/runbooks/ssm_securestring_adoption.md`)
- No HashiCorp Vault, no 1Password Connect for runtime secrets — operator-managed secrets via 1Password lookup → SSM put

**Website will need:** Sentry DSN (env var at CI level), Cognito web-client secret (Secrets Manager?), session-store HMAC signing key (SSM SecureString in same pattern as `consent_receipt_signing_key_hex`).

### 15. Observability sinks

- **CloudWatch Logs** — every Lambda log group is encrypted with per-layer KMS keys; retention is **365 days** (HIPAA-compliant) on auth Lambdas
- **Honeycomb (production)** — OTLP endpoint `https://api.honeycomb.io` is wired into the OTel env vars via `auth/locals_otel.tf:40`. API key in Secrets Manager `quilty/prod/honeycomb-api-key`. `OTEL_EXPORTER_OTLP_PROTOCOL = http/protobuf`. Sample rate 10% via `parentbased_traceidratio`.
- **EMF metrics** in CloudWatch (`quilty/auth` namespace) — `OTEL_METRICS_EXPORTER = none`; emitter is the in-Rust `metrics` crate writing EMF directly via tracing-subscriber
- **CloudWatch dashboards** — `quilty-auth-operations`, `quilty-auth-compliance`, etc.
- **X-Ray** — `tracing_mode = "Active"` on every Lambda
- **Macie + GuardDuty + SecurityHub + Inspector** — all enabled and aggregated to security-tooling account via SecurityHub admin delegation
- **CloudWatch Insights queries** referenced in alarm `[RUNBOOK]` URLs
- **AMP (Amazon Managed Prometheus) workspace** — `auth/amp_workspace.tf` exists; not currently scraped by anything Rust-side

**No Sentry integration in `quilty-aws/`** — Sentry is purely the website's concern per D42a, and the DSN flows via env var at SST deploy time.

---

## REQUIRED FOR WEBSITE BUT MISSING

These are the gaps the upcoming `quilty-aws/website-baseline/` sprint must close, organized by priority:

### CRITICAL — blocks first SST deploy

1. **`quilty-aws/website-baseline/` Terraform layer** — does not exist on disk. Sprint deliverables per `docs/runbook/sst-deploy.md`:
   - **GitHub OIDC trust extension** — current `foundation/oidc.tf` `module.oidc_layer` trusts `d1rect0r/quilty-aws` only. Website needs a new OIDC provider trust path or a new role with `aud=sts.amazonaws.com` and `sub` patterns `repo:<org>/quilty-website:ref:refs/heads/main` + `repo:<org>/quilty-website:pull_request`. Easiest path: provision the OIDC provider in the **development** account and create new roles there.
   - **`quilty-website-deploy-dev` IAM role** in development account — with permission boundary scoped to `quilty-web-*` resource ARNs. IAM action list documented in `sst-deploy.md:48-67` (CloudFront, Lambda, S3, ACM us-east-1, SSM `/quilty/website/*`, logs, iam:PassRole bounded, wafv2 read-only)
   - **`quilty-website-deploy-preview` IAM role** — narrower preview-only boundary
   - **AWS WAF v2 Web ACL (CLOUDFRONT scope, us-east-1)** for the website — required by SST's `WAF_WEB_ACL_ARN` gate. Managed groups: CommonRuleSet + KnownBadInputs + IpReputation + AmazonIpReputationList + rate-limit. ARN exposed via SSM `/quilty/website/waf-web-acl-arn`. **Round 5 CLAUDE.md NEVER list compliance.**

2. **SSM `/quilty/website/*` tree** (in development account) — none exist today:
   - `/quilty/website/hosted-zone-id` — `my-quilty.com` zone ID. **Lives in PRODUCTION account** zone — needs cross-account replication via SSM (Pattern A coordinated input) OR manual variable input until Phase 1 cutover
   - `/quilty/website/waf-web-acl-arn`
   - `/quilty/website/kms-cmk-arn` (optional — for env-var encryption)

3. **DNS records for the website** (in `quilty-aws/dns/` production account, on `.com` zone):
   - Apex `my-quilty.com` Alias A → CloudFront distribution (today `aws_route53_record.website_root` is `count = 0`)
   - `www.my-quilty.com` redirect or Alias
   - ACM cert validation CNAMEs for the SST-emitted ACM cert (us-east-1, NEW cert per stage)
   - **NB:** The existing `dns/acm.tf` wildcard cert is only `*.my-quilty.app`. The `.com` zone has **NO ACM cert TF'd today** — SST will request its own per-stage, and `dns/` must write the validation records.

### IMPORTANT — blocks production-grade operation

4. **Cognito web app client** — `aws_cognito_user_pool_client.web` (confidential, with secret) NOT TF'd yet. U7 (Round 5 lock) requires it. Add to `auth/client.tf`:
   - `generate_secret = true`
   - `explicit_auth_flows` for OAuth authorization-code flow (not SRP)
   - `allowed_oauth_flows = ["code"]`, `allowed_oauth_scopes = ["openid", "email", "profile"]`
   - `callback_urls = ["https://my-quilty.com/api/auth/callback"]`
   - `logout_urls = ["https://my-quilty.com/"]`
   - `supported_identity_providers = ["COGNITO", "Google", "SignInWithApple"]`
   - Tokens shorter than mobile client (access 5min, refresh 8h per D52 — strategy doc says 8h, not 30d, for web)
   - SSM export `/quilty/auth/cognito_client_id_web` + Secrets Manager `quilty/web/cognito-client-secret-web` (KMS-encrypted)

5. **Cognito custom domain activation** — `auth/auto.tfvars` flip `enable_custom_domain = true`. Cert + Cognito domain are already TF'd in `auth/dns.tf:20-103`, just need the flag flipped at M1 cutover (U5).

6. **EventBridge consumer rule for `quilty-production-auth-events`** — the website BFF needs a rule like:
   - `source = ["quilty.auth"]`, `detail-type = ["sessions_revoked", "user_account_deleted"]`
   - Target: cross-account → development account → website's session-store DDB OR a website-scoped EventBridge bus
   - Today there's no EventBridge cross-account bus policy that grants development account `events:PutEvents` rights on the website side, and no website-side rule.

7. **Session-store DynamoDB table** — ADR-0002 calls for opaque session-ID + DDB-backed store. Today no such table exists. Likely scaffold inside SST stack itself rather than `quilty-aws/`, but if it needs to be read cross-account by Rust backend (for "is this web session still alive" checks), needs to live somewhere the Rust authorizer can reach.

8. **ConsentState DynamoDB table** — D63 — does not exist. Same placement question as #7.

### NICE-TO-HAVE — Phase 1+ cutover items

9. **`marketing-prod` AWS account vending** — D45/D47/D49: post-launch trigger; vend in new `Workloads-NonHIPAA` OU (which also does not exist). Pixel-isolation SCP + cross-account DNS Pattern A flip.

10. **SES production access request** — currently in sandbox (200 emails/day cap). For account-confirmation emails at launch traffic, need production access. **Not technically blocking the website launch** because Cognito CustomEmailSender flows through the auth-triggers Lambda which uses the production-account SES identity already verified — but launch-day signup volume may exceed the sandbox cap. File AWS Support case at M6/M7.

11. **BIMI/VMC** — not configured anywhere in `dns/records_com.tf`. BIMI record needs a Verified Mark Certificate from Entrust/DigiCert (~$1,500/year). Defer to post-launch unless brand-protection priority shifts.

12. **MTA-STS endpoint** — `dns/records.tf:139` notes "DEFERRED. Deploy when HTTPS endpoint exists." MTA-STS policy needs `https://mta-sts.my-quilty.{com,app}/.well-known/mta-sts.txt` to be served. Easy add post-website-go-live.

---

## Surprises

These are findings that contradict the website strategy doc or that warrant operator attention:

1. **Primary infra domain is `my-quilty.app`, not `my-quilty.com`** — `dns/hosted_zone.tf:11` makes `.app` the `aws_route53_zone.primary` with `tags["Name"] = "quilty-prod-public-zone"`. The `.com` zone exists but has only email infra + brand-protection-historically. This is consistent with D45 ("`my-quilty.app` is reserved for internal use; `.com` is the public domain") in INTENT — but the in-tree comments still call `.app` the "primary public hosted zone" (line 13) and the `.com` zone "Brand protection - public website" (line 35). **There may be a TF refactor needed to flip the naming after Phase 1 cutover.** Today this is purely a comment-quality issue; functionally everything is correct.

2. **The strategy doc's `quilty.auth.sessions_revoked` event bus name (D9 Round 5 revision) does NOT exist.** What exists is the single `quilty-production-auth-events` bus (`auth/outbox.tf`). The session-revocation events flow on this shared bus with `detail-type` discrimination. **The CLAUDE.md and `docs/website_strategy_discussion.md` D9 wording should be updated to reflect the real bus name + detail-type pattern.**

3. **Cognito Plus tier is already paid-for and enabled** (`auth/main.tf:36` `user_pool_tier = "PLUS"`). The strategy doc D50 says Plus enables passkeys + advanced security — both ARE wired (advanced_security_mode, web_authn_configuration.user_verification = "required"). No additional spend required.

4. **`refresh_token_validity = 30 days`** on the Cognito MOBILE client (`auth/client.tf:55`), NOT 8 hours. Strategy doc D52 (Round 5) says "refresh-token TTL 8h" for the WEB BFF — but the existing pool's mobile client is at 30 days. **The web client needs its OWN shorter-TTL token policy (different `aws_cognito_user_pool_client.web` resource) when it gets added.** Don't reuse the mobile client.

5. **OIDC trust is pinned to `d1rect0r/quilty-aws` repo only** (`modules/oidc-layer`). The website's deploy role MUST trust `d1rect0r/quilty-website` as a separate `module.oidc_layer` invocation in `quilty-aws/website-baseline/` OR a new module that allows multiple repo patterns. Don't try to share the existing `tf-foundation-apply`-style role.

6. **`generate_secret = true` is required for `enable_propagate_additional_user_context_data` (Cognito adaptive auth scoring on device-context fingerprint).** The existing mobile client is `generate_secret = false` (public client) so it CAN'T enable that flag — see `auth/client.tf:80-92`. **Adding a confidential web client unlocks this** as a side benefit (adaptive auth runs the same code path the mobile client cannot use).

7. **SES is still in SANDBOX** (`email/variables.tf:166`). For a website at launch with thousands of signups, this is a hard cap. File the production-access support case before M6.

8. **`development` account OIDC layer (`development/oidc.tf`)** only trusts `d1rect0r/quilty-aws` and only vends `tf-development-plan/apply` — no website deploy role. The first website deploy requires either:
   - Extending `development/oidc.tf` to add `quilty-website-deploy-*` roles (preferred — matches the per-repo trust pattern), OR
   - Creating a new `quilty-aws/website-baseline/` layer that creates a fresh OIDC provider in the development account scoped to `quilty-website` and vends the roles. **`sst-deploy.md` describes the second option.**

9. **Tag-key drift between strategy and SST config.** `sst.config.ts:71` emits `quilty:env` but the Tag Policy key is `quilty:environment`. SST also omits `quilty:compliance`, `quilty:data-classification`, `quilty:managed-by`, `quilty:backup-policy`, `quilty:component`, `quilty:owner-email`, `quilty:criticality`, `quilty:deployment-id`. **This is OK today (Tag Policy is in MONITOR mode + D27 enforce flip is deferred), but the website's tags will be flagged at the OPA/Conftest gate when CI is wired in.** Fix in `sst.config.ts` `siteTagsFor()` before first CI-driven deploy.

10. **OpenAPI emission lives in `quilty-aws/lambdas/rust/crates/quilty-openapi-emitter`** — this is a CI-only crate that scans `#[utoipa::path]` annotations to emit `docs/auth/auth_v2_openapi.yaml`. **The website needs an OpenAPI consumer**: ingest this YAML and run `openapi-typescript` (or similar) in the `quilty-website` CI to generate `packages/shared-types`. The OpenAPI spec is currently in `quilty-aws/docs/auth/`. The website needs a copy-or-fetch mechanism — either:
    - Publish the YAML as a release asset on `d1rect0r/quilty-aws` and have website CI download it, OR
    - Add a webhook from `quilty-aws` CI that bumps a version file in `quilty-website`, OR
    - Vendor it (with a freshness CI check) in `quilty-website/packages/shared-types`.

11. **The `quilty:owner-email` tag default in `dns/variables.tf:43`** is `platform@my-quilty.app` — uses the `.app` (internal) domain. Consistent with the convention that `.app` is the infra/internal domain.

12. **The `dns/records.tf:178` website_root record is gated `count = 0`** with a TODO comment to switch to Alias when CloudFront lands. This is a hand-off point — when SST deploys CloudFront, this resource block will need to be replaced with an Alias A-record (CNAME at apex is technically allowed in Route 53 but conflicts with TXT at apex; Alias is the right call). Flag this as a coordination point in the Phase A → C runbook.

---

## Open scope questions

1. **Which AWS account owns the website's WAF Web ACL?** The CloudFront distribution lives in the development account (Phase 0), so the CLOUDFRONT-scope WAF must also be in us-east-1 of the development account. But the existing `app-sync/waf.tf:153` CloudFront WAF is in production account. These don't share, and that's fine — but flag that the development-account team will need to budget ~$10/mo + $0.60/M requests for the new managed-rule groups. Phase 1 migration moves the ACL to `marketing-prod`.

2. **OpenAPI distribution mechanism** (Surprise #10) — pick one of three options before website CI is wired.

3. **Cross-account EventBridge: where does the website's session-revocation consumer live?** Two options:
   - Run an EventBridge rule in the **production** account that has a cross-account target → the development-account-side website Lambda (requires bus policy on the website side). OR
   - Forward `quilty-production-auth-events` to a website-owned bus in the development account via cross-account rule + bus policy.
     The second is cleaner and matches the pattern at `foundation/eventbridge_cross_account.tf` (management→production for security findings). **Recommend: pattern this after `aws_cloudwatch_event_bus.security_findings`.**

4. **Does the website's Cognito web client live in `auth/client.tf` (production account, alongside mobile) or in its own `website-baseline/` layer?** Cognito user pools are single-account by design — the pool lives in production (`975630231383`), so the web client MUST be defined alongside `auth/client.tf` even though the deploy runs against development. Recommend: add the resource in `auth/client.tf` and SSM-export `/quilty/auth/cognito_client_id_web` so the dev-account SST stack can read it cross-account via `aws ssm get-parameter --profile production`.

5. **Session table placement (ADR-0002):** if the table is colocated with SST stack in development account, the production-account Rust authorizer cannot read it for cross-validation. If it lives in production account (closer to Cognito), the website BFF in development needs cross-account DDB read. Recommend: **website BFF in development reads its OWN session table (development account, SST-managed) and trusts Cognito JWT claims for backend authorization** — the website BFF and the Rust authorizer are SEPARATE concerns. The Rust backend never sees the website session ID; only the Cognito access-token. This avoids cross-account DDB I/O entirely.

6. **SES production-access timing.** Worth confirming with operator: should `quilty-aws/email/` request production access NOW (before M6) so the queue is dequeued by launch, or wait until launch-volume signal is concrete? AWS support response time is typically 1-3 business days but can stretch to weeks during peak. Defaults to "request now" given zero downside.

7. **Honeycomb vs. Sentry (D42a) — do they share OTLP?** `quilty-aws` ships OTLP to Honeycomb only. The website strategy says "Sentry consumes OTel spans (D56)." Sentry's OTel ingest is via `https://o<org-id>.ingest.us.sentry.io/api/<project-id>/envelope/`. Wire the website to Sentry, not Honeycomb (different orgs, different DSN). **Backend traces stay on Honeycomb; website traces go to Sentry.** No need to fan out — they're separate observability surfaces.

---

## Appendix — file references

| Topic                              | File                                                     | Lines                                         |
| ---------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| `my-quilty.app` zone               | `quilty-aws/dns/hosted_zone.tf`                          | 11-23                                         |
| `my-quilty.com` zone               | `quilty-aws/dns/hosted_zone.tf`                          | 33-45                                         |
| `my-quilty.com` email records      | `quilty-aws/dns/records_com.tf`                          | full                                          |
| ACM wildcard `.app`                | `quilty-aws/dns/acm.tf`                                  | 12-30                                         |
| DNSSEC KMS key                     | `quilty-aws/dns/dnssec.tf`                               | 10-71                                         |
| Auth Cognito pool                  | `quilty-aws/auth/main.tf`                                | 23-503                                        |
| Auth Cognito mobile client         | `quilty-aws/auth/client.tf`                              | 10-113                                        |
| Auth verification client           | `quilty-aws/auth/client.tf`                              | 210-313                                       |
| `auth.my-quilty.com` ACM + domain  | `quilty-aws/auth/dns.tf`                                 | 20-103                                        |
| Identity providers (Google/Apple)  | `quilty-aws/auth/identity_providers.tf`                  | 19-67                                         |
| Auth triggers Lambda               | `quilty-aws/auth/triggers.tf`                            | 119-244                                       |
| Auth WAF (REGIONAL, Cognito)       | `quilty-aws/auth/waf.tf`                                 | 13-                                           |
| Auth events bus                    | `quilty-aws/auth/outbox.tf`                              | `aws_cloudwatch_event_bus.quilty_auth_events` |
| SES identities                     | `quilty-aws/email/identities.tf`                         | 17-63                                         |
| SES configuration sets             | `quilty-aws/email/configuration_sets.tf`                 | full                                          |
| SES MAIL FROM                      | `quilty-aws/email/mail_from.tf`                          | full                                          |
| SES VDM                            | `quilty-aws/email/vdm.tf`                                | full                                          |
| Foundation OIDC (prod)             | `quilty-aws/foundation/oidc.tf`                          | full                                          |
| Foundation EventBridge             | `quilty-aws/foundation/eventbridge.tf`                   | full                                          |
| Foundation EventBridge cross-acct  | `quilty-aws/foundation/eventbridge_cross_account.tf`     | full                                          |
| Foundation SSM exports             | `quilty-aws/foundation/ssm_exports.tf`                   | full                                          |
| Foundation security logs bucket    | `quilty-aws/foundation/log_bucket.tf`                    | 157+                                          |
| Foundation Lambda artifacts bucket | `quilty-aws/foundation/lambda_artifacts.tf`              | full                                          |
| Management Tag Policy              | `quilty-aws/management/tag_policies.tf`                  | full                                          |
| Management SCPs                    | `quilty-aws/management/scps.tf`                          | 1-700                                         |
| Management accounts                | `quilty-aws/management/accounts.tf`                      | full                                          |
| Management KMS                     | `quilty-aws/management/kms.tf`                           | full                                          |
| Development OIDC                   | `quilty-aws/development/oidc.tf`                         | full                                          |
| Development baseline               | `quilty-aws/development/baseline.tf`                     | full                                          |
| App-sync API GW                    | `quilty-aws/app-sync/api_gateway.tf`                     | 45+                                           |
| App-sync CloudFront WAF            | `quilty-aws/app-sync/waf.tf`                             | 153+                                          |
| `quilty_main` DDB                  | `quilty-aws/app-sync/dynamodb.tf`                        | 14                                            |
| Rust crates dir                    | `quilty-aws/lambdas/rust/crates/`                        | 53 crates                                     |
| OpenAPI emitter                    | `quilty-aws/lambdas/rust/crates/quilty-openapi-emitter/` | Cargo.toml                                    |

ARNs noted in plaintext are public-by-classification (resource identifiers, not credentials); KMS key IDs and account IDs are scoped to the quilty-aws Terraform state which is itself private + KMS-encrypted.
