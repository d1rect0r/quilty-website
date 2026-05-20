# Round 6 Foundation Audit — AWS Cognito Auth Layer Verification

**Date:** 2026-05-19  
**Scope:** Cognito user pool, app clients, Lambda triggers, EventBridge event bus, Rust auth crates, and session storage state  
**Status:** FRESH SNAPSHOT — Auth layer is **actively in progress and materially more advanced than Round 1 recon indicated**

---

## Executive Summary

The Cognito auth stack is **production-shaped and near feature-complete** as of May 19, 2026. The user pool (PLUS tier, threat protection in AUDIT mode) exists with comprehensive schema, Lambda trigger split in active rollout (Q-TOPO-4 gate), and full custom domain infrastructure provisioned (custom domain flip gated on `enable_custom_domain = false`, reverting to prefix domain `quilty-{env}` until website DNS apex record lands).

**Status:** The claim in Round 1 recon that "only mobile + m2m_partner_reserved + verification_only clients" exist is accurate, but **incomplete context**. The web confidential client **does not yet exist** in TF (decision locked U7, milestone M6), but the BFF pattern is architecturally planned and documented end-to-end. The authorizer (Rust Lambda), JWT token shapes, refresh-rotation cascade, and session invalidation (JTI denylist in ElastiCache Valkey) are all **shipping and verified live**.

The auth foundation has consumed **30+ commits over 60 days** (from `ebb52b58` April 16 through `bf29017` May 19), with focus squarely on compliance (W2-E closure sweep), threat protection (RISC webhook receiver), synthetic-user load-test isolation (D-layer), and verification-canary hardening.

---

## Cognito User Pool: Current State

**Resource:** `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/main.tf` (lines 23–503)

### Identity Store Shape

| Attribute               | Value                                                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pool name**           | `quilty-{environment}-user-pool`                            | e.g. `quilty-production-user-pool`                                                                                                                                                                                                                                                                                                                                                                                |
| **Pool ID**             | AWS-managed UUID                                            | Outputted to SSM `/quilty/auth/cognito_pool_id`                                                                                                                                                                                                                                                                                                                                                                   |
| **Tier**                | **PLUS** (line 36)                                          | Enables Plus-exclusive features: Advanced Security ENFORCED/AUDIT toggle, adaptive auth, device context, USER_AUTH flow (WebAuthn passkeys)                                                                                                                                                                                                                                                                       |
| **Username attribute**  | `email` (immutable, case-insensitive)                       | Lines 28–32. Email is THE login principal; case-folding prevents account fragmentation.                                                                                                                                                                                                                                                                                                                           |
| **MFA**                 | **OPTIONAL** + software token only                          | Line 40: `mfa_configuration = "OPTIONAL"`. Software TOTP enabled (line 42–44). SMS MFA **intentionally disabled** — immutable setting; once enabled, cannot be removed (D186 decision, investigation in `docs/auth/D186-D193_INVESTIGATION_REPORT.md`). Email MFA also **off** (account-recovery deadlock gotcha cited in lines 47–50).                                                                           |
| **Password policy**     | 15-char minimum, no composition rules                       | Lines 67–75. **NIST SP 800-63B-4 final (May 2025) compliant** — length-only entropy lever per §A.4.5. Replaces prior 8-char + lower/upper/number baseline (W2-B.1 P1.1, May 8, 2026). History size = 3 (prevent reuse). Temporary password TTL = 7 days. Existing passwords grandfather; policy applies to signup + reset only.                                                                                   |
| **Device tracking**     | **DISABLED** (lines 77–128)                                 | D193 decision (May 13, 2026) removes prior USER_OPT_IN mode. Rationale: RFC 9700 §2.2.2 (OAuth Security BCP) satisfied by **refresh-token rotation + reuse-detection** (already shipped); device-binding adds SDK landmine risk (8+ years unresolved in aws-sdk-cpp/-java/-flutter) with narrow threat gain. Cognito reverts to default (tracking off). Existing refresh tokens become inert; no forced sign-out. |
| **Account recovery**    | Email only (recovery_mechanism priority 1)                  | Lines 132–137. Verified email is the sole recovery path.                                                                                                                                                                                                                                                                                                                                                          |
| **Advanced security**   | `var.threat_protection_enforced` controls ENFORCED vs AUDIT | Lines 161–167. When ENFORCED, Cognito blocks risky sign-ins + mints risk cookies. AUDIT mode logs signals without blocking (current default). `custom_auth_mode` (OAuth challenge scoring) mirrors the pool setting. Per-signin context: IP, user agent, geolocation, ASN reputation.                                                                                                                             |
| **WebAuthn (passkeys)** | **ENABLED, user verification REQUIRED**                     | Lines 171–185. `sign_in_policy.allowed_first_auth_factors = ["PASSWORD", "WEB_AUTHN"]`. Passkey config: `relying_party_id = var.domain_com`, `user_verification = "required"` (biometric/PIN mandatory, NIST AAL2-with-UV phishing-resistant).                                                                                                                                                                    |

### Schema: Standard + Custom Attributes

**Standard attributes (lines 189–211):**

- `email` (required, mutable, 2048-char max)
- `name` (optional, mutable, 2048-char max)

**Custom attributes (lines 215–402):**

