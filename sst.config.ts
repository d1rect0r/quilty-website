/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST 4.x (Ion engine, Pulumi underneath) — config skeleton.
 *
 * NOT YET DEPLOYED. Per the M1 plan + U5 + U6, the actual first deploy
 * happens in the next sprint after `quilty-aws/website-baseline/` vends:
 *   1. OIDC provider trust for github.com/<org>/quilty-website
 *   2. AWS_DEPLOY_ROLE_ARN_PREVIEW + AWS_DEPLOY_ROLE_ARN_DEV roles
 *      with permission boundaries scoped to SST stage namespaces
 *   3. SSM parameters this config reads (hosted zone ID, log archive
 *      bucket ARN, KMS CMK ARN if needed)
 *
 * Order of operations for the first deploy:
 *   a) `quilty-aws/website-baseline/` `terraform apply` — vends OIDC
 *      role + permission boundary + SSM params (D47 + U5).
 *   b) `pnpm sst deploy --stage dev` from this repo — SST creates
 *      CloudFront + Lambda (Next.js SSR) + S3 origin + ACM cert for
 *      my-quilty.com + www.my-quilty.com. SST outputs the CloudFront
 *      domain + ACM validation CNAMEs.
 *   c) `quilty-aws/dns/` `terraform apply` (production AWS account) —
 *      writes ACM validation CNAMEs + alias records at apex + www
 *      pointing at the SST-emitted CloudFront distribution. Cross-
 *      account "Pattern A" coordinated two-step per U6.
 *   d) Re-run `pnpm sst deploy --stage dev` — ACM validates against
 *      the now-present DNS records.
 *   e) `quilty-aws/auth/` `terraform apply` with
 *      `enable_custom_domain = true` (per U5) — Cognito custom domain
 *      `auth.my-quilty.com` activates (15-60 min provisioning).
 *
 * All steps require explicit human authorization per
 * `feedback_push_per_phase`. The orchestration runbook lives at
 * `docs/runbook/sst-deploy.md`.
 *
 * Resource shape locked in here:
 *   - One Next.js component (SST's OpenNext-backed wrapper)
 *   - Custom domain `my-quilty.com` (apex) + `www.my-quilty.com`
 *     redirect — cert is ACM in us-east-1 (required for CloudFront)
 *   - Per-stage isolation: stage `dev` = Phase 0 development account
 *     (D47). Stage `prod*`/`production*` is BLOCKED by
 *     `.claude/hooks/guard-bash.sh` until Phase 1 cutover + a
 *     deliberate user action.
 *
 * The `run()` body delegates to `defineSiteResources()` which checks
 * the OIDC + SSM gate at runtime. Until the gate flips (env var set
 * by the deploy workflow once `quilty-aws/website-baseline/` lands),
 * `sst deploy` is a no-op — no resources are created. This avoids
 * the YAGNI smell of large commented-out blocks while preserving the
 * full shape for review.
 */

const DEPLOY_GATE_ENV = 'SST_DEPLOY_GATE_PASSED';
const WAF_ACL_ARN_ENV = 'WAF_WEB_ACL_ARN';

function shouldProvisionResources(): boolean {
  return process.env[DEPLOY_GATE_ENV] === 'true';
}

/**
 * Compile-time-enforced tag value space.
 *
 * The `quilty:env` + `quilty:cost-center` tags feed AWS Tag Policies +
 * Cost Explorer aggregations + IAM permission-boundary conditions in
 * the `quilty-aws` OU. Mis-tagged resources slip past the boundary +
 * pollute the cost report. Modeling these as union types pushes the
 * validation up to `tsc --noEmit` so a typo (`'production'` vs
 * `'prod'`, `'mkt'` vs `'marketing'`) is caught at edit time, not at
 * Pulumi diff.
 *
 * See `docs/runbook/log-retention.md` for the full tag schema +
 * permitted values + rotation policy.
 */
type QuiltyEnv = 'dev' | 'preview' | 'prod';
type QuiltyCostCenter = 'marketing' | 'platform' | 'security';

interface QuiltyTags {
  readonly 'quilty:owner': string;
  readonly 'quilty:service': string;
  readonly 'quilty:env': QuiltyEnv;
  readonly 'quilty:stack': string;
  readonly 'quilty:repo': string;
  readonly 'quilty:cost-center': QuiltyCostCenter;
  // `workload` + `stage` are preserved for cost-allocation backward
  // compatibility with the pre-tag-policy reports. New code should
  // prefer the `quilty:*` keys. See log-retention.md tag schema for
  // the deprecation window.
  readonly workload: string;
  readonly stage: string;
}

/**
 * Mandatory tag set per the `quilty-aws` topology convention. Every
 * SST-emitted resource carries the eight tags below so cost reports +
 * IAM policy scoping (permission-boundary stack-name matching) + a
 * future cross-account migration filter all work correctly.
 *
 * `quilty:stack` is load-bearing — `quilty-aws` IAM permission
 * boundaries scope by stack namespace, so a deploy without it would
 * fail policy conditions when the post-launch boundary is tightened.
 */
function siteTagsFor(stage: string): QuiltyTags {
  // SST stage names follow the `dev` / `preview-pr-<n>` / `prod-*`
  // convention. Map them to the closed QuiltyEnv enum so the AWS Tag
  // Policy `quilty:env` value list (dev/preview/prod) is satisfied.
  // `production` and `prod-*` both fold to `prod`; any other unknown
  // stage falls back to `dev` (the safest closed-enum default).
  const env: QuiltyEnv =
    stage === 'dev'
      ? 'dev'
      : stage.startsWith('preview')
        ? 'preview'
        : stage === 'production' || stage.startsWith('prod')
          ? 'prod'
          : 'dev';
  return {
    'quilty:owner': 'platform',
    'quilty:service': 'quilty-website',
    'quilty:env': env,
    'quilty:stack': `quilty-web-${stage}`,
    'quilty:repo': 'quilty-website',
    'quilty:cost-center': 'marketing',
    workload: 'quilty-website',
    stage,
  };
}

function defineSiteResources(stage: string) {
  if (!shouldProvisionResources()) {
    return {
      gate: 'closed' as const,
      reason:
        `SST_DEPLOY_GATE_PASSED is unset — quilty-aws/website-baseline/ ` +
        `hasn't vended the OIDC role + SSM params yet. See docs/runbook/sst-deploy.md.`,
    };
  }

  // Sentry DSN must be present at deploy time — empty DSN makes the
  // Sentry SDK silently no-op on initialization (Round-5 IaC reviewer
  // M4). Fail fast rather than ship a swallow-all-errors build.
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!sentryDsn) {
    throw new Error(
      'NEXT_PUBLIC_SENTRY_DSN is required at SST deploy time. Set it in ' +
        'the GitHub Actions environment vars (production/preview) — see ' +
        'docs/runbook/sst-deploy.md prerequisites.',
    );
  }

  // WAF Web ACL hard gate (Round-5 final-QA IaC C1). The CLAUDE.md NEVER
  // list forbids a public hostname without WAF + rate limit; a single
  // `SST_DEPLOY_GATE_PASSED` boolean is not enough — a second mechanical
  // check on the WAF ACL ARN ensures the next-sprint activation cannot
  // accidentally ship a WAF-less distribution. `quilty-aws/website-baseline/`
  // is responsible for vending the ACL ARN as a SSM parameter that the
  // deploy workflow exports to `WAF_WEB_ACL_ARN` for the dev stage. Preview
  // stages reuse the same ACL (Cloudflare-style shared protection).
  const wafAclArn = process.env[WAF_ACL_ARN_ENV];
  if (!wafAclArn) {
    throw new Error(
      `${WAF_ACL_ARN_ENV} is required at SST deploy time — no public ` +
        'hostname without WAF + rate limit per CLAUDE.md NEVER list. ' +
        'Vended by quilty-aws/website-baseline/. See ' +
        'docs/runbook/sst-deploy.md prerequisites.',
    );
  }

  const site = new sst.aws.Nextjs('QuiltyWeb', {
    path: 'apps/web',
    domain:
      stage === 'dev'
        ? {
            name: 'my-quilty.com',
            redirects: ['www.my-quilty.com'],
            // ACM cert validation records written by quilty-aws/dns/
            // in a coordinated apply (U6 Pattern A).
            dns: false,
          }
        : undefined, // preview-pr-* stages use the raw CloudFront URL
    environment: {
      // For preview stages, NEXT_PUBLIC_SITE_URL is derived from the
      // SST-emitted `site.url` (the raw CloudFront domain) — fixes the
      // phantom *.preview.my-quilty.com URL flagged in Round-5 IaC
      // reviewer M3 (no wildcard DNS record exists for that pattern).
      NEXT_PUBLIC_SITE_URL: stage === 'dev' ? 'https://my-quilty.com' : ($site?.url ?? ''),
      NEXT_PUBLIC_SENTRY_DSN: sentryDsn,
    },
    server: {
      // arm64 ~20% cheaper than x86_64 at the same perf. OpenNext +
      // SST 4.14 ARM64 compatibility is documented; verify on first
      // deploy.
      architecture: 'arm64',
      memory: '1024 MB',
      timeout: '15 seconds',
    },
    transform: {
      cdn(args) {
        args.tags = { ...args.tags, ...siteTagsFor(stage) };
        // CLAUDE.md NEVER list: no public hostname without WAF + rate
        // limit. The ARN is a runtime gate (see above) so this is
        // always populated when the cdn transform runs.
        args.webAclId = wafAclArn;
      },
      server(args) {
        const tags = siteTagsFor(stage);
        args.tags = { ...args.tags, ...tags };
        // reservedConcurrency belongs on FunctionArgs.concurrency.reserved,
        // not on SsrSiteArgs.server — the latter has no concurrency
        // field so the prior placement was silently discarded. Caps the
        // Lambda from exhausting the shared dev-account concurrency
        // pool the Rust auth-backend Lambdas live in. 100 is calibrated
        // for zero-today / hundreds-at-launch traffic.
        args.concurrency = {
          ...(typeof args.concurrency === 'object' ? args.concurrency : {}),
          reserved: 100,
        };
        // 6yr retention satisfies 45 CFR §164.530(j)(2); the D67 PHI
        // sanitizer chokepoint at wrapLogger/wrapErrorReporter is what
        // makes long retention safe. `format: 'json'` produces OTel-
        // shaped logs the Logs-Insights queries in
        // docs/runbook/log-retention.md depend on.
        args.logging = {
          ...(typeof args.logging === 'object' ? args.logging : {}),
          retention: '6 years',
          format: 'json',
        };
        // CloudWatch LogGroup tag propagation + retain-on-delete. The
        // Nextjs component does NOT route AWS:Logs:LogGroup through its
        // app-level `removal: 'retain'` allowlist, so without this the
        // log group is deleted on `sst remove --stage dev` regardless
        // of the 6-year audit clock. The nested transform reaches the
        // inner Function's LogGroup args directly.
        args.transform = {
          ...(typeof args.transform === 'object' ? args.transform : {}),
          logGroup(lgArgs, opts) {
            lgArgs.tags = { ...lgArgs.tags, ...tags };
            // Audit-clock protection: any stage that could host real
            // auth/consent/step-up events must retain the log group on
            // teardown. Preview stages are ephemeral PR builds with no
            // real user events, so they keep the default destroy-on-
            // remove behavior. `dev` + every `prod*` stage retains.
            const isAuditStage =
              stage === 'dev' || stage.startsWith('prod') || stage === 'production';
            if (isAuditStage) {
              opts.retainOnDelete = true;
            }
          },
        };
      },
      assets(args) {
        // SST's `BucketArgs` exposes a nested `transform.bucket` for
        // the underlying Pulumi s3.Bucket — that's where tags + the
        // dev-stage forceDestroy guard land. Setting `args.tags` or
        // `args.forceDestroy` at this level is silently discarded
        // because the SST abstraction has no such fields.
        args.transform = {
          ...(typeof args.transform === 'object' ? args.transform : {}),
          bucket(bArgs) {
            bArgs.tags = { ...bArgs.tags, ...siteTagsFor(stage) };
            if (stage === 'dev') {
              // Preserves the dev assets bucket across `sst remove
              // --stage dev` invocations. The app-level `removal:
              // retain` covers S3 buckets but `forceDestroy: false` is
              // the belt-and-braces guard against an explicit destroy.
              bArgs.forceDestroy = false;
            }
          },
        };
      },
    },
  });

  return {
    gate: 'open' as const,
    url: site.url,
    distributionId: site.nodes.cdn.id,
  };
}

// Forward reference helper for the NEXT_PUBLIC_SITE_URL fallback above —
// SST's `site.url` is a Pulumi Output; we cannot reference it inside the
// same `Nextjs` constructor argument that produces it. Replace this with
// the actual ref once SST exposes `$resolve`-style late binding, or
// migrate preview stages to a wildcard custom domain (see Phase 1
// checklist in docs/runbook/sst-deploy.md).
declare const $site: { url: string } | undefined;

export default $config({
  app(input) {
    return {
      name: 'quilty-web',
      // Removal policy: `retain` for the dev stage (data resources
      // persist across stack tears); `remove` for ephemeral preview
      // stages so PR cleanup actually frees CloudFront/Lambda/S3.
      removal: input.stage === 'dev' ? 'retain' : 'remove',
      home: 'aws',
      providers: {
        aws: {
          region: 'us-east-1',
          // The deploy role per-stage is set at the CI layer
          // (.github/workflows/deploy.yml) via OIDC. SST inherits
          // credentials from the runner environment.
        },
      },
    };
  },

  async run() {
    return defineSiteResources($app.stage);
  },
});
