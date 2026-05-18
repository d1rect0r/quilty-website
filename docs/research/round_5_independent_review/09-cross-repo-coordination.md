# Cross-repo Integration Surface: quilty-website ↔ quilty-aws

> Read-only investigation, 2026-05-17. All file paths absolute.
> Sources: `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/` Terraform layers + Rust crates, plus AWS Cognito docs (cited inline). No edits made.

---

## Headline finding

**quilty-aws is far more mature than the typical "greenfield" Phase 0 assumption.** The DNS layer, ACM wildcard, Cognito User Pool (Plus tier, threat protection in AUDIT, WebAuthn enabled), SES (3 identities), SSM cross-layer registry, GitHub OIDC, permissions boundary, and OpenAPI emit CI are all live and production-grade. The Phase 0 work for the website is **not "build the AWS substrate"** — it is **(a) carve a small `website-baseline/` layer in the `development` account, (b) add Cognito web app client + redirect URIs on the existing pool, (c) extend `dns/` with apex+www alias records for the SST-deployed CloudFront, (d) extend the OpenAPI emit pipeline to publish TS-consumable artifacts**.

There is **one structural mismatch worth flagging up front (D6 vs current Cognito state):** strategy doc D9 + D11 lock OIDC Back-Channel Logout with `sid` claim as required, but **AWS Cognito does NOT advertise `backchannel_logout_supported` in its OIDC discovery, does NOT accept `backchannel_logout_uri` registration on app clients, and does NOT emit a `sid` claim in ID tokens.** The `origin_jti` revocation primitive is present; the IETF-standard Back-Channel Logout endpoint (RFC 8417 / OIDC BCL 1.0) is not. The web BFF will need to compensate with a polling/database-backed session-validity check, or treat `/oauth2/revoke` + Cognito Plus's adaptive auth signals as the substitute. **This needs a D-level revisit pre-M6** (recommendation: add D49a or M6 ADR noting the gap + chosen mitigation).

---

## Section 1: Integration surface inventory