| Name                         | Type                 | Mutable                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | -------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `custom:onboarding_complete` | String               | Yes                             | Signup flow marker.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `custom:account_tier`        | String               | Yes                             | Tier tracking (Lite/Plus/Enterprise future).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `custom:external_idp_id`     | String               | Yes                             | Reserved for future SAML/SCIM JIT provisioning (Wave 4 M14, line 235–248). Costs nothing today (nullable).                                                                                                                                                                                                                                                                                                                                                        |
| `custom:consent_tos_v2`      | String (≤2048 chars) | Yes                             | GDPR Art 7(1) + CCPA §1798.135 versioned consent receipt (Wave 4 M10, line 250–282). JSON-encoded: `{version, accepted_at, ip_hash, user_agent_hash}`. Single attribute = single disclosure-accounting receipt; no separate DDB row.                                                                                                                                                                                                                              |
| `custom:consent_mkt_v2`      | String (≤2048 chars) | Yes                             | Marketing-opt-in receipt variant.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `custom:mfa_required_at`     | String (≤16 chars)   | Yes                             | **CRITICAL UNFIXED BUG** (D133, line 295–318): Attribute **declared in schema here but was NEVER added to the live pool until this PR** (per commit message). AdminUpdateUserAttributes was failing InvalidParameterException before. Schema defines epoch-seconds deadline (i64 decimal string). PreTokenGen V2 reads + stamps as JSON Number into access token. Authorizer Tier-3 gate rejects tokens with `iat <= deadline`. Now unblocked by schema addition. |
| `custom:passkey_required_at` | String (≤16 chars)   | Yes                             | Backup-code-recovery counterpart to mfa_required_at (W2-B.2 D11, line 320–337). Tracks forced passkey re-enrollment deadline after backup-code consumption.                                                                                                                                                                                                                                                                                                       |
| `custom:synthetic`           | String (≤5 chars)    | **NO** (immutable after create) | Pillar-1 load-test discriminator (ADR-0045 amended). Set to "true" by seed script; API GW authorizer rejects any token carrying `custom:synthetic == "true"` on non-load-test routes. CloudWatch metric dimension `synthetic` filters MAU/ATO/fraud pipelines. Immutability = hard-locked discriminator.                                                                                                                                                          |
| `custom:synthetic_run`       | String (≤32 chars)   | **NO** (immutable after create) | Run-cohort timestamp (UTC ISO-8601, seconds or ms precision). Enables batch cleanup + per-run metrics. Headroom for future precision/suffix variants.                                                                                                                                                                                                                                                                                                             |

### Lambda Triggers

**Architecture:** Q-TOPO-4 split (lines 415–429) with conditional routing:

| Trigger                            | Monolith (default)          | Split target (when `q_topo_4_split_enabled = true`)             | Split crate                        | Current state                                  |
| ---------------------------------- | --------------------------- | --------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------- |
| **pre_sign_up**                    | `module.auth_triggers`      | `module.cognito_trig_pre_signup.live_alias_arn`                 | `cognito-trig-pre-signup`          | Split available; rollout gated                 |
| **post_confirmation**              | `module.auth_triggers`      | `module.cognito_trig_post_confirm.live_alias_arn`               | `cognito-trig-post-confirm`        | Split available; rollout gated                 |
| **pre_authentication**             | `module.auth_triggers`      | Folds into pre_sign_up                                          | (shared)                           | Low-traffic fold; no separate split            |
| **post_authentication**            | `module.auth_triggers`      | `module.cognito_trig_post_auth.live_alias_arn`                  | `cognito-trig-post-auth`           | Split available; rollout gated                 |
| **define_auth_challenge**          | `module.auth_triggers`      | (stays monolith)                                                | (monolith)                         | OAuth challenge logic shared; no split planned |
| **create_auth_challenge**          | `module.auth_triggers`      | (stays monolith)                                                | (monolith)                         | OAuth challenge logic shared; no split planned |
| **verify_auth_challenge_response** | `module.auth_triggers`      | (stays monolith)                                                | (monolith)                         | OAuth challenge logic shared; no split planned |
| **pre_token_generation_config**    | `module.auth_triggers` (V1) | `module.cognito_trig_pretoken_gen_v2.live_alias_arn` (V2_0)     | `cognito-trig-pretoken-gen-v2`     | Split available; rollout gated                 |
| **custom_email_sender**            | `module.auth_triggers` (V1) | `module.cognito_trig_custom_email_sender.live_alias_arn` (V1_0) | `cognito-trig-custom-email-sender` | Split available; rollout gated                 |

**KMS key:** Email Lambda trigger encryption key specified at line 431 (`aws_kms_key.cognito_email.arn`).

**Rollback:** Flip `q_topo_4_split_enabled` back to `false` + `terraform apply` (~<2 min). Runbook: `docs/runbooks/q_topo_4_split_cutover.md`.

### Email Configuration

| Setting                       | Value                                                        | Notes                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Email sending account**     | DEVELOPER (SES)                                              | Lines 407–413. Uses customer-managed SES identity (not Cognito sandbox).                                                                  |
| **Source ARN**                | `arn:aws:ses:${region}:${account_id}:identity/${domain_com}` | e.g. `arn:aws:ses:us-east-1:123456789012:identity/my-quilty.com`                                                                          |
| **From address**              | `Quilty <verify@${domain_com}>`                              | Sender name = "Quilty"; email = verify@my-quilty.com                                                                                      |
| **Reply-to**                  | `support@${domain_com}`                                      | Support contact                                                                                                                           |
| **Configuration set**         | `quilty-${env}-transactional`                                | SES ConfigSet for Firehose bounce/complaint tracking. Data source fetches live ConfigSet (line 17–19).                                    |
| **Verification message**      | Code-based, 6-digit                                          | Lines 149–153: `CONFIRM_WITH_CODE`, subject "Verify your Quilty account", body "Your Quilty verification code is {####}".                 |
| **Email update verification** | Required before attribute change                             | Lines 155–157: `attributes_require_verification_before_update = ["email"]`. User must verify new email before Cognito applies the change. |

### Lifecycle & Protection

- **Deletion protection:** ACTIVE (line 473)
- **prevent_destroy:** true (line 476)
- **ignore_changes = [schema]:** Yes (line 497) — schema mutations are operator-managed out-of-band via AWS CLI + runbook. Terraform won't reconcile schema block (provider issues #21654/#37687/#38096/#38224 re: empty constraint round-trip). New attributes require manual AdminUpdateUserAttributes → terraform refresh sync.

---

## App Clients Inventory

### 1. Mobile Client (`quilty-mobile`)

**Resource:** `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/client.tf` lines 10–113

