# SST Deploy Runbook — first-time activation + ongoing operation

> **State at end of M1:** `sst.config.ts` is committed but `defineSiteResources()`
> early-returns until `SST_DEPLOY_GATE_PASSED=true` is set in the deploy
> environment. The runbook below covers the one-time activation ceremony
>
> - the ongoing deploy + cleanup operations.

## Prerequisites (next-sprint work in `quilty-aws/`)

Before the first SST deploy:

- [ ] `quilty-aws/website-baseline/` Terraform layer applied to the
      `development` AWS account (Phase 0 per D47). Vends:
  - OIDC provider trust for `repo:<org>/quilty-website:ref:refs/heads/main`
    - `repo:<org>/quilty-website:pull_request`
  - `quilty-website-deploy-dev` IAM role with permission boundary
    scoped to the SST stage namespace (see "Required IAM actions"
    below)
  - `quilty-website-deploy-preview` IAM role with narrower preview-only
    permission boundary
  - **AWS WAF v2 Web ACL** — managed rule groups CommonRuleSet +
    KnownBadInputs + IpReputation + AWSManagedRulesAmazonIpReputationList,
    associated with the CloudFront distribution via the SST `transform.cdn`
    hook (Round-5 final-QA IaC C1). Cost ~$10/mo + $0.60/M requests.
    ARN exposed via SSM `/quilty/website/waf-web-acl-arn`.
  - SSM `/quilty/website/hosted-zone-id` — `my-quilty.com` hosted zone
    ID (cross-account, manually input or shared via SSM parameter
    replication)
  - SSM `/quilty/website/kms-cmk-arn` (optional) — for env var
    encryption if SST needs it
- [ ] GitHub repository environments + secrets/vars configured:
  - Environment `preview`:
    - secret `AWS_DEPLOY_ROLE_ARN_PREVIEW`
    - var `WAF_WEB_ACL_ARN` (read from SSM `/quilty/website/waf-web-acl-arn`)
    - var `NEXT_PUBLIC_SITE_URL_PREVIEW`, `NEXT_PUBLIC_SENTRY_DSN`
    - secret `SENTRY_AUTH_TOKEN`
  - Environment `production`:
    - secret `AWS_DEPLOY_ROLE_ARN_DEV`, `SENTRY_AUTH_TOKEN`
    - var `NEXT_PUBLIC_SENTRY_DSN`, `WAF_WEB_ACL_ARN`
- [ ] `.github/workflows/deploy.yml` `if: false` gates flipped to the
      documented conditions (PR-open for preview, PR-closed for cleanup,
      main-push for dev-stage deploy)
- [ ] Harness gap patched: `.claude/hooks/guard-bash.sh` updated to
      allow `sst remove --stage <non-prod>` (user manual edit per
      `docs/runbook/m1_post_scaffold_checklist.md`)

### Required IAM actions for the SST deploy roles

The OIDC roles vended by `quilty-aws/website-baseline/` must permit
(minimum, scoped to the SST stage namespace via permission boundary):

- `cloudfront:CreateDistribution`, `UpdateDistribution`,
  `CreateInvalidation`, `Get*`, `List*` — for the CDN
- `lambda:CreateFunction`, `UpdateFunctionCode`, `UpdateFunctionConfiguration`,
  `PublishVersion`, `Get*`, `List*`, `DeleteFunction` (preview only)
- `s3:CreateBucket`, `PutBucketPolicy`, `PutObject`, `DeleteObject`,
  `GetBucketLocation`, `ListBucket` — scoped to `quilty-web-*` buckets
- `acm:RequestCertificate`, `DescribeCertificate`, `ListCertificates` —
  for the my-quilty.com cert (us-east-1 only)
- `ssm:GetParameter`, `GetParameters` — scoped to `/quilty/website/*`
- `logs:CreateLogGroup`, `CreateLogStream`, `PutLogEvents` — for Lambda
  - CloudFront logs
- `iam:PassRole` — bounded to the SST-created Lambda execution role
  ARN prefix only (`arn:aws:iam::<acct>:role/quilty-web-*`)
- `wafv2:GetWebACL`, `ListWebACLs` — read-only on the WAF ACL ARN from
  SSM (read; the ACL itself is managed by `quilty-aws/website-baseline/`)

This is a stricter list than the default SST bootstrap example, which
grants `AdministratorAccess`. Round-5 final-QA IaC H3.

## First deploy ceremony (one-time)

**Step a — Terraform vend** (in `quilty-aws/`):

    aws sso login --profile quilty-dev
    cd quilty-aws/website-baseline/
    terraform init && terraform plan && terraform apply

**Step b — first SST deploy** (in `quilty-website/`):

The first deploy creates the resources but ACM cert validation will
PEND because the DNS records haven't been written yet. SST will time
out waiting for cert validation; that's expected on step b.

    cd quilty-website/
    SST_DEPLOY_GATE_PASSED=true \
      AWS_PROFILE=quilty-dev \
      pnpm sst deploy --stage dev

Capture the SST output:

- CloudFront distribution domain (e.g., `d1234567890.cloudfront.net`)
- ACM cert ARN + validation CNAMEs (name + value pairs for apex + www)

**Step c — Terraform DNS records** (in `quilty-aws/`, production AWS
account — Pattern A cross-account two-step per U6):

    cd quilty-aws/dns/
    # Manually paste SST outputs into the website_records.tf vars OR
    # via terraform_remote_state if Pattern B is adopted later.
    terraform plan && terraform apply