| Resource the website needs | Exists at quilty-aws? | Where (absolute path) | Status | Action needed for M1 |
|---|---|---|---|---|
| **Route 53 hosted zone — `my-quilty.com`** | YES | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/dns/hosted_zone.tf` (resource `aws_route53_zone.com`) | Live in production account `975630231383`, `lifecycle.prevent_destroy = true`, DNSSEC ENABLED (KSK + ZSK in `dnssec.tf`), query logging to log-archive. Output: `com_hosted_zone_id`, `com_name_servers`. Registrar = Porkbun. | **None** for hosted zone itself. Adds will land in `dns/` for the SST-created CloudFront (Section 3). |
| **Route 53 hosted zone — `my-quilty.app`** | YES | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/dns/hosted_zone.tf` (resource `aws_route53_zone.primary`) | Live; M365 + DKIM tied to it. **Not used by the website itself** (website is `.com`). Listed for context. | None. |
| **Route 53 hosted zone — `my-quilty.net`** | YES | same file (resource `aws_route53_zone.net`) | Brand-protection only (null MX, etc.). | None. |
| **ACM wildcard cert `*.my-quilty.app` (us-east-1)** | YES | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/dns/acm.tf` (resource `aws_acm_certificate.primary`) | ECDSA P256, DNS-validated, output `acm_certificate_arn`. **Not on `.com`** — primary is `.app`. | **NEW cert needed:** `my-quilty.com` + `*.my-quilty.com` in us-east-1 for the SST CloudFront. Either created by SST (TF `dns/` writes validation CNAMEs in `.com` zone) or pre-created in `dns/` and ARN exported. (See Section 3 + Section 2.) |
| **ACM `auth.my-quilty.com` cert** | YES | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/dns.tf` (resource `aws_acm_certificate.auth_domain`) | Created + validated; ready for Cognito custom domain attach. `aws_cognito_user_pool_domain.custom` is **gated by `enable_custom_domain` (default false)** — currently prefix domain `quilty-prod.auth.us-east-1.amazoncognito.com`. | **Flip `enable_custom_domain = true` once `my-quilty.com` has an A record** (SST-driven CloudFront alias at M1). Comment in `dns.tf:67` explicitly: "Cognito requires the parent domain of a custom subdomain to resolve." |
| **Cognito User Pool** | YES | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/main.tf` (resource `aws_cognito_user_pool.main`) | **`user_pool_tier = "PLUS"`** (threat protection + adaptive auth + compromised-credentials available); MFA = OPTIONAL with TOTP only (no SMS by design); password policy NIST 800-63B-4 (15-char minimum, no composition); WebAuthn enabled with `relying_party_id = my-quilty.com` and `user_verification = "required"`; passkeys + password as first auth factors; deletion_protection ACTIVE; advanced_security_mode = AUDIT (will flip to ENFORCED post-2-week soak). Email via SES DEVELOPER mode from `verify@my-quilty.com`. 12 Lambda triggers wired. | **None to pool itself.** The website inherits exactly this pool. Note `relying_party_id` already matches D6 — WebAuthn passkeys from `my-quilty.com` will work without IdP retargeting. |
| **Cognito mobile app client** | YES | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/client.tf` (resource `aws_cognito_user_pool_client.mobile`) | Public client (no secret), SRP + CUSTOM_AUTH + USER_AUTH flows, 5-min access/ID + 30-day rotating refresh, NO `callback_urls` / `logout_urls` (Custom Auth is API-based, not OAuth-redirect). | **Not reusable for web.** Mobile client is API-flow only. M6 deliverable: a NEW `aws_cognito_user_pool_client.web` confidential client with `allowed_oauth_flows = ["code"]`, PKCE-required (Cognito only supports S256), `callback_urls = ["https://my-quilty.com/api/auth/callback"]`, `logout_urls = ["https://my-quilty.com/api/auth/logout/return"]`, scopes `openid email profile`, `supported_identity_providers = ["COGNITO", "Google", "SignInWithApple"]`, refresh-token rotation ENABLED, and `enable_propagate_additional_user_context_data = true` (BFF has secret → can enable adaptive auth context payload, unlike mobile). |
| **Cognito custom domain `auth.my-quilty.com`** | PROVISIONED but DORMANT | `auth/dns.tf:73-87` (count = `enable_custom_domain ? 1 : 0`) | ACM cert validated; resource defined; toggle gated on apex A-record existence. Cognito provisions a CloudFront distribution under the hood (takes 15-60 min on first apply). | M1 ordering: (1) SST deploys CloudFront at apex, (2) `dns/` adds apex alias, (3) `auth/` apply with `enable_custom_domain = true` and `auth.my-quilty.com` alias record gets created. ~30-60 min Cognito provisioning window. |
| **Cognito IdPs (Google + Apple)** | PROVISIONED conditionally | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/identity_providers.tf` | Both gated on `var.google_client_id` / `var.apple_service_id` being non-empty. Comment notes: "actual OAuth authentication uses the Custom Auth Challenge flow (Phase 3), NOT Cognito's hosted UI federation redirect." — i.e. mobile pattern. | **For web, the redirect-flow path IS what we want.** Once the web app client is provisioned with `supported_identity_providers = [..., "Google", "SignInWithApple"]`, Cognito Managed Login's IdP-redirect path lights up — no further IdP-layer work, but: (a) the Google+Apple credentials need to authorize the new `auth.my-quilty.com/oauth2/idpresponse` callback in the respective vendor consoles, (b) Google/Apple JS SDKs in the website should NOT be loaded — federation is server-side via Managed Login redirect. |
| **Cognito SSM cross-layer registry** | YES | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/ssm.tf` | 7 String params at `/quilty/auth/{cognito_pool_id, cognito_pool_arn, cognito_client_id, cognito_jwks_uri, cognito_issuer, cognito_audience, cognito_kms_email_arn}`. `cognito_audience = mobile client ID` — **NOT directly reusable by the website BFF** (BFF needs WEB client ID as audience). | **Action:** add `/quilty/auth/cognito_web_client_id` + `/quilty/auth/cognito_web_audience` parameters in `auth/ssm.tf` when the web client is added (M6). For M1 the website doesn't read any of these — it has no live auth yet. |
| **WAF for Cognito** | YES | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/waf.tf` (resource `aws_wafv2_web_acl.cognito`) | Regional ACL on the user pool itself: rate-limit (100 req/5min/IP), AWS IP reputation, common rules, known bad inputs. Logs to CW with 365-day retention + KMS. | None for M1. Note: ATP managed rule explicitly disabled — Cognito Plus threat protection is the substitute. |
| **WAF for the website's CloudFront** | NO | — | SST does not provision WAF by default. | **Defer to M2 or M3** unless launch traffic is meaningful. When added, scope = CLOUDFRONT (us-east-1 global), separate ACL from `auth/waf.tf` (different threat surface — bot/scraper rather than credential stuffing). Recommend: AWSManagedRulesCommonRuleSet + AWSManagedRulesAmazonIpReputationList + AWSManagedRulesBotControlRuleSet (paid tier) — gate the latter on launch traffic. |
| **SES — transactional / notifications / marketing identities** | YES | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/email/identities.tf` + `email/README.md` | All 3 SES identities verified, DKIM CNAMEs published, MAIL FROM custom subdomains, 4 configuration sets (transactional/notifications/marketing/admin), DLQ + processor Lambda + Firehose audit pipeline + bounce/complaint alarms. **`ses_send_policy_arn` output** is the IAM policy granting `ses:SendEmail/SendRawEmail` on all 3 identities — attachable to any Lambda role (incl. the SST BFF Lambda). **SES sandbox status: pending confirmation** — alarm threshold default `180/day` is "90% of 200 sandbox limit" per `variable.ses_daily_send_threshold`. | **Verify in console** whether production access has been granted (out-of-band by AWS Support). If still sandbox-limited: file SES production-access request **now** so it lands before M6 (typical AWS turnaround: 24-48h, sometimes 1 week). For M1: no website→SES integration needed (no transactional emails). For M5/M6: BFF Lambda role attaches `ses_send_policy_arn`; send via `transactional` configuration set from `noreply@my-quilty.com` or `support@my-quilty.com`. **PHI rule: SES configuration sets are HIPAA-eligible only if no PHI is in the email body** — keep welcome/password-reset/MFA-code bodies PHI-free, which they naturally are. |
| **SSM Parameter Store — generic Quilty registry** | YES | scattered: `/quilty/auth/*` (auth layer), `/quilty/{env}/auth/*` (env-scoped), `/quilty/{env}/verification/*` (verification harness — should be deleted when dev account stood up per `client.tf:200`) | Pattern is **`/quilty/<service>/<key>` for prod, `/quilty/<env>/<service>/<key>` for env-scoped.** | **NEW namespace for website:** `/quilty/<env>/website/{hosted_zone_id_com, acm_cert_arn_com, cloudfront_distribution_id, lambda_role_arn, sst_state_bucket}` plus future `/quilty/<env>/website/cognito_web_client_id`. Created by the new `website-baseline/` layer (Section 2). |
| **GitHub Actions OIDC provider — development account** | YES | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/development/oidc.tf` (via `modules/oidc-layer`) | Provider exists; `tf-development-plan` (ReadOnlyAccess) + `tf-development-apply` (AdministratorAccess + permissions boundary) roles already provisioned. **Trust scoped to `repo:d1rect0r/quilty-aws:*`** (per `modules/oidc-role/tests/oidc_role.tftest.hcl`). | **The OIDC provider can be reused** (one per account is the AWS limit). **The roles cannot** — they are repo-scoped to `quilty-aws`. **Action:** add 2 new roles (`tf-website-plan` + `tf-website-apply`) in a new `quilty-aws/website-baseline/` layer (Section 2), scoped to `repo:d1rect0r/quilty-website:*`, reusing `module.oidc_layer.oidc_provider_arn` + `module.oidc_layer.permissions_boundary_arn` from the existing development layer. |
| **IAM permissions boundary `quilty-tf-apply-boundary`** | YES | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/modules/oidc-layer/main.tf` (lines ~40-200) | Denies: IAM escalation (CreateUser/CreateAccessKey/CreateOpenIDConnectProvider/etc.), KMS destruction, EBS encryption disable, default-VPC creation, organization leave, self-mutation on tf-*-apply, boundary tampering, privileged-policy attachment (AdminAccess/IAMFullAccess/PowerUserAccess on tf-* roles). | **Reusable as-is** for the website's SST apply role. The boundary is permissive enough for SST to create CloudFront/Lambda/S3/ACM/Route53 (SST doesn't need IAM-user creation or KMS deletion). Attach via `permissions_boundary_arn = module.oidc_layer.permissions_boundary_arn`. |
| **Terraform state S3 bucket `quilty-terraform-state`** | YES | bootstrap layer (us-east-2) | All TF layers use this bucket cross-account via state-bucket policy granting 10 CI roles access. | **SST has its own state mechanism** (per-stage CloudFormation + S3-backed bootstrap bucket). **Action:** SST creates its own bootstrap bucket on `sst deploy --stage <dev>` first run — pre-grant SST's IAM principal `s3:*` on `arn:aws:s3:::sst-state-*` via the new `tf-website-apply` role. **Do NOT mix SST state with TF state in the same bucket** (different lifecycle, different consistency model). |
| **VPC / private subnets** | YES for foundation (production); YES placeholder for development | foundation + development layers | **Website does NOT need a VPC.** Marketing site + BFF Lambda runs without VPC attachment (no RDS, no ElastiCache from web tier). Auth layer's ElastiCache Valkey JTI denylist (`auth/cache_elasticache.tf`) is consumed by Rust Lambda authorizers, not the website. | None. |
| **CloudTrail org trail + management events** | YES | `management/` layer | Logs every Cognito user-pool admin event (`AdminCreateUser`, `AdminInitiateAuth`, `RevokeToken`, etc.) globally; org trail → log-archive S3 with Object Lock 7-year retention. | None for M1. **Implication for auth posture:** every Cognito API call from the BFF is captured in CloudTrail; CloudTrail event names are the auditable ground-truth for HIPAA §164.308(a)(1)(ii)(D) incident review. |
| **DDB Streams → Firehose → S3 Object Lock audit pipeline** | YES | `auth/audit_pipeline_canary.tf` + `email/firehose.tf` | Used by Rust backend + email layer. **Website-irrelevant** — website does not write to DDB. | None. |
| **OpenAPI emit pipeline** | YES, partial | `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/lambdas/rust/crates/quilty-openapi-emitter/` + `.github/workflows/ci-openapi.yml` | Compile-time emit via `utoipa::path` annotations. **As of W2-B.3 Phase E (2026-05-14)** only the `auth-public` Lambdalith's 11 endpoints are annotated; auth-user + auth-admin annotations not yet landed. Canonical spec lives at `docs/auth/auth_v2_openapi.yaml` (currently Python-generated from routes); the utoipa emit writes a parallel `auth_v2_openapi.utoipa.yaml` for drift validation. | **TS-codegen pipeline does NOT exist yet** in either repo. See Section 6 for concrete plan. |

