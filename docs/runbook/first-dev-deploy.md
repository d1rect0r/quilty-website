# RUNBOOK — First real SST deploy of `quilty-website` to the dev AWS account (Phase 0)

> **Status:** PLANNING ONLY. Nothing in this document has been applied. No
> `sst deploy`, `terraform apply`, or mutating `aws` call has been run.
> **Scope:** First-ever activation of `sst.config.ts` against the Quilty
> **development** AWS account `619758066987` (Phase 0 per D47), serving the
> public site at **`my-quilty.com`** (apex + `www`).
>
> **Read alongside:** `docs/runbook/sst-deploy.md` (the existing ongoing-ops
> runbook — this document is the _first-time activation companion_ that the
> existing runbook's "Prerequisites" section defers to), `sst.config.ts`,
> and `.github/workflows/deploy.yml`.

---

## 0. Ground truth (verified against both repos this session)

| Fact                           | Value                                                                        | Source                                  |
| ------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------- |
| Dev (Phase 0) account          | `619758066987`                                                               | `quilty-aws/development/variables.tf`   |
| Prod (DNS-owning) account      | `975630231383`                                                               | `quilty-aws/dns/variables.tf`           |
| AWS Organizations ID           | `o-ww52ocogji`                                                               | `quilty-aws/development/variables.tf`   |
| Dev/foundation TF state bucket | `quilty-terraform-state` (region `us-east-2`)                                | `quilty-aws/development/backend.tf`     |
| Prod (DNS) TF state bucket     | `quilty-prod-terraform-state` (region `us-east-1`)                           | `quilty-aws/dns/backend.tf`             |
| `my-quilty.com` hosted zone    | **already exists** in prod account as `aws_route53_zone.com`                 | `quilty-aws/dns/hosted_zone.tf`         |
| `my-quilty.com` zone output    | `com_hosted_zone_id` (already exported)                                      | `quilty-aws/dns/outputs.tf`             |
| Existing ACM cert              | `*.my-quilty.app` + apex only — **no cert for `.com`**                       | `quilty-aws/dns/acm.tf`                 |
| OIDC pattern                   | one provider/account via `modules/oidc-layer`; roles via `modules/oidc-role` | `quilty-aws/development/oidc.tf`        |
| Dev account OIDC provider      | **already exists** (`module.oidc_layer` in `development/`)                   | `quilty-aws/development/oidc.tf`        |
| WAF model to copy              | `quilty-aws/app-sync/waf.tf` (CLOUDFRONT scope, us-east-1)                   | —                                       |
| SST stage for Phase 0          | `dev` (NOT `prod`/`production` — guard-blocked)                              | `sst.config.ts` app()                   |
| SST app region                 | `us-east-1` (required: CloudFront ACM)                                       | `sst.config.ts` providers               |
| GitHub repo (website)          | `d1rect0r/quilty-website`                                                    | inferred from `d1rect0r/quilty-aws` org |
| GitHub repo (infra)            | `d1rect0r/quilty-aws`                                                        | `quilty-aws/*/oidc.tf`                  |

**Critical dependency discovered:** the Cognito custom domain `auth.my-quilty.com`
(U5, `quilty-aws/auth/dns.tf`) is **gated on the apex `my-quilty.com` having an
A record**, which only exists once this website deploy lands. So this runbook is
a hard prerequisite for the auth-layer custom-domain activation, not just a
parallel track.

**Reconciliation note (carry into execution):** `sst.config.ts`'s deferred
hardening item references an SSM lookup of `/quilty/website/hosted-zone-id`, and
the existing `sst-deploy.md` lists that SSM param as a `website-baseline`
deliverable. But the `my-quilty.com` zone lives in the **prod** account while
`website-baseline` runs in the **dev** account. SST does **not** need the zone
ID at deploy time in the chosen design (`domain.dns = false` — see §6): SST only
emits the CloudFront domain + ACM validation CNAMEs; the prod-account `dns/`
layer writes the records. The hosted-zone-id SSM param is therefore **optional
metadata for operator convenience**, not a functional input. Author it as a
String SSM param in dev (value pasted from the `dns` layer's `com_hosted_zone_id`
output) so the future `aws.ssm.getParameterOutput` fast-fail check can be wired
without a cross-account data source. Do **not** block the first deploy on it.

---

## Execution order at a glance

```
┌─ PHASE 1 (quilty-aws, dev acct) ── website-baseline layer ──────────────┐
│  OIDC deploy roles + boundary + SST state bucket + WAF + SSM params      │
└──────────────────────────────────────────────────────────────────────────┘
                              │ outputs: role ARNs, WAF ACL ARN
                              ▼
┌─ PHASE 2 (quilty-website) ── GitHub env/secret wiring + gate flips ─────┐
└──────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ PHASE 3 (quilty-website) ── first `sst deploy --stage dev` ───────────┐
│  creates CF + Lambda + S3 + requests ACM cert → PENDS on validation     │
└──────────────────────────────────────────────────────────────────────────┘
                              │ outputs: CF domain + ACM validation CNAMEs
                              ▼
┌─ PHASE 4 (quilty-aws, prod acct) ── dns/ records_website_com.tf ───────┐
│  ACM validation CNAMEs + apex/www alias records → Pattern A two-step    │
└──────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ PHASE 5 (quilty-website) ── re-deploy → cert validates → site live ───┐
└──────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ PHASE 6 (quilty-aws, auth acct) ── enable_custom_domain=true (U5) ────┐
│  auth.my-quilty.com activates (now that apex resolves)                  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## STEP 1 — Author the `website-baseline` Terraform layer **[quilty-aws-owned]**

Create a new layer `quilty-aws/website-baseline/` deploying to the **dev account
`619758066987`**. Model it on `quilty-aws/development/` (same account) and
`quilty-aws/app-sync/waf.tf` (WAF). This layer is the one-time vendor of the SST
deploy substrate.

### 1.0 Layer skeleton (mirror existing layers)

- `backend.tf` — S3 backend, bucket `quilty-terraform-state`, region `us-east-2`,
  key `website-baseline/terraform.tfstate`, `use_lockfile = true`, `encrypt = true`.
  (Copy from `development/backend.tf`, change only the `key`.)
- `providers.tf` — `provider "aws" { region = var.aws_region }` with the dev
  `default_tags` block copied from `development/providers.tf`. WAF + ACM are
  CloudFront-scoped so they already require `us-east-1` — the dev account's
  default region is `us-east-1`, so **no provider alias is needed** (same as the
  auth layer's observation in `auth/dns.tf`).
- `versions.tf` — copy from `development/versions.tf` (Terraform `>= 1.12.0,< 2.0.0`,
  AWS provider `~> 6.40`).
- `variables.tf` — `aws_region` (default `us-east-1`, same validation block),
  `account_id` (default `619758066987`), `organization_id` (default
  `o-ww52ocogji`), `github_repo` (default `d1rect0r/quilty-website`).
- `README.md` — follow the existing per-layer README convention.

### 1.1 GitHub Actions OIDC deploy roles + permission boundary

Reuse the dev account's existing OIDC provider + apply-boundary by instantiating
`modules/oidc-layer` once in this layer (it is idempotent per-account but creates
a _new_ provider resource — see note below) OR, preferably, **reference the
existing provider/boundary** the `development/` layer already created.

> **Decision required at author time:** `aws_iam_openid_connect_provider` is a
> singleton per account (one URL). The `development/` layer already created it
> via `module.oidc_layer`. A second `module.oidc_layer` call in
> `website-baseline/` would attempt to create a **duplicate** provider → apply
> error (`EntityAlreadyExists`). **Resolution:** do NOT call `modules/oidc-layer`
> again. Instead add a data source:
>
> ```hcl
> data "aws_iam_openid_connect_provider" "github" {
>   url = "https://token.actions.githubusercontent.com"
> }
> # Reference the existing apply boundary by name (created by development/):
> data "aws_iam_policy" "tf_apply_boundary" {
>   name = "quilty-tf-apply-boundary"
> }
> ```
>
> Then feed `data.aws_iam_openid_connect_provider.github.arn` and
> `data.aws_iam_policy.tf_apply_boundary.arn` into the `oidc-role` module calls.
> The SST deploy roles trust the **`d1rect0r/quilty-website`** repo, not
> `quilty-aws` — but the OIDC _provider_ is per-account and repo-agnostic, so the
> existing provider serves both repos.

Author two roles via `modules/oidc-role` (note: that module's `role_name`
validation requires a `tf-` prefix, but these are **SST** roles, not Terraform
roles. The cleaner path is a small inline role here rather than bending the
`tf-`-prefixed module. Specify both options; pick the inline one to keep naming
honest):

**Role A — `quilty-website-deploy-dev`** (used by `deploy.yml` `deploy-prod` job
→ `AWS_DEPLOY_ROLE_ARN_DEV`):

- Trust policy: GitHub OIDC, `aud = sts.amazonaws.com`, `sub` pinned to
  `repo:d1rect0r/quilty-website:environment:production` (the `production` GitHub
  Environment in the website repo — see Step 2).
- `permissions_boundary` = `data.aws_iam_policy.tf_apply_boundary.arn` (the
  existing dev-account boundary that denies IAM escalation / KMS destruction /
  self-escalation — load-bearing control).
- Identity policy: the **least-privilege SST action set** from
  `sst-deploy.md` "Required IAM actions" (reproduced + tightened below). Do NOT
  attach `AdministratorAccess` — the SST bootstrap example does, but Round-5
  final-QA IaC H3 mandates the scoped list.
- `max_session_duration` = 7200 (apply-class).

**Role B — `quilty-website-deploy-preview`** (used by `deploy.yml` `preview` +
`cleanup-preview` jobs → `AWS_DEPLOY_ROLE_ARN_PREVIEW`):

- Trust `sub` pinned to `repo:d1rect0r/quilty-website:environment:preview`.
- Same boundary. **Narrower** identity policy: identical action set but
  S3/Lambda/CloudFront resource scoping restricted to the `quilty-web-preview-*`
  / `preview-pr-*` stage namespaces (so a preview role can never touch the `dev`
  stage's retained resources). Add `lambda:DeleteFunction`,
  `cloudfront:DeleteDistribution`, `s3:DeleteBucket` (preview teardown needs
  destroy rights; the dev role does **not** get destroy rights on CloudFront/S3).

**Least-privilege identity-policy statements (both roles, scoped):**

| Sid              | Actions                                                                                                                                                                              | Resource scope                                                                           | Notes                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `SstStateBucket` | `s3:GetObject`,`PutObject`,`DeleteObject`,`ListBucket`                                                                                                                               | the SST state bucket from §1.3 (`arn` + `/*`)                                            | SST stores Pulumi state here                                     |
| `Cloudfront`     | `cloudfront:CreateDistribution`,`UpdateDistribution`,`CreateInvalidation`,`Get*`,`List*`,`TagResource`,`CreateOriginAccessControl`,`*OriginAccessControl`                            | `*` (CF has limited resource-level IAM)                                                  | dev role omits `DeleteDistribution`                              |
| `Lambda`         | `lambda:CreateFunction`,`UpdateFunctionCode`,`UpdateFunctionConfiguration`,`PublishVersion`,`Get*`,`List*`,`TagResource`,`AddPermission`,`RemovePermission`,`PutFunctionConcurrency` | `arn:aws:lambda:us-east-1:619758066987:function:quilty-web-*`                            | preview role adds `DeleteFunction`                               |
| `S3Assets`       | `s3:CreateBucket`,`PutBucketPolicy`,`PutBucketTagging`,`PutObject`,`DeleteObject`,`GetBucketLocation`,`ListBucket`,`PutBucketVersioning`                                             | `arn:aws:s3:::quilty-web-*`                                                              | preview role adds `DeleteBucket`                                 |
| `Acm`            | `acm:RequestCertificate`,`DescribeCertificate`,`ListCertificates`,`AddTagsToCertificate`,`DeleteCertificate`                                                                         | `*` (ACM RequestCertificate has no resource-level constraint)                            | us-east-1 only — scope via provider region                       |
| `Ssm`            | `ssm:GetParameter`,`GetParameters`,`GetParametersByPath`                                                                                                                             | `arn:aws:ssm:us-east-1:619758066987:parameter/quilty/website/*`                          | reads WAF ARN + hosted-zone-id                                   |
| `Secrets`        | `secretsmanager:GetSecretValue`,`DescribeSecret`                                                                                                                                     | `arn:aws:secretsmanager:us-east-1:619758066987:secret:quilty/website/pseudonym-pepper-*` | the pepper (§4)                                                  |
| `Wafv2Read`      | `wafv2:GetWebACL`,`ListWebACLs`,`AssociateWebACL`,`GetWebACLForResource`                                                                                                             | the ACL ARN from §1.2                                                                    | ACL itself is layer-owned; deploy only associates                |
| `Logs`           | `logs:CreateLogGroup`,`CreateLogStream`,`PutLogEvents`,`PutRetentionPolicy`,`TagResource`,`DescribeLogGroups`                                                                        | `arn:aws:logs:us-east-1:619758066987:log-group:/aws/lambda/quilty-web-*`                 | 6yr retention set by SST                                         |
| `PassRole`       | `iam:PassRole`                                                                                                                                                                       | `arn:aws:iam::619758066987:role/quilty-web-*` ONLY                                       | bound to SST-created Lambda exec role prefix — never `*`         |
| `IamForExecRole` | `iam:CreateRole`,`AttachRolePolicy`,`PutRolePolicy`,`GetRole`,`TagRole`,`CreatePolicy`                                                                                               | `arn:aws:iam::619758066987:role/quilty-web-*` + `policy/quilty-web-*`                    | SST creates the Lambda exec role; boundary still caps escalation |

> The `IamForExecRole` statement is the one gap the existing `sst-deploy.md` list
> understated — SST/OpenNext creates the Lambda execution role itself, so the
> deploy role needs scoped `iam:CreateRole`+`PutRolePolicy` on the
> `quilty-web-*` role/policy namespace. The permission boundary's
> `DenyIAMEscalation` + `DenyPrivilegedPolicyAttachment` still block attaching
> `AdministratorAccess` to anything, so this stays safe.

### 1.2 WAF Web ACL (CLOUDFRONT scope, us-east-1) — **[quilty-aws-owned]**

This layer owns the ACL that `sst.config.ts` hard-gates on via `WAF_WEB_ACL_ARN`.
**Where it lives:** `website-baseline/waf.tf` (dev account). It is _not_ the
app-sync ACL (that protects the API/CloudFront for the Rust backend; a marketing
site has a different rule profile — no `/v1/sync/*` paths, no `application/json`
content-type enforcement on a public HTML site).

Author a fresh CLOUDFRONT-scope `aws_wafv2_web_acl` named
`quilty-website-dev-cloudfront-waf`, modeled structurally on
`app-sync/waf.tf` but with a **marketing-site rule baseline**:

| Pri | Rule                                                                  | Action      | Rationale                                                                                                                                     |
| --- | --------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `EmergencyIpBlock` (IPv4 ip_set, empty, `ignore_changes=[addresses]`) | Block       | on-call runtime flips, no apply (copy app-sync pattern)                                                                                       |
| 1   | `EmergencyIpBlockV6` (IPv6 ip_set)                                    | Block       | CloudFront serves v6                                                                                                                          |
| 2   | `AWSManagedRulesCommonRuleSet`                                        | none()      | OWASP baseline. `SizeRestrictions_BODY` left default (no large bodies expected)                                                               |
| 3   | `AWSManagedRulesKnownBadInputsRuleSet`                                | none()      | Log4Shell / deserialization                                                                                                                   |
| 4   | `AWSManagedRulesAmazonIpReputationList`                               | none()      | known-bad IPs                                                                                                                                 |
| 5   | `AWSManagedRulesAnonymousIpList`                                      | **count()** | do NOT block — Quilty's 16-35 audience uses iCloud Private Relay / VPNs heavily (same reasoning as app-sync rule 6)                           |
| 6   | `RateLimitBlanket`                                                    | Block 429   | 1000/5min per IP (looser than app-sync's 500 — a marketing page fans out more sub-requests per visitor than an API; tune down after RUM data) |

WCU budget ~700 of 5000 — comfortable. Skip the app-sync-specific rules
(`BodySizeBlock`, `ContentTypeEnforcement`, `SQLi`, the `/v1/sync/*` and
`/v1/access/export` path rate-limits, `LoadTestAllow`) — they target the Rust API
surface, not a static/SSR marketing site. Add a `BodySizeBlock` only if/when the
portal ships form POSTs (M5+).

Attach the standard WAF logging config copied from `app-sync/waf.tf`
(`aws_cloudwatch_log_group` `aws-waf-logs-quilty-website-dev-cloudfront`,
INFREQUENT_ACCESS class, `redacted_fields` on `authorization`, `logging_filter`
KEEP BLOCK+COUNT). Use the dev account's existing KMS key for the log group, or
SSE-S3 if no suitable CMK is exported to dev.

**Association model:** Do NOT use `aws_wafv2_web_acl_association` here (that is for
REGIONAL resources). CloudFront-scope ACLs are attached by setting
`web_acl_id = <ACL ARN>` on the distribution — which SST already does in
`sst.config.ts` `transform.cdn(args) { args.webAclId = wafAclArn }`. So this
layer **only creates the ACL and exports its ARN**; SST performs the attach.

Export the ARN to SSM (§1.4) so the deploy workflow can read it.

### 1.3 SST state S3 bucket — **[quilty-aws-owned]**

SST 4.x (Ion) stores its Pulumi-backed state in S3 + an app-passphrase. Create a
dedicated bucket via `modules/hardened-bucket`:

- `bucket_name = "quilty-web-sst-state-dev"` (or account-scoped:
  `quilty-web-sst-state-619758066987`).
- Versioning **enabled** (SST state recovery), `kms_key_arn` = a dev-account CMK
  (or `use_aws_managed_kms_key = true` if no website CMK exists yet),
  public-access-block on, `access_log_target_bucket` = the dev account's existing
  access-log bucket (`development/access_log_bucket.tf`).
- Lifecycle: keep noncurrent versions 90 days, abort incomplete MPU after 7 days
  (the module prepends the MPU rule automatically).
- **Removal protection:** the bucket must outlive `sst remove` — it holds state
  for _all_ stages. `removal: 'retain'` in SST is app-resource-level; this bucket
  is infra-owned and never managed by SST, so it is safe by construction.

> **SST wiring (website side, §3):** point SST at this bucket. In SST 4.x set it
> via `app.home = 'aws'` + the `SST_STATE_BUCKET`-equivalent, OR run
> `sst state` against it. The cleanest path is to let SST bootstrap its own state
> bucket on first `sst deploy` (SST auto-creates `sst-state-<random>` if none is
> configured). **Decision:** for least surprise and explicit ownership, vend the
> bucket here and configure SST to use it; document the exact SST 4.14 config key
> at execution time (verify against Context7 `sst` docs — the key has moved
> between 4.x minors). If verification shows SST insists on auto-bootstrapping,
> let it auto-create and instead **import** that bucket into this layer's state
> so ownership/retention/tags are codified. Either way the bucket ends up
> Terraform-owned with versioning + retention.

### 1.4 SSM parameters — **[quilty-aws-owned]**

In `website-baseline/ssm_exports.tf` (model on `foundation/ssm_exports.tf`),
String type (non-secret), `/quilty/website/*` namespace:

| SSM name                                  | Value                                                                      | Consumed by                             |
| ----------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------- |
| `/quilty/website/waf-web-acl-arn`         | `aws_wafv2_web_acl.cloudfront.arn` from §1.2                               | deploy workflow → `WAF_WEB_ACL_ARN` env |
| `/quilty/website/hosted-zone-id`          | **manually pasted** `com_hosted_zone_id` (cross-account; convenience only) | future SST fast-fail check              |
| `/quilty/website/deploy-role-dev-arn`     | Role A ARN                                                                 | operator/audit reference                |
| `/quilty/website/deploy-role-preview-arn` | Role B ARN                                                                 | operator/audit reference                |
| `/quilty/website/sst-state-bucket`        | §1.3 bucket name                                                           | SST config / operator                   |

The **pseudonym pepper** is a **secret**, not an SSM String. Create it in AWS
Secrets Manager: `quilty/website/pseudonym-pepper` (256-bit random), recovery
window 7 days, dev-account CMK. The deploy workflow reads it and exports
`QUILTY_PSEUDONYM_PEPPER` (§4). Do not store the pepper in SSM String or in
GitHub.

### 1.5 GitHub Environments (apply audit trail) — **[quilty-aws-owned]**

The website-baseline apply itself runs from the **`quilty-aws`** repo's CI. Add a
`website-baseline-apply` entry to `quilty-aws/github/environments.tf`
`apply_environments` set, plus `apply-website-baseline.yml` /
`plan-website-baseline.yml` workflows modeled on `apply-development.yml` /
`plan-development.yml` (path filter `website-baseline/**`, account
`619758066987`, role `tf-website-baseline-apply`/`tf-website-baseline-plan`).

> Because `website-baseline` deploys to the **dev** account, its own
> Terraform-apply OIDC roles (`tf-website-baseline-plan`/`-apply`) follow the
> existing dev-account `tf-*` convention and live in `development/oidc.tf` (or a
> dedicated `website-baseline/oidc.tf` calling `modules/oidc-role` with the
> existing provider). These are distinct from the SST deploy roles in §1.1 (which
> trust the **website** repo, not `quilty-aws`).

---

## STEP 2 — ACM certificate for `my-quilty.com` (+ `www`) in us-east-1 **[joint]**

**A NEW certificate is required.** The existing `dns/acm.tf` cert covers only
`my-quilty.app` + `*.my-quilty.app`. There is no `.com` cert anywhere.

**Who creates it:** SST does (`sst.aws.Nextjs` `domain` block auto-requests an
ACM cert in us-east-1 for the apex + the `www` redirect SAN). This is why the SST
deploy role needs `acm:RequestCertificate` (§1.1). So the cert is **website-owned
at request time**, but **DNS-validated from the prod account** (§4 below) because
the `my-quilty.com` zone lives there.

- Cert domain: `my-quilty.com`; SAN: `www.my-quilty.com`.
- Region: **us-east-1** (CloudFront hard requirement; SST app region is already
  us-east-1).
- Validation: **DNS**. SST emits the two validation CNAME pairs (apex + www) as
  deploy output. The first deploy will **PEND** on validation until the
  prod-account `dns/` layer writes those CNAMEs (Pattern A two-step, §6).

> **Alternative considered + rejected:** pre-minting the `.com` cert in the
> prod-account `dns/` layer (alongside the `.app` wildcard) and handing the ARN
> to SST. Rejected because the cert must be in us-east-1 **in the dev account**
> (CloudFront uses the cert from the account that owns the distribution). A
> prod-account cert cannot be attached to a dev-account CloudFront. So SST must
> request it in-account. The prod `dns/` layer's only job is writing validation +
> alias records.

---

## STEP 3 — Wire GitHub env/secrets in `quilty-website` **[quilty-website-owned]**

In the **website** repo Settings → Environments, create/confirm two environments
(`preview`, `production`) and populate exactly what `deploy.yml` + `sst.config.ts`
reference. The throw-on-missing gates in `sst.config.ts` `defineSiteResources()`
make every one of these load-bearing — a missing value is a hard deploy failure,
by design (fail-fast).

**`sst.config.ts` hard gates (throw if unset) — must ALL be satisfied:**

| Var                             | Gate location                | Throws with                                                    | Where it comes from                                                          |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `SST_DEPLOY_GATE_PASSED='true'` | `shouldProvisionResources()` | (silent no-op, not a throw — empty stack)                      | set literally in `deploy.yml`                                                |
| `NEXT_PUBLIC_SENTRY_DSN`        | `defineSiteResources()`      | "NEXT_PUBLIC_SENTRY_DSN is required at SST deploy time"        | Sentry project DSN (public ingest key); GitHub **var**                       |
| `WAF_WEB_ACL_ARN`               | `defineSiteResources()`      | "WAF_WEB_ACL_ARN is required … no public hostname without WAF" | SSM `/quilty/website/waf-web-acl-arn` (§1.4) → GitHub **var**                |
| `QUILTY_PSEUDONYM_PEPPER`       | `defineSiteResources()`      | "QUILTY_PSEUDONYM_PEPPER is required … unsalted SHA-256"       | Secrets Manager `quilty/website/pseudonym-pepper` (§1.4) → GitHub **secret** |

**Environment `production`** (the `deploy-prod` job → stage `dev`):

| Kind   | Name                      | Value                                                                                      |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------ |
| secret | `AWS_DEPLOY_ROLE_ARN_DEV` | Role A ARN (§1.1)                                                                          |
| secret | `SENTRY_AUTH_TOKEN`       | Sentry source-map upload token                                                             |
| secret | `QUILTY_PSEUDONYM_PEPPER` | the pepper value (read from Secrets Manager) **— add to `deploy.yml` env block, see note** |
| var    | `NEXT_PUBLIC_SENTRY_DSN`  | public Sentry DSN                                                                          |
| var    | `WAF_WEB_ACL_ARN`         | ACL ARN from SSM                                                                           |

> **`deploy.yml` gap to close (website-owned):** the committed `deploy.yml`
> `deploy-prod` job env block sets `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SENTRY_DSN`,
> `SENTRY_AUTH_TOKEN`, `SST_DEPLOY_GATE_PASSED`, `WAF_WEB_ACL_ARN` — but **does
> NOT pass `QUILTY_PSEUDONYM_PEPPER`**, which `sst.config.ts` throws on. Add
> `QUILTY_PSEUDONYM_PEPPER: ${{ secrets.QUILTY_PSEUDONYM_PEPPER }}` to the
> `deploy-prod` (and `preview`) job `env:` blocks before activation, or the first
> CI deploy will throw. Same addition needed in the `preview` job. This is a
> one-line edit per job; do it in the activation PR.

`NEXT_PUBLIC_SITE_URL` is set literally to `https://my-quilty.com` in the
`deploy-prod` job — already correct for the `.com` migration.

**Environment `preview`** (the `preview` + `cleanup-preview` jobs):

| Kind   | Name                           | Value                                                                          |
| ------ | ------------------------------ | ------------------------------------------------------------------------------ |
| secret | `AWS_DEPLOY_ROLE_ARN_PREVIEW`  | Role B ARN (§1.1)                                                              |
| secret | `SENTRY_AUTH_TOKEN`            | same token                                                                     |
| secret | `QUILTY_PSEUDONYM_PEPPER`      | the pepper (add to env block per note above)                                   |
| var    | `NEXT_PUBLIC_SITE_URL_PREVIEW` | placeholder (preview uses raw CF URL; can be `https://my-quilty.com` or empty) |
| var    | `NEXT_PUBLIC_SENTRY_DSN`       | public DSN                                                                     |
| var    | `WAF_WEB_ACL_ARN`              | same ACL ARN (preview reuses dev ACL per `sst.config.ts` comment)              |

**GitHub Environment trust alignment (critical):** the SST deploy-role trust
policies in §1.1 pin `sub` to
`repo:d1rect0r/quilty-website:environment:production` and `…:environment:preview`.
The job-level `environment: production` / `environment: preview` in `deploy.yml`
is what makes GitHub mint an OIDC token with that `environment:` claim. These
must match exactly or `AssumeRoleWithWebIdentity` fails. The website repo is on
GitHub Free → no required-reviewers gate available (same constraint as
`quilty-aws` per ADR-0005); the PR-merge-to-`main` is the human gate for the
`deploy-prod` job.

---

## STEP 4 — First `sst deploy --stage dev` (cert PENDS) **[quilty-website-owned]**

Two activation paths. Prefer the **local operator** path for the first ever
deploy (tighter control, easier to capture outputs); flip CI on afterward.

### 4a. Local operator deploy (recommended for first run)

```bash
aws sso login --profile quilty-dev          # dev account 619758066987
cd /Users/.../quilty-website

SST_DEPLOY_GATE_PASSED=true \
  AWS_PROFILE=quilty-dev \
  NEXT_PUBLIC_SITE_URL=https://my-quilty.com \
  NEXT_PUBLIC_SENTRY_DSN=<public-dsn> \
  WAF_WEB_ACL_ARN=<arn-from-ssm> \
  QUILTY_PSEUDONYM_PEPPER=<pepper-from-secrets-manager> \
  pnpm sst deploy --stage dev
```

> **Claude-session caveat:** `.claude/hooks/guard-bash.sh` blocks
> `--stage prod`/`production`. `--stage dev` is allowed. This is a **human-run**
> command regardless (push-per-phase + explicit authorization). Do not run it
> from an autonomous agent turn.

**Expected behaviour on first run:** SST creates CloudFront + Lambda (arm64,
1024MB, 15s, reserved concurrency 100) + S3 origin + requests the ACM cert. It
then **blocks waiting for ACM validation** and eventually times out — this is
expected, because the validation CNAMEs do not exist in Route 53 yet. The
distribution + Lambda + bucket are created and retained (`removal: 'retain'` for
`dev`).

**Capture from the output (needed for Step 5):**

- CloudFront distribution domain (e.g. `dXXXXXXXX.cloudfront.net`) and
  distribution ID.
- ACM cert ARN.
- The two ACM **validation CNAME** pairs (name + value) for `my-quilty.com` and
  `www.my-quilty.com`. (If the run times out before printing them, read them
  with `aws acm describe-certificate --certificate-arn <arn> --region us-east-1
--profile quilty-dev` — a read-only call.)

### 4b. CI deploy (activation flips — do after first local run succeeds)

The `DEPLOY_ENABLED`/gate flips (all in the **website** repo):

1. **`DEPLOY_ENABLED` repo variable → `true`** (Settings → Secrets and variables
   → Actions → Variables). All three jobs (`preview`, `cleanup-preview`,
   `deploy-prod`) gate on `vars.DEPLOY_ENABLED == 'true'`. This is the master
   on/off switch — reversible in the UI without a code change.
2. `SST_DEPLOY_GATE_PASSED` is already hard-coded `'true'` in the job env blocks —
   no flip needed, but it only matters once `DEPLOY_ENABLED` is on.
3. The `deploy-prod` job triggers on **push to `main`**, runs
   `pnpm sst deploy --stage dev`. So after `DEPLOY_ENABLED=true`, the next merge
   to `main` auto-deploys. (`workflow_dispatch` was deliberately removed per
   Round-5 IaC M2 — there is no manual trigger.)
4. Add the missing `QUILTY_PSEUDONYM_PEPPER` env line (Step 3 note) in the same
   activation PR.

---

## STEP 5 — Write DNS records from prod account, then re-deploy **[quilty-aws-owned → quilty-website-owned]**

### 5a. Prod-account `dns/` layer — Pattern A two-step (the ceremony)

The website's CloudFront lives in the **dev** account; the `my-quilty.com` hosted
zone lives in the **prod** account (`aws_route53_zone.com`). Pattern A = SST owns
the dev-account resources; the prod-account `dns/` layer writes the Route 53
records. This is a **coordinated two-step**: SST deploy first (emits values), then
a prod `dns/` apply consumes those values.

Author `quilty-aws/dns/records_website_com.tf` (new file; model on
`records_com.tf` which already keys off `aws_route53_zone.com.zone_id`). Two record
groups:

1. **ACM validation CNAMEs** (apex + www) — paste the name/value pairs captured in
   Step 4 into a `variable "website_acm_validation"` (a `map(object)`), then a
   `for_each` `aws_route53_record` with `allow_overwrite = true`, ttl 300, into
   `aws_route53_zone.com.zone_id`. (Mirror `dns/acm.tf`'s `acm_validation`
   resource shape.)
2. **Alias records** — apex `my-quilty.com` A + AAAA alias to the CloudFront
   distribution, and `www.my-quilty.com` A + AAAA alias to the same distribution
   (SST handles the www→apex redirect at the CloudFront layer). CloudFront's
   hosted-zone ID for alias targets is the fixed global `Z2FDTNDATAQYW2`; the
   distribution domain name comes from the Step 4 capture.

```hcl
# illustrative shape — values pasted from SST output
variable "website_cloudfront_domain" { type = string }   # dXXXX.cloudfront.net
variable "website_acm_validation" {
  type = map(object({ name = string, record = string, type = string }))
}

resource "aws_route53_record" "website_acm_validation" {
  for_each        = var.website_acm_validation
  zone_id         = aws_route53_zone.com.zone_id
  allow_overwrite = true
  name            = each.value.name
  type            = each.value.type
  ttl             = 300
  records         = [each.value.record]
}

resource "aws_route53_record" "website_apex_a" {
  zone_id = aws_route53_zone.com.zone_id
  name    = var.domain_com           # my-quilty.com
  type    = "A"
  alias {
    name                   = var.website_cloudfront_domain
    zone_id                = "Z2FDTNDATAQYW2"   # CloudFront global alias zone
    evaluate_target_health = false
  }
}
# + website_apex_aaaa (AAAA), website_www_a (A), website_www_aaaa (AAAA)
```

**The value handed across accounts:** from dev→prod, two things move by hand (the
"one ceremony at cutover, dormant after" of Pattern A): the **CloudFront
distribution domain name** and the **two ACM validation CNAME pairs**. They are
pasted into `terraform.tfvars` (or `-var`) for the `dns/` apply. No cross-account
IAM trust is needed — the operator carries the values. (A later Pattern B could
read them via `terraform_remote_state` from the SST state bucket, but SST's
Pulumi state is not a Terraform remote state, so Pattern A by-hand is correct for
now.)

Apply: `dns/` runs in the **prod** account via `tf-dns-apply` /
`apply-dns.yml` (path filter `dns/**`). Either merge a PR touching `dns/` (CI
applies on merge) or run locally with `aws sso login --profile quilty-prod`.
ACM validates ~30-120s after the CNAMEs propagate on Route 53.

> **Coordination note:** because CI `apply-dns.yml` fires on PR-merge, the cleanest
> ceremony is: (1) local SST deploy captures values, (2) open a `dns/` PR with the
> pasted values, (3) merge → CI applies → cert validates. The two repos stay
> independently reviewable.

### 5b. Re-deploy SST to attach the validated cert **[quilty-website-owned]**

Re-run the Step 4a command (or merge to `main` if CI is already on). SST now finds
the cert ISSUED and attaches it to the CloudFront distribution with the WAF ACL
already wired via `transform.cdn`. **Verify:** `https://my-quilty.com` and
`https://www.my-quilty.com` (redirects to apex) serve the Next.js scaffold over a
valid `.com` cert, and the response carries WAF protection (e.g. a synthetic
rate-limit test returns 429 after the blanket threshold).

---

## STEP 6 — Activate Cognito custom domain `auth.my-quilty.com` (U5) **[quilty-aws-owned]**

Now that apex `my-quilty.com` resolves (Step 5 alias record), the auth layer's
custom-domain prerequisite is met (`auth/dns.tf` comment: "Cognito requires the
parent domain of a custom subdomain to resolve").

In `quilty-aws/auth/`: set `enable_custom_domain = true` (default is `false` in
`auth/variables.tf`), then apply via the auth layer's CI/role. This:

- requests an ACM cert for `auth.my-quilty.com` (us-east-1, already coded in
  `auth/dns.tf`),
- creates the Cognito custom domain (provisions an AWS-managed CloudFront dist —
  **15-60 min**),
- writes the `auth.my-quilty.com` A-alias to that distribution.

This step is **independent of the website CI** and can lag; it only needs the apex
A record from Step 5 to exist first.

---

## STEP 7 — Prerequisites checklist (what blocks what)

### MUST be done in `quilty-aws` FIRST (blocks the SST deploy)

- [ ] **[quilty-aws]** `website-baseline/` layer authored + applied to dev acct
      `619758066987` (Step 1): SST deploy roles A+B, permission boundary
      reference, SST state bucket, WAF ACL, SSM params, pepper secret.
- [ ] **[quilty-aws]** WAF ACL ARN exported to SSM `/quilty/website/waf-web-acl-arn`
      (Step 1.2/1.4) — `sst.config.ts` throws without it.
- [ ] **[quilty-aws]** Pseudonym pepper created in Secrets Manager
      `quilty/website/pseudonym-pepper` (Step 1.4) — `sst.config.ts` throws
      without it.
- [ ] **[quilty-aws]** SST deploy roles trust the **website** repo
      (`d1rect0r/quilty-website`) with `environment:production` /
      `environment:preview` `sub` pins (Step 1.1).
- [ ] **[quilty-aws]** `website-baseline-apply` GitHub Environment + apply/plan
      workflows added (Step 1.5) so the _layer itself_ deploys via CI.
- [ ] **[quilty-aws]** Confirm the dev account's existing OIDC provider +
      `quilty-tf-apply-boundary` are referenced (data sources), NOT re-created
      (Step 1.1 note) — re-creating the provider errors.

### CAN be done in `quilty-website` NOW (no AWS dependency)

- [ ] **[quilty-website]** Add `QUILTY_PSEUDONYM_PEPPER` to the `deploy-prod` +
      `preview` job `env:` blocks in `.github/workflows/deploy.yml` (Step 3 gap —
      currently missing, would throw).
- [ ] **[quilty-website]** Confirm `NEXT_PUBLIC_SITE_URL=https://my-quilty.com`
      in the `deploy-prod` job (already correct in committed `deploy.yml`).
- [ ] **[quilty-website]** Create Sentry project; obtain public DSN + auth token.
- [ ] **[quilty-website]** Verify SST 4.14 ARM64/OpenNext compatibility (the
      `sst.config.ts` comment flags "verify on first deploy") and confirm the SST
      state-bucket config key against current `sst` docs (Step 1.3 note).
- [ ] **[quilty-website]** Patch `.claude/hooks/guard-bash.sh` to allow
      `sst remove --stage preview-pr-*` (per
      `docs/runbook/m1_post_scaffold_checklist.md`) — needed for local preview
      cleanup, not for the deploy itself.
- [ ] **[quilty-website]** Pre-stage the GitHub `production` + `preview`
      Environments (Step 3) — secrets/vars can be entered before the AWS role ARNs
      exist (fill the ARNs in once Step 1 lands).

### DEFERRED until after the SST deploy emits values (the joint ceremony)

- [ ] **[joint]** Capture CloudFront domain + ACM validation CNAMEs from the first
      SST deploy (Step 4).
- [ ] **[quilty-aws]** `dns/records_website_com.tf` authored + applied in the prod
      account with the pasted values (Step 5a, Pattern A).
- [ ] **[quilty-website]** Re-deploy SST → cert validates → site live (Step 5b).
- [ ] **[quilty-aws]** `auth/` `enable_custom_domain = true` apply (Step 6, U5) —
      after apex resolves.
- [ ] **[quilty-website]** Flip `DEPLOY_ENABLED` repo variable to `true` to hand
      ongoing deploys to CI (Step 4b).

---

## Appendix — Why a NEW cert, and the account-split summary

- **Cert:** existing `dns/acm.tf` = `my-quilty.app` + `*.my-quilty.app` only. The
  website needs `my-quilty.com` + `www.my-quilty.com`, in **us-east-1**, in the
  **dev account** (CloudFront uses the cert from the distribution's own account).
  → SST requests it; prod `dns/` validates it. No reuse possible.
- **Zone:** `my-quilty.com` zone already exists in **prod** (`aws_route53_zone.com`)
  with SES/M365 email records (`records_com.tf`). The website adds only apex/www
  alias + ACM validation records — no zone creation, no NS change.
- **WAF:** new dev-account CLOUDFRONT-scope ACL (marketing-rule baseline), distinct
  from the app-sync API ACL. SST attaches it; `website-baseline` owns it.
- **OIDC:** dev account already federates GitHub (`development/oidc.tf`). The SST
  deploy roles reuse that provider + boundary but trust the **website** repo.
- **State:** SST/Pulumi state in a dedicated dev-account bucket
  (`quilty-web-sst-state-dev`); Terraform state for `website-baseline` in the
  existing `quilty-terraform-state` (us-east-2). Two separate state systems —
  do not conflate.

```

```