ACM cert validates as soon as DNS records propagate (~30-120 seconds
on Route 53).

**Step d — re-deploy SST** to attach the now-validated cert:

    SST_DEPLOY_GATE_PASSED=true \
      AWS_PROFILE=quilty-dev \
      pnpm sst deploy --stage dev

Verify in browser: `https://my-quilty.com` loads with the Next.js
scaffold.

**Step e — Cognito custom-domain activation** (in `quilty-aws/`, per U5):

    cd quilty-aws/auth/
    # Edit variables.tf: enable_custom_domain = true
    terraform plan && terraform apply

`auth.my-quilty.com` activates after 15-60 minutes of Cognito
provisioning.

## Ongoing operations

### Per-PR preview deploys (automated)

GitHub Actions `deploy.yml` `preview` job auto-deploys on PR open/sync
once activated. URL: `https://preview-pr-<N>.preview.my-quilty.com`.

### Per-PR cleanup on close

GitHub Actions `deploy.yml` `cleanup-preview` job runs `sst remove
--stage preview-pr-<N>` on PR close. **Note:** the harness gap from
Round-5 affects only Claude Code local sessions, not GitHub Actions
runners — the cleanup works as expected on the runner.

### Manual local preview destroy

If a preview lingers (CI was disabled mid-PR, or a runner failed),
invoke the locally-allowed cleanup skill from Claude Code:

    /sst-destroy-previews

This requires the harness gap patch from
`docs/runbook/m1_post_scaffold_checklist.md` to be applied first.

### Dev-stage deploy (Phase 0 — `development` AWS account)

Auto-triggered by push to `main` once `deploy-prod` `if:` gate is
flipped. Manual invocation:

    SST_DEPLOY_GATE_PASSED=true \
      AWS_PROFILE=quilty-dev \
      pnpm sst deploy --stage dev

### NEVER

- `sst deploy --stage prod` / `--stage production` — blocked by
  `.claude/hooks/guard-bash.sh` in Claude sessions. Production
  deploys happen via CI only after Phase 1 cutover provisions
  `marketing-prod` account + a separate deploy role.
- `sst remove` without `--stage` or against `dev` stage — would tear
  down the production-account-equivalent resources. The Claude hook
  blocks all `sst remove` variants by default; the harness gap patch
  re-enables `--stage preview-pr-*` only.

## Rollback

SST deploys to CloudFront are blue-green via OpenNext's
`CloudFrontFunctions` versioning. To roll back:

1. `git revert <broken-commit>` + push to main.
2. CI auto-deploys the reverted code via `deploy.yml deploy-prod`.

For data-layer rollbacks (DynamoDB session table, ConsentState
table), point-in-time recovery is enabled at SST resource declaration
time (lands when those tables are declared at M3 + M6 in the
respective spines).

## Phase 1 trigger checklist

When the "public launch or first revenue" trigger fires:

- [ ] Vend new `marketing-prod` AWS account in
      Workloads-NonHIPAA OU
- [ ] Apply pixel-isolation SCP to `marketing-prod`
- [ ] Vend new `quilty-website-deploy-prod` OIDC role in
      `marketing-prod`
- [ ] Add GitHub Environment `production-marketing` with
      `AWS_DEPLOY_ROLE_ARN_PROD` secret
- [ ] Add new `deploy-prod-marketing` job in `deploy.yml` targeting
      stage `prod` (use deploy-prod stage name)
- [ ] Migrate DNS records from Phase 0 `development` account to
      `marketing-prod` (Pattern A cross-account flip)
- [ ] Sunset the `dev` stage in `development` account
- [ ] Update `guard-bash.sh` to permit `sst deploy --stage prod` in
      Claude sessions IF the corresponding ASK gate is in place

### Pre-go-live additions surfaced by Round-5 IaC reviewer

- [ ] **WAF web ACL** — `sst.aws.Nextjs` does NOT add WAF by default.
      Before go-live, declare an AWS WAF ACL (managed-rules:
      CommonRuleSet + KnownBadInputs + IpReputation) + wire via
      `transform.cdn(args) { args.webAclId = ... }`. Cost ~$10/mo
      managed rules + $0.60/M requests. CLAUDE.md NEVER list: no
      public hostname without WAF + rate limit.
- [ ] **S3 origin bucket versioning** — `removal: 'remove'` on preview
      stages will destroy the S3 asset bucket. If a future
      `next/image` remote image caching pipeline (M2+) stores
      anything persistent in that bucket, enable versioning + flip
      `removal: 'retain'` for the bucket specifically via
      `transform.assets`.
- [ ] **Preview stage custom domain** — currently preview stages
      return the raw CloudFront URL from `site.url` (not a
      `*.preview.my-quilty.com` subdomain). If preview URLs are
      shared in PR comments or with stakeholders, add a wildcard
      `*.preview.my-quilty.com` ACM cert + Route 53 record + flip
      preview stages to `domain: { name: '${stage}.preview...' }`.
- [ ] **Prerequisite-check SSM lookup** — strengthen the
      `SST_DEPLOY_GATE_PASSED` runtime gate by adding an
      `aws.ssm.getParameterOutput('/quilty/website/hosted-zone-id')`
      lookup inside `defineSiteResources()` so a deploy with the env
      var set but missing SSM params fails fast instead of producing
      a half-baked stack.