---

## Section 2: New TF layer `quilty-aws/website-baseline/` — file-by-file deliverables

This is a NEW small Terraform layer in `quilty-aws/`, applied in the **development account `619758066987`** for Phase 0. Mirrors the convention of every other layer (own `backend.tf`, `versions.tf`, `providers.tf`, `variables.tf`, `outputs.tf`, `README.md`).

| File | Purpose | Key resources |
|---|---|---|
| `website-baseline/README.md` | Per-layer context, invariants, runbook (auto-generated table via terraform-docs as elsewhere) | — |
| `website-baseline/backend.tf` | S3 backend pointing at bootstrap-owned `quilty-terraform-state`, key `website-baseline/terraform.tfstate`, region `us-east-2` | `terraform { backend "s3" {} }` |
| `website-baseline/versions.tf` | Pin `aws ~> 6.40`, `terraform >= 1.12.0, < 2.0.0` (matches every other layer) | — |
| `website-baseline/providers.tf` | `aws` (us-east-1 default for ACM compatibility) + `aws.use2` alias for cross-region S3 if needed. `default_tags` block stamping `quilty:service = website`, `quilty:owner-email`, `quilty:deployment-id`, `quilty:environment = phase0-development`. | — |
| `website-baseline/variables.tf` | Standard 5: `account_id` (default `619758066987`), `aws_region`, `environment` (default `phase0-development`), `owner_email`, `deployment_id`. Each with `validation {}` block per the repo standard (CLAUDE.md rule 8). | — |
| `website-baseline/oidc.tf` | **Look up** existing OIDC provider from `development` layer state via `data "terraform_remote_state" "development"` → `module.oidc_layer.oidc_provider_arn`. Create 2 new OIDC roles: `tf-website-plan` (ReadOnlyAccess + state-bucket inline policy) and `tf-website-apply` (custom policy scoped to SST-required actions, attached `permissions_boundary_arn = module.oidc_layer.permissions_boundary_arn`). Both trust `repo:d1rect0r/quilty-website:*` for plan, `repo:d1rect0r/quilty-website:environment:website-apply` for apply. Use `modules/oidc-role/`. | `module "website_plan"` + `module "website_apply"` + custom IAM policy for SST actions |
| `website-baseline/sst_iam.tf` | SST-required IAM permissions for the apply role: CloudFront create/update/delete + invalidations, Lambda@Edge create + IAM PassRole for Lambda execution role, S3 create+CRUD on `sst-*` buckets, ACM request+delete in us-east-1, Route53 ChangeResourceRecordSets on the `.com` zone (cross-account: see `cross_account.tf` below), CloudFormation full on `sst-*` stacks, SSM Parameter Store read on `/quilty/phase0-development/website/*`, Lambda create/update/delete + log group, IAM role create/update/delete scoped to roles tagged `sst-app=quilty-website-*`. **Scope each action with resource ARN patterns** — avoid `Resource = "*"` where avoidable. | `aws_iam_policy.sst_apply_permissions` + role-policy attachment |
| `website-baseline/cross_account.tf` | **The Pattern A glue.** The dev account's `tf-website-apply` role needs to write Route 53 records into the **production-account** `.com` zone. Two-step pattern: (1) SST creates the CloudFront in dev account, outputs distribution domain to SSM, (2) `dns/` layer in production account reads from SSM (or from website-baseline output) and writes the apex alias + ACM validation CNAMEs. **website-baseline writes the cross-account ASSUMABLE role + the SSM contract.** Resource: `aws_iam_role.cross_account_dns_writer` in production account (provisioned by `dns/` layer, not here) — website-baseline only documents the contract. **Phase 0 simpler alternative:** SST runs `sst deploy` → CloudFront comes up at `*.cloudfront.net` URL → engineer manually copies validation CNAMEs to a `dns/website.tf` PR → applies dns layer → `sst deploy` again now wires the alias. One ceremony per domain. | — (mostly contract docs + outputs) |
| `website-baseline/ssm.tf` | Cross-layer SSM registry for the website. Strings at `/quilty/phase0-development/website/{hosted_zone_id_com, acm_cert_arn_com (placeholder, written by dns/), cloudfront_distribution_id (written back by SST), sst_apply_role_arn, sst_plan_role_arn}`. Same `#checkov:skip=CKV2_AWS_34` pattern as `auth/ssm.tf`. | `aws_ssm_parameter.hosted_zone_id_com` + 4 others |
| `website-baseline/state_bucket_policy.tf` | Add the new `tf-website-plan` + `tf-website-apply` roles to the bootstrap state-bucket policy (the bucket lives in production account). Either: (a) update bootstrap layer's state-bucket policy directly, OR (b) add a `aws_s3_bucket_policy` augmentation via cross-account assume-role from this layer. Cleaner: update `bootstrap/state_bucket_policy.tf` in quilty-aws (separate PR) — but document the dependency here. | — (mostly cross-layer doc) |
| `website-baseline/outputs.tf` | Outputs: `apply_role_arn`, `plan_role_arn`, `ssm_path_prefix`. Consumed by GitHub Actions workflows in `quilty-website`. | — |
| `website-baseline/tests/baseline.tftest.hcl` | `terraform test` scenarios per the repo pattern: assert role names, trust principal, permission boundary attached, SSM names match the contract. | — |

