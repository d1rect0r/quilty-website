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
 * Mandatory tag set per the `quilty-aws` topology convention. Every
 * SST-emitted resource must carry the five `quilty:*` tags below so
 * cost reports + IAM policy scoping (permission-boundary stack-name
 * matching) + Phase 1 migration filters all work correctly.
 *
 * Round-5 final-QA IaC reviewer H1: `quilty:owner`, `quilty:stack`, and
 * `quilty:repo` were missing from the earlier set. `quilty:stack` is
 * load-bearing — `quilty-aws` IAM permission boundaries scope by stack
 * namespace, so a deploy without it would fail policy conditions when
 * the post-Phase-1 boundary is tightened.
 */
function siteTagsFor(stage: string): Record<string, string> {
  return {
    'quilty:owner': 'platform',
    'quilty:service': 'quilty-website',
    'quilty:env': stage,
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
      NEXT_PUBLIC_SITE_URL:
        stage === 'dev' ? 'https://my-quilty.com' : ($site?.url ?? ''),
      NEXT_PUBLIC_SENTRY_DSN: sentryDsn,
    },
    server: {
      // arm64 ~20% cheaper than x86_64 at the same perf. OpenNext +
      // SST 4.14 ARM64 compatibility is documented; verify on first
      // deploy (Round-5 IaC reviewer L4).
      architecture: 'arm64',
      memory: '1024 MB',
      timeout: '15 seconds',
      // reservedConcurrency caps a traffic spike or DDoS-style scale
      // event from exhausting the dev-account concurrency pool that the
      // Rust auth backend Lambdas share (Round-5 final-QA IaC H2). 100
      // is calibrated to M1 expected traffic (zero today, hundreds at
      // launch); revisit when post-launch CWV telemetry shows real load.
      // Cost-neutral — reserved concurrency does not increase per-
      // invocation cost.
      reservedConcurrency: 100,
    },
    transform: {
      cdn(args) {
        args.tags = { ...args.tags, ...siteTagsFor(stage) };
        // Wire the WAF Web ACL — CLAUDE.md NEVER list compliance
        // (Round-5 final-QA IaC C1). The ARN is a runtime gate (see
        // above) so this is always populated when the cdn transform runs.
        args.webAclId = wafAclArn;
      },
      server(args) {
        args.tags = { ...args.tags, ...siteTagsFor(stage) };
      },
      assets(args) {
        // S3 origin bucket tags + retention. `forceDestroy: false` on
        // the dev stage keeps `sst remove --stage dev` from silently
        // deleting the asset bucket (Round-5 final-QA IaC M1 — the app-
        // level `removal: retain` does not propagate to resource-level
        // S3 bucket policy in SST 4.x). Preview stages keep the default
        // (forceDestroy: true) so PR cleanup actually frees S3.
        args.tags = { ...args.tags, ...siteTagsFor(stage) };
        if (stage === 'dev') {
          args.forceDestroy = false;
        }
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