| Setting                                    | Value                                                                                  | Notes                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Client type**                            | Public (no secret)                                                                     | `generate_secret = false`                                                                                                                                                                                                                                                      |
| **Auth flows**                             | `ALLOW_USER_SRP_AUTH`, `ALLOW_CUSTOM_AUTH`, `ALLOW_USER_AUTH`                          | Email/password via Secure Remote Password (SRP); OAuth via Custom Auth Challenge (Google/Apple); future passkeys via USER_AUTH. `ALLOW_REFRESH_TOKEN_AUTH` **intentionally omitted** — incompatible with rotation. GetTokensFromRefreshToken API used instead.                 |
| **Access token TTL**                       | **5 minutes** (Cognito minimum)                                                        | Line 53. W2-B.1 P1.7 (May 9, 2026) set target = 60s per Clerk pattern, but Cognito hard floors at 5 min. Token natural-expiry fallback; canonical revocation via **Valkey JTI denylist** (ElastiCache, <200ms latency).                                                        |
| **ID token TTL**                           | **5 minutes**                                                                          | Line 54. Mirrors access token.                                                                                                                                                                                                                                                 |
| **Refresh token TTL**                      | **30 days sliding**                                                                    | Lines 55, 57–61. RFC 9700 §4.14 family rotation (Wave 1 H-SESSION-001).                                                                                                                                                                                                        |
| **Refresh token rotation**                 | **ENABLED**                                                                            | Lines 65–68. `retry_grace_period_seconds = 10`. Reuse-detection cascade (D171) blocks stolen-token attacks.                                                                                                                                                                    |
| **Custom auth session timeout**            | 5 minutes                                                                              | Line 72. OAuth token validation completes in seconds; 5-min is ample.                                                                                                                                                                                                          |
| **Prevent user existence errors**          | ENABLED                                                                                | Line 76. Blocks brute-force enumeration.                                                                                                                                                                                                                                       |
| **Enable token revocation**                | true                                                                                   | Line 77.                                                                                                                                                                                                                                                                       |
| **Propagate additional user context data** | **false**                                                                              | Lines 88–92. Mobile is a public client (`generate_secret = false`); Cognito rejects the flag when `generate_secret = false` (InvalidParameterException: "Client Secret is required"). Fallback = IP-only adaptive scoring (accepted risk for consumer UX per hybrid doc F-D9). |
| **Read attributes**                        | `email`, `email_verified`, `name`, `custom:onboarding_complete`, `custom:account_tier` | Lines 96–102                                                                                                                                                                                                                                                                   |
| **Write attributes**                       | `email`, `name`, `custom:onboarding_complete`                                          | Lines 104–108                                                                                                                                                                                                                                                                  |
| **OAuth config**                           | None (intentionally omitted)                                                           | Lines 110–112. Custom Auth Challenge is API-based, not OAuth-redirect. Managed Login / hosted UI not used.                                                                                                                                                                     |

### 2. M2M Partner Client (`quilty-m2m-partner-reserved`)

**Resource:** `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/client.tf` lines 129–175

**Status:** Reserved slot; **currently inactive** (no partners enrolled, no scopes defined).

| Setting                     | Value                                 | Notes                                                                                                                                            |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Client type**             | Confidential (has secret)             | `generate_secret = true`                                                                                                                         |
| **Auth flows**              | `client_credentials` only             | OAuth 2.0 machine-to-machine. Partner presents `client_id` + `client_secret` to `/oauth2/token`.                                                 |
| **Token TTLs**              | Access/ID = 1 hour; refresh = 30 days | Lines 135–143                                                                                                                                    |
| **Scopes**                  | Empty array (reserved)                | Line 157. Once first partner enrolls + BAA scope defined, flip `allowed_oauth_flows_user_pool_client = true` + add scopes. Safe in-place update. |
| **Callbacks / logout URLs** | Empty                                 | Line 160–161. M2M only; no interactive user flows.                                                                                               |
| **Read/write attributes**   | Empty                                 | Lines 166–167. No PHI claims issued to B2B partners; only BAA-granted subset.                                                                    |
| **Lifecycle guard**         | `prevent_destroy = true`              | Lines 172–174. Operator removes explicitly when last partner integration winds down.                                                             |

### 3. Verification-Only Client (`verification-only-DELETE-WHEN-DEV-EXISTS`)

**Resource:** `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/client.tf` lines 210–313

**Status:** Dev-phase temporary; tagged `quilty:cleanup_when=dev_account_exists`. **Will be deleted** when the dev AWS account is stood up.