**What we DO NOT need to add for Phase 0:**
- A bespoke KMS CMK for the website (SST-managed CloudFront uses CloudFront's default; Lambda env vars use AWS-managed `aws/lambda`; SSM Strings are non-secret).
- Anything for Sentry / Amplitude / GrowthBook (SaaS, no AWS resources).
- WAF Web ACL (defer to M2/M3 trigger).
- A VPC.

**What gets added LATER (M6 / M8 / Phase 1 trigger):**
- M6: `aws_cognito_user_pool_client.web` + `aws_cognito_user_pool_client_app_secret` (managed by Cognito), plus `/quilty/<env>/auth/cognito_web_*` SSM parameters in `auth/ssm.tf`.
- M8: WAF on website CloudFront (CLOUDFRONT scope), bot-control rules.
- Phase 1 trigger: a *new* `marketing-prod/` layer in a *new* `marketing-prod` account, with full vending via management/Organizations. `website-baseline/` becomes either `website-baseline-dev/` (retained for previews) or destroyed.

---

## Section 3: `quilty-aws/dns/` updates needed at M1 cutover

Add a new file `dns/records_website.tf` (existing `dns/records.tf` is `.app` zone — keep separate for clarity, same convention used for `records_com.tf` already):

| Record | Type | Target | Notes |
|---|---|---|---|
| `my-quilty.com` (apex) | A (alias) | SST-created CloudFront distribution domain (e.g. `d1234abcd.cloudfront.net`) | `alias { name = ..., zone_id = "Z2FDTNDATAQYW2", evaluate_target_health = false }`. Hosted zone ID `Z2FDTNDATAQYW2` is the global CloudFront zone (constant). Source the CloudFront domain from `data "terraform_remote_state" "website_baseline"` or via an SSM read. |
| `www.my-quilty.com` | A (alias) | Same CloudFront distribution | Convention: serve www, 308 redirect www→apex (or apex→www — D-locked? not in strategy doc; default = apex canonical, www→apex 308). |
| **ACM validation CNAMEs** for `my-quilty.com` + `*.my-quilty.com` cert | CNAME | ACM-emitted target | If SST creates the ACM cert: `dns/` reads the `domain_validation_options` via cross-account data source, writes CNAMEs. If `website-baseline/` creates the ACM cert in dev account: same pattern. Either way the validation lives in the production-account `.com` zone. |
| **MTA-STS TXT** | TXT | `v=STSv1; id=...` | **DEFER until M8.** Comment in `dns/records.tf:139-140` already notes this for `.app`; same rule applies to `.com`. The `.com` zone already has `_smtp._tls.my-quilty.com` TXT-RPT pointing at tls-reports@my-quilty.app (good). |

**CAA already present** on `.com` (`dns/records_com.tf:299-316`) — allows amazon.com / amazonaws.com / amazontrust.com to issue certs. Compatible with both SST-issued ACM certs and Cognito's CloudFront cert.

**Coordinated apply sequence at M1:**
1. `cd quilty-aws && make apply-website-baseline` → emits role ARNs into SSM.
2. `cd quilty-website && pnpm sst deploy --stage phase0-dev` → SST creates CloudFront + Lambda + ACM cert (us-east-1) + emits validation CNAMEs into stack outputs.
3. Engineer copies validation CNAME values into `dns/records_website.tf` (or wires `terraform_remote_state` cross-state — slightly fragile due to SST stack output shape).
4. `cd quilty-aws && make apply-dns` → ACM cert validates.
5. `cd quilty-website && pnpm sst deploy --stage phase0-dev` again → CloudFront attaches the now-valid cert.
6. `cd quilty-aws && make apply-dns` (second time) → write apex + www alias records (now that the CloudFront distribution domain is stable in SSM).
7. **One-time:** flip `auth/var.enable_custom_domain = true` + `make apply-auth` → `auth.my-quilty.com` Cognito custom domain provisions (15-60 min). Apex must resolve first.

Ceremonial, but dormant after first apply.

---

## Section 4: Cognito 2026 capability matrix

All cited from AWS docs as of 2026-05-17 read via `mcp__aws-docs__*`.

| Feature | Supported in Cognito 2026? | Evidence (AWS docs URL) | Implications for our M1/M6 |
|---|---|---|---|
| **OIDC Back-Channel Logout (RFC-spec `backchannel_logout_uri` on client + `backchannel_logout_supported` in discovery + `sid` claim in ID tokens)** | **NO.** Cognito's only logout primitives are `/logout` (front-channel redirect), `/oauth2/revoke` (token revocation), `GlobalSignOut` / `AdminUserGlobalSignOut` (server-side session invalidation), and `origin_jti` claim (per-token revocation linkage). The OIDC discovery document at `https://cognito-idp.<region>.amazonaws.com/<pool>/.well-known/openid-configuration` does **not** advertise `backchannel_logout_supported`; the app-client API does not accept `backchannel_logout_uri`. ID tokens **do not emit `sid`** — only `auth_time`, `event_id`, `jti`, `origin_jti`. | https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html ; https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html ; https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html | **D9 + D11 cannot be implemented as written.** Mitigation options for M6: (a) BFF polls `/oauth2/userInfo` on every request with a TTL cache — failed call ⇒ session expired ⇒ force re-auth (`origin_jti` will have rotated on `RevokeToken`); (b) backend writes a session-invalidation marker to the ElastiCache Valkey JTI denylist (already in use for mobile per `auth/cache_elasticache.tf`) and BFF reads it; (c) accept the limitation, document in ADR, and rely on short access-token TTL (5 min, already locked at the Cognito floor). **Recommend option (b)** — it reuses the existing infra and matches the mobile-side pattern. Add ADR pre-M6. |
| **`sid` claim in ID tokens** | **NO.** Default ID-token payload (per docs) emits `sub`, `cognito:groups`, `cognito:preferred_role`, `iss`, `cognito:username`, `nonce`, `origin_jti`, `cognito:roles`, `aud`, `identities`, `event_id`, `token_use`, `auth_time`, `exp`, `iat`, `jti`, `email`. **No `sid`.** Custom claims via PreTokenGen V2 trigger can synthesize one (Quilty already uses V2 — see `auth/main.tf:456-461`). | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html | If the BFF really wants a session-identifier claim, **add it via the PreTokenGen V2 Lambda** in `auth/`: synthesize `sid = sha256(origin_jti + user_id)` or similar. This is a Rust handler change in `cognito-trig-pretoken-gen-v2` crate — coordinate with auth-backend team pre-M6. |
| **`acr_values` request param + `acr` claim** | **PARTIAL / undocumented.** Authorize-endpoint docs do not list `acr_values` as a supported request parameter (only `response_type`, `client_id`, `redirect_uri`, `state`, `identity_provider`, `idp_identifier`, `scope`, `code_challenge*`, `nonce`, `lang`, `login_hint`). No `acr` in default ID-token payload. | https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html ; https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html | Step-up auth (RFC 9470) is not natively expressible. Workaround: custom claim emitted by PreTokenGen — exactly the pattern already in place for `custom:mfa_required_at` (see `auth/main.tf:296-318`). The Quilty Rust backend uses this for Tier-3 force-reverify gates; the website BFF can ride the same mechanism. |
| **`amr` claim** | **PARTIAL.** Not in the documented default payload. Cognito does emit `cognito:groups`, group-derived role claims, and `identities[].providerType` (which is the closest analog to `amr` for federation). For "did the user complete MFA?" the canonical signal is `auth_time` + server-side TOTP-verified flag in the user record. | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html | Not blocking. If the website needs to render "you signed in with passkey vs password" UX, derive from `identities` or add custom claim via PreTokenGen. |
| **PKCE (S256)** | **YES, required for public clients, supported for confidential.** S256 only — plain rejected. Cognito enforces PKCE on `code` grant where `code_challenge` is present. | https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html — see `code_challenge_method` param: "Amazon Cognito authentication server supports only S256." | Use PKCE in the web BFF flow. Even though the web client is confidential (has secret), PKCE is best practice per OAuth 2.0 Security BCP. Generate `code_verifier` server-side in the BFF (route handler), persist in encrypted cookie, exchange at callback. |
| **`prompt=login` (force re-authentication)** | **YES.** Documented as an example use case on the authorize endpoint. Also `prompt=none` (silent auth) is supported. | https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html — "Example: require re-authentication with `prompt=login`" section | Use for step-up auth: when accessing `/account/billing` or other sensitive routes, append `&prompt=login` to the authorize redirect. Combined with `custom:mfa_required_at` PreTokenGen claim, this gives a usable step-up pattern. |
| **Refresh token rotation** | **YES, supported and recommended.** Per app-client setting `refresh_token_rotation.feature = "ENABLED"`. Adds `origin_jti` + `jti` claims on every refresh. **Incompatible with `REFRESH_TOKEN_AUTH` flow** — must use `GetTokensFromRefreshToken` or `/oauth2/token` `refresh_token` grant. Configurable grace period up to 60s. | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html | **Enable on the web client.** Mobile already has it (`auth/client.tf:65-68` with 10s grace). Use 30-60s grace for web (cookie-write race tolerance is wider on web). |
| **Passkeys (WebAuthn) in Managed Login** | **YES.** Managed Login has a `/passkeys/add` page (only available in Managed Login, not classic Hosted UI). User pool `web_authn_configuration` block sets `relying_party_id` and `user_verification`. Plus tier required for `ALLOW_USER_AUTH` choice-based auth flow that enables passkey-only sign-in. | https://docs.aws.amazon.com/cognito/latest/developerguide/managed-login-endpoints.html ; https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_WebAuthnConfigurationType.html ; https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html#amazon-cognito-user-pools-authentication-flow-methods-passkey | **Already configured.** `auth/main.tf:171-185` has `relying_party_id = my-quilty.com`, `user_verification = "required"`, `allowed_first_auth_factors = ["PASSWORD", "WEB_AUTHN"]`. Web passkeys will Just Work via Managed Login redirect at `auth.my-quilty.com/passkeys/add` for enrollment + `/login` choice-flow for sign-in. **D6 is fully satisfied.** |
| **TOTP MFA** | **YES.** `software_token_mfa_configuration { enabled = true }` already set. SMS deliberately omitted (immutable once enabled). Email MFA also off (would create a recovery deadlock per code comment). | https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html | Web inherits exactly the mobile posture: TOTP only. Managed Login renders the QR + code challenge. |
| **SMS MFA** | **YES technically**, but **deliberately not enabled** on the Quilty pool. NIST SP 800-63B deprecates SMS for AAL2. | https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html | Keep off. |
| **Email MFA** | **YES technically**, but **off** on the Quilty pool (account recovery deadlock — see `auth/main.tf:47-50` comment). | https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html | Keep off. |
| **Adaptive auth / risk-based MFA (Plus tier)** | **YES.** Adaptive auth scores each sign-in (IP, user-agent, geo, ASN reputation) and can block, prompt MFA, or notify. Requires Plus tier + `enforcement = Full-function`. Quilty's `var.threat_protection_enforced` (default `false`) currently keeps it in AUDIT — will flip to ENFORCED post-2-week soak. | https://docs.aws.amazon.com/cognito/latest/developerguide/feature-plans-features-plus.html ; https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-settings-threat-protection.html | **Web caveat:** `enable_propagate_additional_user_context_data` requires `generate_secret = true`. Mobile cannot enable it (public client). **Web BFF IS a confidential client** — so it CAN enable the flag and get richer scoring (UA + JS-fingerprint sent via UserContextData.EncodedData). Action: set `enable_propagate_additional_user_context_data = true` on the new web client. Then load the Amplify `cognito-auth` JS bundle on the auth-callback path only (not sitewide — CSP + consent gate) to collect the fingerprint, post it to BFF, BFF forwards in `AdminInitiateAuth` call. **Alternative:** if we want zero client-side JS for fingerprinting (PHI-isolation hygiene), skip the flag — fall back to IP-only scoring (the mobile fallback). Recommend the IP-only fallback for M6, revisit at M9. |
| **Compromised-credentials detection (Plus tier)** | **YES.** Plus tier feature; compares submitted passwords against leaked-password databases on sign-up, sign-in, and password reset. | https://docs.aws.amazon.com/cognito/latest/developerguide/feature-plans-features-plus.html | Already enabled (pool is Plus). At ENFORCED mode (post-soak) it will hard-block; at AUDIT it logs only. Aligns with NIST 800-63B-4 recommendation. **No website-side work** — Managed Login handles the UX. |
| **User activity logging export (Plus tier)** | **YES.** Export to S3, Firehose, or CloudWatch Logs. | https://docs.aws.amazon.com/cognito/latest/developerguide/feature-plans-features-plus.html | Already configured in `auth/logging.tf` (haven't read but inferred from layer file list). Website inherits. |
| **Managed Login (Nov 2024 redesign)** | **YES.** Replaces classic Hosted UI for new pools. UI differences are visible, not functional; all paths shared except `/passkeys/add` (Managed Login only). Localizable. | https://docs.aws.amazon.com/cognito/latest/developerguide/managed-login-endpoints.html ; https://docs.aws.amazon.com/cognito/latest/developerguide/authentication-flows-selection-managedlogin.html | **Use Managed Login, not classic Hosted UI.** Set `branding_version = "MANAGED_LOGIN_BRANDING_V2"` on the user pool domain at M6. Branding (logos, colors) configured via `aws_cognito_managed_login_branding` resource — design tokens from `apps/web/app/globals.css` cannot be auto-synced; manual one-shot. |
| **Custom UI (app-side rendering)** | **YES** via direct Cognito API calls (`InitiateAuth`, `RespondToAuthChallenge`, etc.) from BFF — bypasses Managed Login entirely. | https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-integrate-apps.html | **D6 explicitly rejects this** ("Custom UI = premature differentiation"). Keep Managed Login. Revisit at M9+ if branding limitations become user-facing. |
| **CloudTrail event coverage** | **YES.** All Cognito API calls captured in management events. Sensitive admin events (`AdminInitiateAuth`, `AdminResetUserPassword`, `RevokeToken`, `GlobalSignOut`) are documented. | Cognito Plus feature page (above) + management/ layer CloudTrail org trail | No website-side action — already plumbed into log-archive with 7-year Object Lock. |
| **Cognito Plus tier itself** | **YES, in use.** `user_pool_tier = "PLUS"` set at `auth/main.tf:36`. Costs more (~$0.015/MAU above Essentials) but unlocks threat protection + adaptive auth + activity log export. | https://docs.aws.amazon.com/cognito/latest/developerguide/feature-plans-features-plus.html | Inherited. |

---

## Section 5: Phase 0 → Phase 1 migration runbook draft

**Trigger:** public launch OR first revenue. Strategy doc D47 says "vend `marketing-prod` account in Workloads-NonHIPAA OU."

**End state:** SST CloudFront + Lambda + ACM in new `marketing-prod` account (~`111111111111`, ID TBD); DNS records still in production-account `dns/` layer; Cognito unchanged (still in production account); SCP `DenyPHIAccessFromMarketingAccount` applied at the OU level.

| Step | Owner | What changes | Estimated downtime | Rollback |
|---|---|---|---|---|
| 0 | Human | File AWS Organizations request via management layer: add `marketing-prod` account in `Workloads-NonHIPAA` OU (already exists for non-PHI workloads) | 0 (Org account creation = 5 min, async) | Delete account creation request before close |
| 1 | TF | Bootstrap new account: replicate `bootstrap/`, `management/` baseline (via management `aws_organizations_account.marketing_prod` already standard pattern from foundation/development split) | 0 | — |
| 2 | TF | Create `marketing-prod/` Terraform layer (clone of `website-baseline/` pattern, retargeted to new account). Reuse `modules/account-baseline`, `modules/hardened-bucket`, `modules/oidc-layer`, `modules/oidc-role`. New OIDC roles `tf-marketing-prod-{plan,apply}` trusting `quilty-website` repo `environment:marketing-prod-apply` (GitHub environment with manual approval gate, per the existing pattern in `apply-auth.yml` etc.) | 0 | TF destroy the new layer |
| 3 | SST | `cd quilty-website && pnpm sst deploy --stage marketing-prod` (new stage, new account) — creates a NEW CloudFront distribution, NEW Lambda, NEW ACM cert in the marketing-prod account. **Use a different domain temporarily** (e.g. `preview.my-quilty.com`) so prod traffic on apex is undisturbed. | 0 | `sst destroy --stage marketing-prod` |
| 4 | TF | `dns/records_website.tf` ALIAS update: change apex + www target from old CloudFront (dev account) to new CloudFront (marketing-prod). Single record swap. Route 53 alias-change propagation: ~60s for ALIAS records. | **~60s perceived** (alias resolution flips on the next DNS query; CloudFront keeps serving the old origin until its CDN edge resolves the new alias — likely 0 user-visible downtime if old distribution stays up) | Re-apply previous `dns/` HEAD with old alias |
| 5 | Cognito | `auth/client.tf` web client: add new callback URL (if marketing-prod uses a temporary subdomain) OR no change (if domains are stable). Add the marketing-prod CloudFront's domain to Cognito CORS allow-list (if applicable). | 0 | Revert client change |
| 6 | TF | After 24-48h of dual-stack stability: `cd quilty-aws && terraform destroy -target module.website_apply -target module.website_plan` on the OLD `website-baseline/` (dev account). Delete the old SST stack via `sst destroy --stage phase0-dev`. | 0 (already off-traffic) | `terraform apply` to recreate |
| 7 | SCP | Apply `DenyPHIAccessFromMarketingAccount` SCP at the `Workloads-NonHIPAA` OU level: `Deny s3:Get*` on PHI-bucket ARNs, `Deny dynamodb:Get*/Query/Scan` on `quilty_main*` tables, etc. (Pattern in `management/scps.tf` already; just add a new statement.) | 0 | Revert SCP |
| 8 | SSM | Rewrite `/quilty/marketing-prod/website/*` params in the new account. Update GitHub Actions secret/variable `AWS_ACCOUNT_ID` to the new marketing-prod ID. | 0 | Revert |
| 9 | Cognito custom domain | **NO CHANGE.** `auth.my-quilty.com` stays in the production account. The website redirects users out to `auth.my-quilty.com` regardless of which account owns the CloudFront origin. This is the entire point of D6's "isolated auth attack surface" — the auth surface is decoupled from the marketing surface. | 0 | — |

**Total estimated downtime: ~60s** during step 4 (DNS alias swap), and only for cache-miss requests during that window. Likely **zero perceived downtime** to a returning user.

**Rollback procedure (any step):**
- Steps 1-3: TF destroy, no traffic impact.
- Step 4: re-apply previous `dns/` HEAD — alias flips back within 60s.
- Step 5-8: revert individual TF changes.
- **The destructive step is Step 6** — once the old SST stack is destroyed, rollback requires `sst deploy --stage phase0-dev` again (5-10 min) before alias re-flip. **Recommendation:** leave old stack live for **2 weeks post-cutover** as cheap insurance (~$1-2/mo for an idle CloudFront).

---

## Section 6: OpenAPI cross-repo codegen pipeline

**Current state (May 2026):**
- Source of truth: `#[utoipa::path(...)]` annotations on Rust handlers in `quilty-aws/lambdas/rust/crates/{auth-public,auth-user,auth-admin}/src/routes/**/*.rs`.
- Emitter: `quilty-aws/lambdas/rust/crates/quilty-openapi-emitter` walks annotations, produces OpenAPI 3.1 YAML.
- CI: `quilty-aws/.github/workflows/ci-openapi.yml` runs `cargo run -p quilty-openapi-emitter --release --features with-handlers -- --output ../../docs/auth/auth_v2_openapi.utoipa.yaml` on every PR + main push; runs Spectral lint and oasdiff breaking-change detection.
- Canonical artifact: `quilty-aws/docs/auth/auth_v2_openapi.yaml` (Python-generated from routes via `tools/generate-openapi-from-routes.py` — covers all 48 routes across 3 Lambdaliths; the utoipa parallel emit currently covers only 11 endpoints in `auth-public`).
- TS codegen: **does not exist.** No published `@quilty/api-types` package. No GH Actions workflow that pushes types to `quilty-website` or to GitHub Packages.

**Plan from Rust source → TS types in website:**

| Stage | Deliverable | Where | Trigger |
|---|---|---|---|
| 1 | **Single canonical spec.** Drop the Python `generate-openapi-from-routes.py` parallel artifact; complete the utoipa annotation coverage on `auth-user` + `auth-admin` (separate from this work — auth-team task). Canonical spec becomes `docs/auth/auth_v2_openapi.yaml` written ONLY by the utoipa emitter. | quilty-aws | Pre-M5 (account portal needs typed `/v1/account/*` endpoints) |
| 2 | **`@quilty/shared-types` npm package** generated from `docs/auth/auth_v2_openapi.yaml` via `openapi-typescript` (the de-facto 2026 choice — see context7 for the latest version pin). Output: `dist/index.d.ts` with one `paths` type + one `components` type. Publish to GitHub Packages (private) on every quilty-aws `main` push that touches `docs/auth/auth_v2_openapi.yaml`. | quilty-aws (new GH Actions workflow `.github/workflows/publish-shared-types.yml`) | M5 (account portal v0 static) — before website needs the types live |
| 3 | **Consume in quilty-website.** `packages/shared-types/package.json` (already scaffolded EMPTY per D4) becomes a re-export of `@quilty/api-types` with a pinned semver. `apps/web/lib/api/client.ts` uses `openapi-fetch` (TS client matching `openapi-typescript`) for type-safe BFF→backend calls. | quilty-website | M5+ |
| 4 | **Drift detection.** Renovate watches `@quilty/api-types` published version; auto-bumps + opens PR in quilty-website. CI fails if `tsc` errors against the new types. | both repos | Continuous post-M5 |

**Alternative considered + rejected:** git submodule of `docs/auth/auth_v2_openapi.yaml` into `quilty-website`. **Universally regretted pattern** (CLAUDE.md NEVER list explicitly says "no git submodules"). The npm-publish path is canonical.

**Versioning rule:** `@quilty/api-types` semver matches the OpenAPI `info.version` field. Breaking changes (oasdiff detects, gates CI) → major bump → website pins major version + dependabot opens an upgrade PR with breaking-change comment.

---

## Section 7: SES email integration

**Current SES state at quilty-aws (`email/` layer):**
- 3 verified identities: `my-quilty.com` (transactional), `notifications.my-quilty.com`, `marketing.my-quilty.com`. All DKIM-signed (3 CNAMEs each, propagated via `dns/records_com.tf`).
- 4 configuration sets: `transactional` / `notifications` / `marketing` / `admin`. TLS REQUIRED on all. Open/click tracking ONLY on marketing.
- DLQ + `email-processor` Lambda + Firehose → log-archive S3 (Object Lock 7-year) for audit.
- Bounce + complaint SNS topics with email subscriptions to `aws-alerts@my-quilty.app`.
- KMS CMK per service per Quilty convention.
- `ses_send_policy_arn` output — IAM policy granting `ses:SendEmail/SendRawEmail` on all 3 identities. **Attachable to any Lambda role.**
- Cognito user pool email config (`auth/main.tf:407-413`): uses SES DEVELOPER mode with `source_arn = my-quilty.com`, `from_email_address = Quilty <verify@my-quilty.com>`, `configuration_set = transactional`. **Cognito-driven emails (verification, password reset, MFA challenge codes) already flow through SES.**
- **Sandbox status: UNCONFIRMED from TF.** `var.ses_daily_send_threshold = 180` and comment "Default 180 (90% of 200 sandbox limit). Update when production access is granted." strongly suggests **still in sandbox** as of last apply.

**Plan for the website BFF Lambda:**

| Operation | Path | Notes |
|---|---|---|
| Sign-up confirmation, password reset, MFA code | **Cognito directly → SES (already wired)** | No website code needed. Cognito triggers `custom_email_sender` Lambda which sends via SES. |
| Welcome email after first sign-in | **BFF Lambda → SES `transactional` config set** | Attach `ses_send_policy_arn` to the BFF Lambda role. Send from `support@my-quilty.com` or `noreply@my-quilty.com`. Body PHI-free (welcome blurb + link to /account). |
| Account-change notifications (email changed, password changed, MFA enrolled) | **Backend (Rust) → SES `transactional`** | Already wired in the auth-triggers Lambda for the mobile flow; same handler picks up web-originated changes. No website code needed. |
| Marketing emails (newsletter, product updates) | **External tool integration** | Defer — D-locked: blog/CMS/marketing-comms deferred (see CLAUDE.md NEVER list). When triggered, send via `marketing` configuration set, gated on user `consent_mkt_v2` attribute (already in pool schema). |
| Receipts (Stripe-integrated, M7) | **Stripe → direct delivery** | Stripe sends its own receipts. SES involvement = none. |

**Sandbox blocker resolution:** 
1. **Pre-M5:** open SES production-access request in the console (`Account dashboard` → `Request production access`). Provide: expected daily volume (~10k/day at maturity), bounce-handling plan (the existing `email-processor` Lambda), unsubscribe handling (managed per-list via Cognito `consent_mkt_v2`), use case (transactional account emails for a HIPAA-aligned consumer mental-health service).
2. **Turnaround:** typically 24-48h.
3. **Until granted:** can only send to verified addresses → Cognito user-flow emails (to live users post-confirmation) WILL fail. **Verify the current state in console immediately** — if production access IS granted, no action.

**Verification commands** (read-only, safe to run now):
```bash
aws ses get-account-sending-enabled --profile quilty-prod --region us-east-1
aws ses get-send-quota --profile quilty-prod --region us-east-1
aws sesv2 get-account --profile quilty-prod --region us-east-1
```
If `ProductionAccessEnabled = true` in the third output → no blocker. If `false` → file the request now.

**PHI rule for SES (D31):** email bodies must be PHI-free. Quilty's current emails (verification code, password reset link, account-change notification) are inherently PHI-free. **Rule:** any future marketing/transactional email body must be reviewed against a checklist before merge. Add `docs/email_phi_review_checklist.md` at M8 (legal review milestone).

---

## Synthesis

### TOP-5 items that need user authorization before scaffold

1. **Decide on Back-Channel Logout mitigation (D9 + D11 gap).** Cognito does not support OIDC BCL or `sid` claim. Recommend the ElastiCache Valkey JTI denylist + BFF poll pattern (option (b) above), which reuses existing infra. **Needs an ADR (pre-M6) — but probably worth a quick decision-lock confirmation now since it ripples back into M1 cookie design (signed session cookie carries `origin_jti`, not `sid`)**.

2. **Confirm SES production-access status.** Run the 3 read-only commands above. If still sandbox-limited, file the production-access request **before M5**, not after (lead time ~48h, sometimes 1 week).

3. **Approve the cross-account DNS dance.** Two-step coordinated apply (dev-account SST → prod-account `dns/` for ACM validation + alias) is documented in the strategy doc but not yet exercised. Confirm the manual "engineer copies validation CNAMEs into `dns/records_website.tf` PR" workflow vs an automated `terraform_remote_state` cross-state read. The manual path is simpler and matches the "dormant after one ceremony" framing.

4. **Approve creation of `quilty-aws/website-baseline/` layer in the development account.** This is a meaningful new TF layer (~10 files, new OIDC roles, new IAM policy, new SSM namespace). It's in the dev account so blast radius is bounded, but it's net-new infra and crosses the `quilty-aws` repo trust boundary (new role trusting `quilty-website` repo).

5. **Approve the OpenAPI codegen direction.** Specifically: (a) auth-team commits to completing utoipa annotations on `auth-user` + `auth-admin` pre-M5, (b) we publish `@quilty/api-types` to GitHub Packages (private) rather than git submodule or in-repo copy.

### Open questions for the human

- **Q1 — Cognito web client confidentiality model.** Web BFF is server-side, so the client SHOULD be confidential (has client secret). But this means storing the secret in SSM SecureString + reading at Lambda cold start. Acceptable, but adds a small operational surface. Confirm: confidential client with secret in SSM, OR public client (no secret) relying purely on PKCE? **Recommendation: confidential** (matches IETF BCP for BFF pattern; secret never reaches browser).

- **Q2 — Should `auth.my-quilty.com` flip to custom domain immediately at M1, or wait?** The current `var.enable_custom_domain = false` means Cognito serves at `quilty-prod.auth.us-east-1.amazoncognito.com`. Mobile works fine that way. **Web pretty much requires the custom domain** for `__Host-` cookie hygiene + brand UX. Flipping it adds 15-60 min provisioning at M1. Confirm: flip during M1 cutover (Section 3 step 7), or defer to M6 with site running against the prefix domain in between? **Recommendation: flip at M1** — no good reason to wait, and "auth.my-quilty.com" appearing in screenshots from M3 voice/visual iteration is brand-relevant.

- **Q3 — Phase 0 environment naming.** `website-baseline/` uses `environment = "phase0-development"`? Or just `"development"`? The auth layer uses `prod/dev/staging`. Confirm naming convention before scaffolding the variable validation block.

- **Q4 — Should the website's BFF Lambda role attach `ses_send_policy_arn` at M1, or defer?** No emails sent at M1 (no auth integration yet). Defer to M6 keeps the M1 IAM surface minimal. **Recommendation: defer**.

- **Q5 — Adaptive-auth fingerprinting JS load: in scope for M1?** Cognito Plus's adaptive auth scoring works on IP+UA only without the JS bundle. Loading the bundle improves accuracy but adds a CSP-managed third-party script and a consent-gating decision (per D35). **Recommendation: skip at M1, revisit at M6 with full consent infra**. If skipped, document in ADR — same risk-accept posture as mobile.

- **Q6 — Anything blocking the new `tf-website-{plan,apply}` roles trusting `d1rect0r/quilty-website` repo?** The OIDC trust on existing `tf-development-{plan,apply}` is scoped to `quilty-aws`. Adding new roles trusting a different repo is fine, but worth confirming there's no enterprise policy I'm missing.

---

## Files relevant to follow-up work (absolute paths, for reference)

- `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/dns/records_com.tf` — extend with apex+www alias records at M1
- `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/dns/acm.tf` — pattern for `.com` ACM cert if pre-provisioned in `dns/` instead of SST
- `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/client.tf` — pattern for the new web app client at M6 (mobile + verification-only clients as references)
- `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/dns.tf` — `enable_custom_domain` toggle for `auth.my-quilty.com`
- `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/main.tf` — Cognito pool config (Plus tier, WebAuthn, MFA, password policy already locked)
- `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/ssm.tf` — pattern for new web-related SSM params
- `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/development/oidc.tf` + `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/modules/oidc-layer/main.tf` + `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/modules/oidc-role/` — reusable module for the new website-baseline OIDC roles
- `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/email/identities.tf` + `email/README.md` — SES integration reference
- `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/lambdas/rust/crates/quilty-openapi-emitter/` — OpenAPI emitter source
- `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/.github/workflows/ci-openapi.yml` — extend with `publish-shared-types` workflow at M5