| Setting                    | Value                                                                                                                                   | Notes                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client type**            | Confidential                                                                                                                            | `generate_secret = true`                                                                                                                                                                                    |
| **Auth flows**             | `ALLOW_ADMIN_USER_PASSWORD_AUTH`, `ALLOW_USER_AUTH`                                                                                     | Admin password auth for synth users (Newman/k6 can mint refresh tokens without SRP). USER_AUTH for WebAuthn flows (e.g., `/v1/auth/passkeys/challenge`). `ALLOW_REFRESH_TOKEN_AUTH` **omitted** (rotation). |
| **Token TTLs**             | Access/ID = 5 min; refresh = 30 days                                                                                                    | Lines 239–247. Mirrors mobile to exercise production token shapes.                                                                                                                                          |
| **Refresh rotation**       | ENABLED                                                                                                                                 | Lines 251–254. Matches mobile.                                                                                                                                                                              |
| **Propagate user context** | **true**                                                                                                                                | Line 266. Backend-only client; deliberately enabled so adaptive auth scoring runs the **same code path** mobile would (albeit mobile can't enable it).                                                      |
| **Read attributes**        | `email`, `email_verified`, `custom:account_tier`                                                                                        | Lines 270–274. Minimal (no PHI).                                                                                                                                                                            |
| **Write attributes**       | `email` only                                                                                                                            | Lines 276–278                                                                                                                                                                                               |
| **SSM outputs**            | `/quilty/{env}/verification/cognito_client_id` (String), `/quilty/{env}/verification/cognito_client_secret` (SecureString, aws/ssm KMS) | Lines 281–312. Never referenced from mobile builds; operator-only.                                                                                                                                          |

### Summary: Web Confidential Client Status

**Does it exist in TF?** NO (as of May 19, 2026).

**Planned (decision U7, milestone M6):**

- New `aws_cognito_user_pool_client.web` resource (confidential, has secret)
- OAuth flows: `allowed_oauth_flows = ["code"]`
- PKCE required (Cognito S256 only, per spec section 09-cross-repo-coordination)
- Callback URLs: `["https://my-quilty.com/api/auth/callback"]`
- Logout URLs: `["https://my-quilty.com/api/auth/logout/return"]`
- Scopes: `["openid", "email", "profile"]`
- Supported identity providers: `["COGNITO", "Google", "SignInWithApple"]`
- Refresh rotation: ENABLED
- `enable_propagate_additional_user_context_data = true` (BFF can enable; gets richer adaptive-auth context)
- New SSM parameters: `/quilty/{env}/auth/cognito_web_client_id`, `/quilty/{env}/auth/cognito_web_audience`

**Blocker to M6 activation:** `enable_custom_domain = true` flip at M1 (depends on website apex DNS record). Per `docs/website_workflow_roadmap.md`, custom domain activation is M1 milestone delivery; web client addition is M6.

---

## Custom Domain State: `auth.my-quilty.com`

**Resource:** `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/dns.tf` (lines 73–87)

| Setting                            | Value                                               | Current                                                    | Notes                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Custom domain flag**             | `var.enable_custom_domain`                          | **false** (default)                                        | Lines 174–179 in variables.tf.                                                                                                                                                                  |
| **ACM certificate**                | `aws_acm_certificate.auth_domain`                   | **PROVISIONED**                                            | Lines 20–40. Domain = `auth.{domain_com}`, validation method = DNS, key algorithm = `EC_prime256v1` (lines 21–26). Exists but unused until custom domain is enabled.                            |
| **Certificate validation**         | Via Route 53 CNAME                                  | **PENDING**                                                | Lines 44–64. Route 53 records created for DNS validation; awaiting custom domain enable to complete.                                                                                            |
| **Cognito custom domain resource** | `aws_cognito_user_pool_domain.custom`               | **CONDITIONAL** (count = var.enable_custom_domain ? 1 : 0) | Lines 73–79. When disabled, resource does NOT exist.                                                                                                                                            |
| **Prefix domain**                  | `quilty-{environment}` (e.g., `quilty-production`)  | **ALWAYS CREATED**                                         | Lines 82–87. Fallback used until custom domain is enabled. Route 53 alias to Cognito CloudFront **also conditional** (lines 91–103).                                                            |
| **Prerequisite**                   | Parent domain (my-quilty.com) must have an A record | NOT YET                                                    | Comment lines 67–71: "Cognito requires the parent domain of a custom subdomain to resolve." Custom domain won't create until my-quilty.com apex has an A record (CloudFront alias for website). |

**Lifecycle:**

1. **Status today:** Using prefix domain `quilty-{env}.auth.us-east-1.amazoncognito.com` (sufficient for IdP registration; IdPs don't require custom domain).
2. **M1 trigger:** Website CloudFront deployed, my-quilty.com apex A record added.
3. **M1 action:** Set `enable_custom_domain = true`, `terraform apply` → custom domain + Route 53 alias created.
4. **Result:** Users see `auth.my-quilty.com` in Cognito Managed Login / hosted UI (if ever used). For BFF Cognito flow, callback URLs register as `https://my-quilty.com/api/auth/callback` (or `auth.my-quilty.com/oauth2/idpresponse` as IdP callback).

---

## Managed Login vs Hosted UI

**Current state:** Neither actively configured in auth layer.

| Feature                  | Status                  | Notes                                                                                                                                                                                          |
| ------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosted UI**            | Not wired               | No `oauth_scopes`, `callback_urls`, `supported_identity_providers` on mobile client (intentionally omitted, lines 110–112). Mobile uses Custom Auth Challenge (API-based), not OAuth redirect. |
| **Managed Login**        | Conditionally available | Once web app client added (M6) with proper scopes + identity providers + callback URLs, Cognito Managed Login becomes available at `/oauth2/authorize` endpoint. **Not yet configured**.       |
| **Branding editor**      | Not mentioned in TF     | Cognito Managed Login theming would be applied via console or separate TF when wired.                                                                                                          |
| **Per-stage variations** | Not implemented         | All environments (dev, staging, prod) use the same pool + config. Per-stage Managed Login branding (e.g., "DEV" watermark) not implemented but possible via AppConfig.                         |

---

## Rust Auth Crates: Inventory & Maturity

**Directory:** `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/lambdas/rust/crates/`

### By Function Category

#### **User-Facing Auth Flows (Critical, active development)**

| Crate           | Purpose                                                                                                                                                              | Status     | Notes                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **auth-user**   | Core user signin/signup/account Lambdalith (API routes `/v1/auth/*`)                                                                                                 | **ACTIVE** | Critical path. Houses password reset, MFA management, session endpoints. W2-B.1 through W2-E closures.                                   |
| **auth-public** | Unauthenticated routes Lambdalith (`/v1/auth/signup`, `/v1/auth/signin`, `/v1/auth/password-reset`, `/.well-known/openid-configuration`, `/oauth2/jwks`, `/healthz`) | **ACTIVE** | Every signin traverses this. W2-E closure included 12+ deferred fixes.                                                                   |
| **auth-admin**  | Operator routes Lambdalith (`/v1/account/revoke-sessions`, `/v1/account/suspend`, `/v1/account/unsuspend`, `/v1/account/mfa-force`, `/v1/account/config-refresh`)    | **ACTIVE** | High criticality (ops tooling). W2.9 consolidated 4 standalone Lambdas into Lambdalith. Reserved concurrency = 5 (bounded blast radius). |

#### **Cognito Lambda Triggers (Critical, phased rollout)**

| Crate                                | Trigger                                       | Status              | Notes                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **cognito-trig-pre-signup**          | `pre_sign_up` + `pre_authentication` (folded) | **SPLIT AVAILABLE** | Q-TOPO-4 split. Low-traffic (pre-auth folds into pre-signup). Candidate for activation once W2-E closure completes.                                      |
| **cognito-trig-post-confirm**        | `post_confirmation`                           | **SPLIT AVAILABLE** | Email-confirmed user transitions. Split available.                                                                                                       |
| **cognito-trig-post-auth**           | `post_authentication`                         | **SPLIT AVAILABLE** | Signin audit emission. Split available.                                                                                                                  |
| **cognito-trig-pretoken-gen-v2**     | `pre_token_generation_config` (V2 spec)       | **SPLIT AVAILABLE** | Mints claims into access token (e.g., `mfa_required_at`, `passkey_required_at`, step-up deadline). V2 is required for AWS Event source feature (not V1). |
| **cognito-trig-custom-email-sender** | `custom_email_sender`                         | **SPLIT AVAILABLE** | Email verification codes, password reset emails. Cognito calls this instead of using built-in SES.                                                       |
| **auth-triggers**                    | All triggers (monolithic)                     | **STABLE**          | Current default routing (when `q_topo_4_split_enabled = false`). Contains all trigger logic; gradual split planned.                                      |

#### **OAuth + RISC (High criticality)**

| Crate               | Purpose                                                              | Status     | Notes                                                                                              |
| ------------------- | -------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| **oauth-bootstrap** | Pre-token-generation for OAuth flows (Google/Apple custom challenge) | **ACTIVE** | W2-C closure integrated 7 deferred items. SQS DLQ, audit emit. Failure blocks Google/Apple signin. |

#### **Authorization & Session (Critical path)**

| Crate           | Purpose                                                                                            | Status     | Notes                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **authorizer**  | API Gateway Lambda authorizer (JWT validation, JTI denylist lookup in Valkey, Tier-3 step-up gate) | **ACTIVE** | Rust rewrite completed (2026-04-13). Switched from TS. Validates every API request. Cache key includes method + path (V2-2 fix). |
| **auth-health** | Liveness probe (`/healthz` endpoint)                                                               | **STABLE** | Simple, passive.                                                                                                                 |

#### **Domain Core (Active development)**

| Crate                  | Purpose                                                    | Status     | Notes                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **quilty-auth-domain** | Auth/OAuth/SES/schema/middleware aggregating crate (0.1.0) | **ACTIVE** | Extracted from quilty-shared per 6-crate split (Wave 5 A1 PR6). Owns: auth/, oauth/, email/, schema/, classification, handler_init, middleware. Depends on ALL 5 foundation crates (quilty-core, -persistence, -observability, -resilience, -audit). Aggregating leaf; quilty-shared deleted post-PR6. |
| **quilty-auth-http**   | Transport primitives (RFC 9457 error response builder).    | **STABLE** | Thin: quilty-core + lambda_http only. Zero-cycle dependency. Used by quilty-auth-domain.                                                                                                                                                                                                               |

#### **Sync & Reconciliation (Critical, compliance)**

| Crate                       | Purpose                                                             | Status     | Notes                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **cognito-sync-reconciler** | Event-driven reconciler (Cognito user mutations ↔ quilty_users DDB) | **ACTIVE** | W2-E closure swept 12 deferred items. Transactional-outbox pattern (EVENT detail-type = `quilty.auth.event_type`). Failure = silent state corruption (W-022 can't fix unseen events). Critical. |

#### **Deployment & Health (Standard)**

| Crate                 | Purpose                                                     | Status     | Notes                                                   |
| --------------------- | ----------------------------------------------------------- | ---------- | ------------------------------------------------------- |
| **auth-deploy-hooks** | CodeDeploy lifecycle hooks (pre/post-deployment validation) | **STABLE** | Automated health checks during deployments.             |
| **auth-discovery**    | Service discovery helper (cross-layer SSM registry lookups) | **STABLE** | Reads SSM params for pool ID, client ID, JWKS URI, etc. |

### Crate Dependency Graph (Simplified)

```
quilty-core, quilty-persistence, quilty-observability, quilty-resilience, quilty-audit (foundation)
    ↓
quilty-auth-domain (aggregating — owns auth/, oauth/, email/, schema/, middleware)
    ↓
auth-user, auth-admin, auth-public (Lambdalith user flows)
auth-triggers (monolithic trigger Lambda, legacy)
cognito-trig-* (split trigger Lambdas, phased rollout)
oauth-bootstrap (OAuth pre-token custom challenge)
authorizer (API GW JWT validator)
cognito-sync-reconciler (event-driven DDB sync)

quilty-auth-http (transport primitives, zero-cycle, used by quilty-auth-domain)
```

### Build Status & Recent Commits

**Last 30 commits (auth + auth-crate targets):**

From `bf29017` (May 19, feat W2-E closure sweep) back to `ebb52b58` (Apr 16):

- **W2-E Compliance Closure:** 2 mega-commits (bf29017, 8bdba26) closing 16 P1/P2 QA findings + verification gates
- **W2-C Compliance Closure:** 3 commits (ca419de, 921bce1, 5436e1f) closing all W2-C deferred items + cache wiring
- **Verification canary:** 6 commits (30fc812–2bbdafb) wiring diagnostic-endpoint, KMS decrypt, XRay, S3 scopes
- **Chaos/load-test infrastructure (D-layer):** 4 commits (a771c97–ef7201d) SCP defense-in-depth, k6 harness, FIS chaos
- **Observability & alarms:** 2 commits (8309d6e, d7c9a47) D.9 alarm tuning, AMP workspace tear-down
- **API Gateway phase-out:** 1 commit (890b7a7) W2-B.3 Phase G TF wiring (AppConfig, CloudFront, IAM)

**Velocity:** ~3–4 commits per week, heavy on compliance + observability. No breaking changes; phased rollouts (Q-TOPO-4 flag pattern). Build passing (cargo-mutants gate + clippy strict).

---

## EventBridge Auth Event Bus

**Resources:**

- Event bus registry: `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/event_schemas.tf`
- Outbox pipeline: `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/outbox.tf`

### Event Bus & Schema Registry

| Setting                    | Value                                                    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Event bus name**         | `quilty-{environment}-auth-events` (custom, not default) | Lines 23–31 in event_schemas.tf. Dedicated custom registry so schemas sit alongside (not intermixed with) AWS-managed schemas.                                                                                                                                                                                                                                                                                                                                                     |
| **Schema registry**        | `quilty-{env}-auth-events`                               | Lines 39–40. Type = JSONSchemaDraft4.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Shared envelope schema** | `quilty.auth.Envelope`                                   | Lines 39–106+. Common fields: `schema_version` (int ≥1), `event_id` (UUIDv7), `event_type` (snake_case per docs/auth/EVENT_TAXONOMY.md), `caep_uri` (RISC URI), `created_at` (RFC 3339), `created_at_epoch` (epoch seconds), `classification` (enum: public/internal/confidential/restricted/phi), `event_hash` (SHA-256 hex), `prev_event_hash` (null, reserved for future chained-hash upgrade), `trace_id`, `x_trace_id`, `actor_sub`, `actor_sub_hmac` (survives hard-delete). |

### Event Schema Classifications

| Value          | Used for                                                | Notes                                                                          |
| -------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `public`       | Generic events (e.g., account creation successful)      | No PHI/PII. Safe to log.                                                       |
| `internal`     | Operational events (e.g., admin suspension)             | Internal audit only; not published to external subscribers.                    |
| `confidential` | PII/metadata events (e.g., email changed, MFA enrolled) | Per NIST SP 800-122 PII tiering. CMK-encrypted log storage.                    |
| `restricted`   | Risk events (e.g., account takeover detected)           | Highly sensitive; scoped subscriber access.                                    |
| `phi`          | Protected health info (future; reserved)                | HIPAA §164.412 subject to 6-year disclosure accounting (`auth_audit_log` DDB). |

### Producers & Consumers

**Producers:**

- `auth-user` Lambda (session revocation, MFA changes, account deletions)
- `auth-admin` Lambda (admin suspension, unsuspension, force MFA)
- `cognito-trig-post-auth` Lambda (signin audit)
- `cognito-sync-reconciler` (Cognito pool mutations → outbox events)
- OAuth custom-auth challenge handlers (signin via Google/Apple)

**Consumers (current):**

- EventBridge Pipe → quilty_outbox DDB (transactional-outbox at-least-once delivery)
- DLQ alarm (auth-outbox-pipeline criticality)
- Future: SIEM subscriber, RISC webhook consumer, partner BA tooling

### Transactional Outbox Pipeline

**Resource:** `outbox.tf` (lines 102–594)

| Layer                | Resource                                                           | Purpose                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DDB table**        | `aws_dynamodb_table.quilty_outbox`                                 | PK = `event_id` (UUIDv7, sortable), SK = `created_at` (epoch seconds range query). GSI for status filtering (PENDING → PUBLISHED → ARCHIVED). TTL = 90 days (auto-delete after publishing + retention window). DynamoDB Streams enabled (NEW_AND_OLD_IMAGES). |
| **Stream source**    | DDB Streams (NEW_AND_OLD_IMAGES)                                   | Captures every outbox event mutation.                                                                                                                                                                                                                         |
| **EventBridge Pipe** | Source = DDB stream, target = `quilty-{env}-auth-events` event bus | Transforms stream record → EventBridge PutEvents call. Retry policy, DLQ on failure.                                                                                                                                                                          |
| **DLQ**              | SQS queue                                                          | Captures events that exceed max retries. Alarm on messages arriving.                                                                                                                                                                                          |

**Pattern:** Every state-mutating handler PutItem to quilty_outbox (status=PENDING), then EventBridge Pipe reads stream, publishes to event bus, updates status to PUBLISHED. Reconciler consumes from event bus. If Pipe fails, DLQ alarm triggers; operator replays. If Cognito pool state drifts, reconciler can re-emit events from quilty_outbox.

---

## Session Storage Strategy

### Current State: DynamoDB + Valkey Cache

**No separate "session table" exists.** Session state lives in three layers:

| Layer                    | Resource                               | Purpose                                                                                          | TTL                                                                                                   |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Cognito tokens**       | JWT (access + ID + refresh)            | Primary session contract. Signed by Cognito.                                                     | Access/ID = 5 min; refresh = 30 days (rotating)                                                       |
| **Valkey (ElastiCache)** | `quilty_cache_valkey` cluster          | **JTI denylist** for revoked tokens; also used for lock primitives, cache-to-disk session replay | Denylist entries = 5 min (match access token TTL) + 60-day grace (revoked tokens with future expiry). |
| **DDB user state**       | `quilty_users` table (main data layer) | User attributes, last-seen timestamp, account status (active/suspended), MFA factors             | Indefinite (per-user lifecycle, not session)                                                          |

### Why No Separate Session Table?

Per `docs/research/auth_session_architecture.md` (and Round 5 U8 decision):

1. **BFF pattern (Next.js Route Handlers)** manages session cookies server-side (HTTP-only, secure, SameSite=Strict).
2. **Cognito tokens** are the session contract (JWT); Cognito is the IdP.
3. **Session invalidation** is **revocation** (JTI denylist in Valkey); no session rows to delete.
4. **Idle timeout** enforcement is deferred (D101 — requires refresh-handler enhancement to read SESSION.last_seen, enforce 15-min inactivity gate).

### Refresh Token Rotation Cascade (RFC 9700 §4.14)

**Implemented:** Wave 1 H-SESSION-001. Mobile client has `refresh_token_rotation = ENABLED`.

**Mechanics:**

1. Client calls `GetTokensFromRefreshToken` with old `refresh_token`.
2. Cognito issues new access/ID/refresh tokens.
3. Old refresh token is revoked (single-family lineage; reuse of prior token is breach detection).
4. Reuse-detection cascade (D171): If client reuses an old token (e.g., attacker replayed a captured token), both the legitimate client's and attacker's future token exchanges fail. Operator is alerted (attempted reuse = ATO signal).

**Valkey denylist storage:** JTI (JWT ID claim) of revoked tokens stored for 5 min (access token TTL) + 60-day grace.

---

## API Gateway Auth Integration

**Resource:** `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/app-sync/authorizer.tf` (lines 10–70)

### Lambda Authorizer Configuration

| Setting       | Value                                                  | Notes                                                                                                                                    |
| ------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**      | REQUEST (not TOKEN)                                    | Lines 10–24. REQUEST type receives full HTTP request; more context for decision.                                                         |
| **Function**  | Rust Lambda `authorizer`                               | Lines 22–24. Switched from TS (2026-04-13). Alias = `:live` (CodeDeploy managed; rollback via `aws lambda update-alias`).                |
| **Cache TTL** | `var.authorizer_cache_ttl_seconds`                     | Default 300 (5 min).                                                                                                                     |
| **Cache key** | `Authorization` header + `httpMethod` + `resourcePath` | Lines 30. V2-2 fix: method + path prevent cache bypass (prior: header-only cache could reuse auth decision for POST /push on GET /pull). |

### Authorizer Logic (Rust crate)

**Not detailed in TF, but per crate docs:**

1. **JWT validation:** Verify signature against Cognito JWKS, validate `aud` (audience = mobile client ID from SSM), `exp` (not expired).
2. **JTI denylist lookup:** Check if JTI is in Valkey denylist (revoked tokens).
3. **Tier-3 step-up gate:** Reject tokens with `iat <= mfa_required_at` or `iat <= passkey_required_at` claims (force re-authentication for force-MFA/force-passkey-re-enroll scenarios).
4. **Custom claims extraction:** Stamp `actor_sub`, `aal` (assurance level), `custom:synthetic` (load-test discriminator), etc. into authorizer context.
5. **Return:** `Allow` or `Deny` + context claims (passed to Lambda handler).

### IAM for API Gateway → Authorizer

**Resource:** lines 35–69. API Gateway service role with permission to invoke the authorizer Lambda.

| Setting               | Value                                         | Notes                                                                                                                                                                                    |
| --------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Role ARN**          | `aws_iam_role.apigw_authorizer_invoke`        | Lines 35–48. AssumeRole for `apigateway.amazonaws.com` service.                                                                                                                          |
| **Invoke permission** | `lambda:InvokeFunction` on `:live` alias only | Lines 60–68. **Scoped to alias ARN**, not function ARN wildcard. Tightened 2026-04-10 (Phase 2 security audit). If canary alias added later, extend list rather than revert to wildcard. |

---

## Migration State vs Supabase

### Current Posture

**Per `README.md`:** "The ongoing **Supabase + PowerSync → AWS-native** migration is actively discussed in the main Quilty repository."

**In quilty-aws codebase:**

1. **No active Supabase shutdown workflow** — No TF resources for Supabase teardown, no data migration scripts in this repo.
2. **Auth layer is AWS-native** — Cognito + custom triggers (no Supabase Auth calls).
3. **Data layer is AWS-native** — DynamoDB single-table (no Supabase PostreSQL calls).
4. **Historical context** — `w2c_c2c_handler_design_2026-05-17.md` (research doc) mentions Supabase for **comparative purposes** (Supabase `auth.getUser()`, `auth.mfa.listFactors()` patterns vs Quilty design). Not an active integration; just reference material.

### Migration Status

**Supabase is NOT part of the live Quilty-AWS architecture.** If Supabase was used in an earlier phase, that migration is:

- **Outside this codebase** (likely in the main quilty repo or historical branches)
- **Not documented in quilty-aws/docs/**
- **Decoupled** — Cognito auth layer is the **new** implementation; if Supabase remains deployed elsewhere, it is **legacy**.

---

## Migration Velocity (Last 30 Days)

**Commit range:** `ebb52b58` (Apr 16) → `bf29017` (May 19) = ~30 commits over 33 days

### Breakdown

| Theme                               | Commits | Effort                | Examples                                                                        |
| ----------------------------------- | ------- | --------------------- | ------------------------------------------------------------------------------- |
| **W2-E Compliance Closure**         | 2       | Epic sweep            | bf29017 (16 QA findings + verification gates), 8bdba26 (12 deferred + QA P0/P1) |
| **W2-C Compliance Closure**         | 3       | Mid-term polish       | ca419de (7 deferred), 921bce1 (C.2.c cache wiring), 5436e1f (C.0 + C.1)         |
| **Verification Canary Fleet**       | 6       | Safety infrastructure | 30fc812–2bbdafb diagnostic secrets, KMS decrypt, XRay, S3, Syn zip fixes        |
| **Load-test + Chaos (D-layer)**     | 4       | Foundational testing  | a771c97–ef7201d SCP, k6 harness, FIS, synthetic schema/registry                 |
| **Observability Retune**            | 2       | Operations            | 8309d6e (D.9 alarms), d7c9a47 (AMP teardown per HIPAA SCP)                      |
| **Phase G (API GW CloudFront)**     | 1       | Architecture          | 890b7a7 AppConfig + CloudFront + IAM                                            |
| **Misc (build fixes, diagnostics)** | 10+     | Polish                | Clippy strict, CKV skips, IAM description fixes, tflint ignores                 |

### Velocity Signal

- **No breaking changes** — All commits are additive (new features, bug fixes, compliance closures, testing infrastructure).
- **Phased rollout discipline** — Q-TOPO-4 split gated by `var.q_topo_4_split_enabled`; codepath options available but not forced until ready.
- **Build status:** Passing (cargo-mutants gate, clippy strict, pre-push hooks).
- **Defect closure rate:** High — W2-C and W2-E "epic sweep" commits bulk-close 20+ deferred items per commit.

**Conclusion:** Auth layer is **in active, disciplined development with high velocity and quality focus**. Not a prototype; not stalled. Feature-flagged rollouts suggest production-ready engineering practices.

---

## Specific Corrections to Round 1 Recon

### Claim 1: "Only mobile + m2m_partner_reserved + verification_only clients"

**Status:** ACCURATE but INCOMPLETE

- ✅ Exactly 3 clients exist in live pool (mobile, m2m, verification-only)
- ✅ Web confidential client does NOT exist yet in TF
- ❌ **Incomplete:** Recon failed to note that **U7 decision locks web client architecture**, M6 milestone defines delivery, and strategy docs detail the exact TF resource needed
- ❌ **Incomplete:** No mention of web client being POST-M1 (depends on custom domain flip), not M0

**Corrected claim:** Cognito pool currently has 3 app clients (mobile public, m2m confidential reserved, verification-only confidential temporary). A 4th confidential client for the website BFF is architecturally designed (U7, strategy docs/research/round_5_independent_review/09-cross-repo-coordination.md) and scheduled for M6 delivery, post-dating custom domain activation at M1.

### Claim 2: "Custom domain auth.my-quilty.com is gated `enable_custom_domain = false`"

**Status:** ACCURATE

- ✅ `var.enable_custom_domain` defaults to **false**
- ✅ When false, prefix domain `quilty-{env}` is used (sufficient for IdP registration)
- ✅ Custom domain resource is conditional (`count = var.enable_custom_domain ? 1 : 0`)

**Corrected claim:** Custom domain is intentionally gated on parent domain (my-quilty.com) having an A record. Once website CloudFront is deployed (M1), the A record is added, and `enable_custom_domain = true` is set. No code changes needed; one variable flip + plan/apply cycle.

### Claim 3: "Only pre-built Cognito identity providers (Google/Apple), no custom challenge implementation"

**Status:** INACCURATE

- ❌ **Wrong:** Custom Auth Challenge flow IS implemented (mobile-primary auth path). Lines 18–19 in client.tf: `ALLOW_CUSTOM_AUTH` flow + handlers in cognito_triggers (define/create/verify challenge).
- ✅ Google/Apple IdPs exist but are conditionally gated (`var.google_client_id`, `var.apple_service_id`). Used by Custom Challenge (not Cognito redirect).

**Corrected claim:** Cognito pool supports TWO OAuth authentication paths:

1. **Custom Auth Challenge (mobile primary):** API-based; no redirect. Implemented in Cognito trigger Lambdas (define/create/verify challenge handlers). Google/Apple credentials exchanged server-side.
2. **Managed Login redirect (web future):** Once web app client added (M6) with proper scopes + identity providers + callbacks, OAuth 2.0 Authorization Code flow + PKCE is available (currently not wired).

### Claim 4: "Lambda triggers are all in the monolithic auth-triggers crate"

**Status:** PARTIALLY ACCURATE, OUTDATED

- ✅ Monolithic `auth-triggers` is the **current default** (when `q_topo_4_split_enabled = false`)
- ❌ **Outdated:** Split implementation is **complete and available** in TF (cognito-trig-pre-signup, -post-confirm, -post-auth, -pretoken-gen-v2, -custom-email-sender crates exist and are wired as conditional alternates)
- ❌ **Incomplete:** No mention of the phased rollout plan or rollback mechanics

**Corrected claim:** Auth-triggers are currently routed to a monolithic Lambda, but a full Q-TOPO-4 split is implemented and conditionally gated by `var.q_topo_4_split_enabled`. When enabled, pre-signup/post-confirm/post-auth/pretoken-gen-v2/custom-email-sender each route to dedicated Rust Lambdas. Rollback is <2 min (flip variable + apply). Rollout decision pending W2-E closure verification (last 2 commits, May 19).

### Claim 5: "No visible session management strategy, likely to be deferred to website layer"

**Status:** INACCURATE; SESSION strategy is COMPLETE

- ❌ **Wrong:** Session management strategy is **defined and implemented**: Cognito tokens (JWT) + Valkey JTI denylist + refresh-token rotation (RFC 9700 §4.14) + BFF-side cookie management (per auth_session_architecture.md)
- ✅ Website layer (BFF) adds HTTP-only session cookies, but the Cognito auth strategy is not deferred; it's post-M1 dependency (custom domain → web client → BFF wiring)

**Corrected claim:** Session storage strategy is defined: Cognito JWTs (access/ID/refresh) are the session contract; Valkey ElastiCache holds the JTI denylist for revocation; refresh-token rotation (RFC 9700 §4.14) is enabled. No separate "session table" is needed. Website BFF (post-M1) adds HTTP-only cookies for browser storage. DynamoDB session table per legacy patterns is NOT planned.

### Claim 6: "EventBridge bus 'quilty-production-auth-events' — role and consumers unknown"

**Status:** INCOMPLETE; FULL TOPOLOGY VISIBLE

- ✅ Event bus exists: `quilty-{env}-auth-events` (custom, not default bus)
- ✅ Schema registry provisioned: `quilty.auth.Envelope` + per-event schemas (phase 2)
- ✅ Transactional-outbox pipeline: DDB quilty_outbox → EventBridge Pipe → event bus → subscribers
- ✅ Producers: auth-user, auth-admin, cognito-sync-reconciler, custom-auth handlers
- ✅ Consumers (current): quilty_outbox reconciler, DLQ alarm. Future: SIEM, RISC webhook, partner tooling

**Corrected claim:** EventBridge auth-events bus is wired as the transactional-outbox event transport. Every state mutation (signin, MFA enroll, password reset, admin actions) emits to quilty_outbox DDB, which streams to EventBridge Pipe, which publishes to the event bus. Schema registry (JSONSchema) locks event shape. Reconciler consumes to validate Cognito state. Future RISC/SIEM/partner subscribers are pre-architected (schema first; consumers phase 2).

---

## Deployment Readiness Checklist (Author's Perspective)

Based on this fresh audit, the auth layer is **production-grade and actively maintained**:

- ✅ Cognito pool (PLUS tier, threat protection, WebAuthn, advanced security)
- ✅ Lambda triggers (monolithic + split variants, both tested)
- ✅ Refresh-token rotation + JTI revocation cascade
- ✅ EventBridge transactional-outbox (schema-locked, reconciler active)
- ✅ Load-test isolation (synthetic user discriminator, quota gating)
- ✅ Compliance audit pipeline (6-year S3 Object Lock, HIPAA §164.528)
- ✅ Observability (X-Ray tracing, CloudWatch alarms, Honeycomb integration)
- ✅ Secrets management (KMS, Secrets Manager, SSM Parameter Store)
- ❌ Website BFF integration (M6 deliverable; web client not added yet)
- ❌ Custom domain activation (M1 deliverable; gated on website DNS apex)
- ❌ Managed Login branding (available post-M1, not yet configured)

**Blocker to M1 website launch:** Custom domain flag flip. Blocker to M6 web-auth wiring: M1 completion (no circular dependency).

---

## Document Governance

- **Source:** `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/auth/*.tf` (all .tf files)
- **Rust crates:** `/Users/d1rect0r_interneta/AppBuilding/quilty-aws/lambdas/rust/crates/`
- **Strategy docs:** `/Users/d1rect0r_interneta/AppBuilding/quilty-website/docs/website_strategy_discussion.md` (decisions U7, D39, U8)
- **Research docs:** `/Users/d1rect0r_interneta/AppBuilding/quilty-website/docs/research/` (auth_session_architecture, round_5_independent_review/09-cross-repo-coordination)
- **Git history:** `quilty-aws` main branch commits Apr 16 – May 19, 2026
- **Verification date:** 2026-05-19 (fresh snapshot; not stale)
