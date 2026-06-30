/// <reference path="./.sst/platform/config.d.ts" />

// NOTE: ./infra/monitoring is imported DYNAMICALLY inside defineSiteResources()
// (see the `await import` below). SST (Ion engine) forbids top-level runtime imports
// in sst.config.ts — they must be dynamic imports inside the function that uses them,
// or `sst deploy` aborts with "top level imports - this is not allowed".

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
 * Order of operations for the first deploy (Pattern A, D-T1-5 — quilty-aws owns
 * the cert, NOT SST; SST throws on dns:false without a pre-supplied cert):
 *   a) `quilty-aws/website-baseline/` `terraform apply` — vends OIDC role +
 *      permission boundary + SSM params, AND (enable_website_certificate=true)
 *      creates the us-east-1 ACM cert for my-quilty.com + www, emitting its DNS
 *      validation records (website_acm_validation_records output).
 *   b) `quilty-aws/dns/` `terraform apply` (production AWS account) — writes the
 *      cert's validation CNAMEs into the .com zone (cross-account). Wait for the
 *      cert to reach ISSUED (`aws acm describe-certificate`).
 *   c) Set the QUILTY_WEB_ACM_CERT_ARN repo var to the issued cert ARN, then
 *      `pnpm sst deploy --stage dev` — SST creates CloudFront + Lambda (Next.js
 *      SSR) + S3 origin and attaches the cert; it outputs the CloudFront domain.
 *   d) `quilty-aws/dns/` `terraform apply` again with website_cloudfront_domain
 *      set — apex + www A/AAAA aliases point at the SST distribution.
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
const PSEUDONYM_PEPPER_ENV = 'QUILTY_PSEUDONYM_PEPPER';

// --- M2 (ADR-0071) cross-repo monitoring contract ----------------------------
// These three values are produced by quilty-aws/website-baseline/ as SSM
// parameters and surfaced to this deploy as env vars (see deploy.yml). The
// alarms + access-logging that watch SST-created resources can ONLY be authored
// here (the distribution id + server function name exist only after SST creates
// them), and they route into the durable SNS topic + log bucket that TF owns.
// The ACM cert ARN is consumed here only to ATTACH the cert to the distribution
// (the DaysToExpiry alarm is TF-owned, in website-baseline — D-T1-5).
//   M1.1: alerts SNS topic ARN (/quilty/website/alerts-topic-arn)
//   M1.7: CloudFront access-log bucket regional domain
//         (/quilty/website/cloudfront-access-logs-bucket-domain)
//   D-T1-5 / M3.2: ACM cert ARN created+validated by quilty-aws (the account
//         that owns the my-quilty.com hosted zone) (/quilty/website/acm-cert-arn)
const ALERTS_TOPIC_ARN_ENV = 'QUILTY_WEB_ALERTS_TOPIC_ARN';
const CF_LOG_BUCKET_DOMAIN_ENV = 'QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN';
const ACM_CERT_ARN_ENV = 'QUILTY_WEB_ACM_CERT_ARN';

// CLOUDFRONT-scope WAF Web ACL owned by quilty-aws/website-baseline/waf.tf. The
// CloudWatch metric `WebACL` dimension is the ACL NAME, which is the 3rd
// path segment of the ARN: arn:aws:wafv2:us-east-1:<acct>:global/webacl/<name>/<id>.
function wafAclNameFromArn(arn: string): string | undefined {
  // ['arn:...:global', 'webacl', '<name>', '<id>'] → index 2 is the name.
  const segments = arn.split('/');
  return segments.length >= 4 && segments[1] === 'webacl' ? segments[2] : undefined;
}

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

async function defineSiteResources(stage: string) {
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

  // Pseudonymisation pepper hard gate. The @quilty/security sanitizer
  // falls back to plain SHA-256 (dev: namespace) when the env var is
  // unset, which is fine for dev/test but a production deploy must
  // ship with the per-stage HMAC pepper vended from AWS Secrets
  // Manager (D63 + log-retention.md). The pepper is server-only —
  // intentionally NOT a NEXT_PUBLIC_* var. The deploy workflow reads
  // the SSM-pointer secret + exports it as QUILTY_PSEUDONYM_PEPPER.
  const pseudonymPepper = process.env[PSEUDONYM_PEPPER_ENV];
  if (!pseudonymPepper) {
    throw new Error(
      `${PSEUDONYM_PEPPER_ENV} is required at SST deploy time — ` +
        'log-side pseudonymisation falls back to unsalted SHA-256 ' +
        'without it (HIPAA + GDPR Art 4(5) pseudonymisation gap). ' +
        'Vended from AWS Secrets Manager by quilty-aws/website-baseline/. ' +
        'See docs/runbook/log-retention.md prerequisites.',
    );
  }

  const webDeployBoundaryArn = process.env.QUILTY_WEB_DEPLOY_BOUNDARY_ARN;
  // Fail fast in CI if the boundary ARN is missing — otherwise the deploy role's
  // CreateRole-without-boundary deny surfaces as an opaque mid-deploy AccessDenied.
  if (process.env.SST_DEPLOY_GATE_PASSED === 'true' && !webDeployBoundaryArn) {
    throw new Error(
      'QUILTY_WEB_DEPLOY_BOUNDARY_ARN is required at deploy time — every ' +
        'SST-created IAM role must carry the quilty-web-deploy-boundary (the ' +
        'deploy role denies CreateRole without it). Vended by ' +
        'quilty-aws/website-baseline (web_deploy_boundary_arn). See ADR-0071.',
    );
  }
  // W2 (ADR-0071 sec 5): attach the boundary to EVERY IAM role SST creates. Use the raw aws.iam.Role transform (not the Function component) so it also covers the edge-signing + provider roles the Function transform misses (SST issue 3597). Gated so local dev is unaffected.
  if (webDeployBoundaryArn) {
    $transform(aws.iam.Role, (roleArgs) => {
      roleArgs.permissionsBoundary = webDeployBoundaryArn;
    });
  }

  // Durable, audit-bearing stages (the live public surface) get the full
  // monitoring + access-logging treatment. Ephemeral `preview-pr-*` stages do
  // NOT — per-PR alarms/dashboards would churn resources and route preview
  // noise into the production alerts topic. Mirrors the log-group retention
  // guard below (same closed-enum set; `prod-*` ad-hoc clones excluded on purpose).
  const durableStage = stage === 'dev' || stage === 'production' || stage === 'prod';

  // M2.1 — alert-routing contract (fail fast on durable stages). Every alarm
  // authored below publishes to the SNS topic quilty-aws/website-baseline/ owns
  // (M1.1). A monitoring-anchor site must never deploy with alarms that route
  // into the void, so on a durable stage the topic ARN is a hard deploy gate —
  // same posture as WAF + pepper. Preview stages skip monitoring, so it's optional there.
  const alertsTopicArn = process.env[ALERTS_TOPIC_ARN_ENV];
  if (durableStage && !alertsTopicArn) {
    throw new Error(
      `${ALERTS_TOPIC_ARN_ENV} is required at SST deploy time for the ${stage} ` +
        'stage — the live site is a monitoring anchor and its CloudFront/Lambda/' +
        'ACM alarms must route to a real SNS topic. Vended by ' +
        'quilty-aws/website-baseline/ (M1.1). See quilty-aws/docs/runbooks/track1-go-live.md.',
    );
  }

  // M2.5 — CloudFront standard (v1) access-log bucket regional domain (M1.7).
  // Access logging is enabled only on durable stages (the bucket lives in the
  // marketing-prod account; preview churn is not worth the storage). Optional
  // even there: a first dev deploy before the bucket lands ships without it.
  const cfLogBucketDomain = durableStage ? process.env[CF_LOG_BUCKET_DOMAIN_ENV] : undefined;

  // M2.4 / D-T1-5 — ACM certificate ARN. SST's Cdn requires a pre-validated
  // `cert` whenever `dns: false` (it throws otherwise — it will not create a
  // cert it cannot validate). Under Pattern A the my-quilty.com hosted zone
  // lives in a DIFFERENT account than this deploy role, so quilty-aws (which
  // owns the zone) creates + DNS-validates the us-east-1 cert and exports its
  // ARN. Until that ARN is provided the durable stage deploys on the raw
  // CloudFront URL (no custom domain) — which is exactly the correct pre-DNS
  // state. The cert is watched by the TF-owned DaysToExpiry alarms in
  // quilty-aws/website-baseline/monitoring.tf (D-T1-5) — SST authors none, to
  // avoid double-paging.
  const acmCertArn = process.env[ACM_CERT_ARN_ENV];

  // Edge security-header baseline (CloudFront ResponseHeadersPolicy). The
  // Next.js middleware (apps/web/proxy.ts → packages/security headers-builder)
  // sets the full security-header set on SSR/document responses, but OpenNext
  // serves _next/static assets straight from S3/CloudFront and CloudFront
  // generates its own error bodies (OAC 403, 404, origin 5xx) that never
  // traverse the middleware. This policy carries the same baseline at the edge so
  // those responses are covered too. Every header uses override:false, so where
  // the app already set a value (SSR) the app's per-tier value wins — this only
  // FILLS gaps, never clobbers. HSTS, CSP, and CORP are intentionally omitted:
  // HSTS only needs to ride the main document (the app owns the HSTS_PHASE ramp,
  // D60); CSP is per-tier (marketing vs portal) so it can't be a single edge
  // value; and Cross-Origin-Resource-Policy is left to the app because
  // apps/web/next.config.ts deliberately sets CORP `cross-origin` on the
  // `public/.well-known/*` deeplink/security files (AASA, assetlinks, security.txt,
  // traffic-advice, gpc) and its comment explicitly warns against a
  // "CORP-everywhere hardening sweep" — forcing `same-origin` at the edge here is
  // exactly that sweep. The SSR middleware still sets CORP where it matters.
  const securityHeadersPolicy = new aws.cloudfront.ResponseHeadersPolicy(
    `quilty-web-${stage}-security-headers`,
    {
      name: `quilty-web-${stage}-security-headers`,
      // CloudFront caps ResponseHeadersPolicy comment at 128 chars — keep it short.
      comment:
        'Edge security headers for static assets + CloudFront error bodies (SSR sets its own; override=false).',
      securityHeadersConfig: {
        contentTypeOptions: { override: false }, // X-Content-Type-Options: nosniff
        frameOptions: { frameOption: 'DENY', override: false },
        referrerPolicy: { referrerPolicy: 'strict-origin-when-cross-origin', override: false },
      },
      customHeadersConfig: {
        items: [
          {
            header: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
            override: false,
          },
          {
            header: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
            override: false,
          },
          // NOTE: Cross-Origin-Resource-Policy is deliberately NOT set here — see
          // the block comment above (next.config.ts owns CORP, with cross-origin
          // on the .well-known files).
        ],
      },
    },
  );

  const site = new sst.aws.Nextjs('QuiltyWeb', {
    path: 'apps/web',
    // Forces the SSR Lambda URL to IAM-auth via CloudFront OAC plus edge body signing, so the org non-public-Function-URL SCP permits the deploy (quilty-aws ADR-0071 sections 2 and 3).
    protection: 'oac-with-edge-signing',
    domain:
      // The custom domain attaches only once quilty-aws has vended a validated
      // ACM cert ARN (D-T1-5). `dns: false` without a `cert` makes SST's Cdn
      // throw ("Need to provide a validated certificate when DNS is disabled"),
      // so gating on acmCertArn is what keeps a pre-cert deploy valid: it
      // serves on the raw CloudFront URL until Pattern A (quilty-aws/dns) lands
      // the cert + apex/www alias records. preview-pr-* always uses the raw URL.
      //
      // Gated on `durableStage` (NOT a bare `stage === 'dev'`) so it stays in
      // lock-step with the monitoring/access-logging predicate above. The
      // documented marketing-prod migration flips the live stage name; if this
      // used `=== 'dev'`, that rename would leave durableStage true (alarms +
      // cert-expiry watch still deploy) while the domain silently fell back to
      // the raw CloudFront URL — a green deploy with a dead my-quilty.com.
      durableStage && acmCertArn
        ? {
            name: 'my-quilty.com',
            redirects: ['www.my-quilty.com'],
            // DNS records (ACM validation CNAME + apex/www alias) are written
            // by quilty-aws/dns/ in a coordinated cross-account apply (U6
            // Pattern A); SST must not try to manage them.
            dns: false,
            // Pre-validated us-east-1 cert from quilty-aws (the account that
            // owns the my-quilty.com hosted zone). Required by SST when dns:false.
            cert: acmCertArn,
          }
        : undefined, // raw CloudFront URL (pre-cert dev, or preview-pr-* stages)
    environment: {
      // NEXT_PUBLIC_SITE_URL must be a VALID URL on every stage: lib/env.ts
      // (ADR-0030) validates it via createEnv when next.config.ts loads at
      // `next start` boot, so '' (→ undefined under emptyStringAsUndefined)
      // crashes the server before any localhost fallback can run. A preview
      // stage can't self-reference its own CloudFront `url` Output inside its
      // constructor args, so it falls back to the apex — benign, since
      // preview stages are noindex (canonical pointing at prod is harmless).
      // The wildcard preview custom domain is the proper long-term fix (see
      // docs/runbook/sst-deploy.md).
      NEXT_PUBLIC_SITE_URL: 'https://my-quilty.com',
      NEXT_PUBLIC_SENTRY_DSN: sentryDsn,
      // Server-only — never expose to the client bundle. The Next.js
      // build replaces unprefixed env vars with undefined in browser
      // chunks, so the sanitizer's client-side path always lands on
      // the `dev:` namespace as designed.
      QUILTY_PSEUDONYM_PEPPER: pseudonymPepper,
      // Pre-launch SEO fail-safe. Sourced from the deploy-step env so the
      // same value reaches `next build` (the authoritative X-Robots-Tag
      // header in next.config.ts) and the Lambda runtime (layout.tsx meta
      // robots, for dynamically-rendered routes). Absent => 'false' =>
      // indexable (safe default). CI sets it 'true' for preview stages
      // (never index a preview) and from the SITE_FORCE_NOINDEX repo var for
      // prod ('true' during the placeholder phase, removed at launch).
      SITE_FORCE_NOINDEX: process.env.SITE_FORCE_NOINDEX ?? 'false',
    },
    server: {
      // arm64 ~20% cheaper than x86_64 at the same perf. OpenNext +
      // SST 4.14 ARM64 compatibility is documented; verify on first
      // deploy.
      architecture: 'arm64',
      memory: '1024 MB',
      timeout: '15 seconds',
    },
    // Image optimization (next/image via the Sharp-based OpenNext function).
    // 1536 MB matches the component default and gives Sharp enough vCPU to
    // keep transform latency + billed duration low. `staticEtag` makes the
    // function emit an ETag derived from (href, width, quality, buildId) so
    // an unchanged image returns 304 instead of re-running Sharp on every
    // request — set via the component flag, NOT the OPENNEXT_STATIC_ETAG env
    // var (the component injects that internally when this is true).
    imageOptimization: {
      memory: '1536 MB',
      staticEtag: true,
    },
    // Keep 2 SSR execution environments warm via the OpenNext EventBridge
    // warmer. Two (not one) so that a pair of concurrent first-byte requests
    // during an idle period don't both pay a cold start — material now that
    // AWS bills the Lambda INIT phase. Far cheaper than provisioned
    // concurrency for this bursty marketing + portal traffic profile;
    // revisit (provisioned concurrency) only if cold-start rate exceeds ~5%
    // or p99 TTFB regresses post-launch.
    warm: 2,
    // Deploy-time CloudFront invalidation. `paths: 'all'` issues a single
    // `/*` (one invalidation unit, inside the free tier) so un-hashed HTML
    // is never served stale after a deploy; content-hashed `_next/static`
    // assets are immutable and need no invalidation. `wait: true` blocks the
    // deploy until the invalidation completes, so a green deploy guarantees
    // the edges are serving the new build.
    invalidation: {
      paths: 'all',
      wait: true,
    },
    transform: {
      cdn(args) {
        args.tags = { ...args.tags, ...siteTagsFor(stage) };
        // CLAUDE.md NEVER list: no public hostname without WAF + rate
        // limit. The ARN is a runtime gate (see above) so this is always
        // populated when the cdn transform runs. The CdnArgs field is
        // `webAclArn` — the Cdn component maps it to the distribution's
        // confusingly-named `webAclId`. Setting `webAclId` directly on
        // CdnArgs is a silent no-op that would leave the distribution
        // unprotected, so the WAF ARN must be assigned to `webAclArn`.
        args.webAclArn = wafAclArn;
        // Distribution-level edge settings CdnArgs doesn't expose directly.
        args.transform = {
          ...(typeof args.transform === 'object' ? args.transform : {}),
          distribution(distArgs) {
            // US/EU/Israel edges for US-focused DTC traffic. A flat-rate
            // plan, if adopted later, overrides this (a Phase C decision).
            distArgs.priceClass = 'PriceClass_100';
            // Cdn omits this, so CloudFront's API default (false) applies.
            // Enable IPv6 so IPv6-only clients resolve without NAT64; the
            // apex/www AAAA records are added by quilty-aws/dns/ (Pattern A).
            distArgs.isIpv6Enabled = true;
            // Negotiate HTTP/3 (QUIC) in addition to HTTP/2 — CloudFront's
            // default is HTTP/2 only. Purely additive (HTTP/2 clients are
            // unaffected) and cuts TTFB on lossy mobile links; HTTP/3
            // requires TLS 1.3, which the policy below permits.
            distArgs.httpVersion = 'http2and3';
            // Pin the viewer TLS floor explicitly so it can't silently
            // change under a component-default shift, and so there is one
            // clear line to bump. This equals SST's current default
            // (TLSv1.2_2021) and is a Security-Hub-passing policy. The newer
            // TLSv1.2_2025 policy (drops CBC, adds hybrid post-quantum) is
            // verified NOT accepted by the bundled @pulumi/aws@7.20.0 (its
            // CloudFront enum tops out at TLSv1.2_2021), so setting it would
            // fail the deploy — that upgrade is gated on a provider bump
            // (deployment plan T3-28). Only set on the ACM branch — the
            // default cert (preview stages) ignores a minimum-protocol policy.
            distArgs.viewerCertificate = $output(distArgs.viewerCertificate).apply((cert) =>
              cert && !cert.cloudfrontDefaultCertificate
                ? { ...cert, minimumProtocolVersion: 'TLSv1.2_2021' }
                : cert,
            );
            // M2.5 / O8 — CloudFront STANDARD (v1) access logging into the
            // TF-owned bucket (quilty-aws M1.7). The Logging.Bucket field wants
            // the bucket's DNS domain (<name>.s3.<region>.amazonaws.com), which
            // is exactly what the SSM param exports — no string-munging here.
            // `includeCookies: false` keeps session/PHI hygiene (request headers
            // are never in v1 logs anyway; cookies are the only opt-in field).
            // Gated: a stage without the bucket domain ships without logging
            // rather than failing the deploy.
            if (cfLogBucketDomain) {
              distArgs.loggingConfig = {
                bucket: cfLogBucketDomain,
                includeCookies: false,
                prefix: 'cf/',
              };
            }
            // Attach the edge security-header baseline to EVERY cache behavior —
            // the default (→ SSR) plus the static/image ordered behaviors — so
            // _next/static assets and CloudFront error responses carry the
            // headers, not just SSR documents. `?? policyId` preserves any policy
            // SST might attach in future (only one ResponseHeadersPolicy is
            // allowed per behavior); SST currently sets none.
            const policyId = securityHeadersPolicy.id;
            distArgs.defaultCacheBehavior = $output(distArgs.defaultCacheBehavior).apply((b) => ({
              ...b,
              responseHeadersPolicyId: b.responseHeadersPolicyId ?? policyId,
            }));
            if (distArgs.orderedCacheBehaviors) {
              distArgs.orderedCacheBehaviors = $output(distArgs.orderedCacheBehaviors).apply(
                (behaviors) =>
                  (behaviors ?? []).map((b) => ({
                    ...b,
                    responseHeadersPolicyId: b.responseHeadersPolicyId ?? policyId,
                  })),
              );
            }
          },
        };
      },
      server(args) {
        const tags = siteTagsFor(stage);
        args.tags = { ...args.tags, ...tags };
        // Reserved concurrency is OPT-IN via SSR_RESERVED_CONCURRENCY, UNSET by
        // default. AWS rejects any reservation that drops the account's unreserved
        // pool below the mandated floor of 10 — a brand-new account starts AT 10, so
        // a hardcoded reservation makes `sst deploy` fail with
        // InvalidParameterValueException. Also, marketing-prod is the website's
        // DEDICATED account (the Rust auth Lambdas live in the production account),
        // so there is no cross-workload pool to isolate against here. Once a Lambda
        // concurrency quota increase lands, set SSR_RESERVED_CONCURRENCY (e.g. 100)
        // to cap the SSR Lambda.
        const ssrReserved = process.env.SSR_RESERVED_CONCURRENCY;
        if (ssrReserved && Number(ssrReserved) > 0) {
          args.concurrency = {
            ...(typeof args.concurrency === 'object' ? args.concurrency : {}),
            reserved: Number(ssrReserved),
          };
        }
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
            // teardown. The closed-enum guard matches exactly `dev`,
            // `production`, and `prod` — prefix-matching `prod*` was
            // tempting but would silently retain ad-hoc `prod-hotfix`
            // ephemeral clones we may want to teardown freely. Add new
            // audit-bearing stage names here explicitly.
            const isAuditStage = stage === 'dev' || stage === 'production' || stage === 'prod';
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

  // The Cdn component exposes the distribution via `nodes.distribution` (an
  // aws.cloudfront.Distribution, which has `.id`) — it has no `.id` of its own.
  // `nodes.cdn` + `nodes.server` are optionally typed; a deployed Nextjs always
  // has both, so a missing handle means an SST component-API change — fail loud
  // rather than silently skip monitoring (the worst failure mode for an anchor).
  const distributionId = site.nodes.cdn?.nodes.distribution.id;
  const serverFunctionName = site.nodes.server?.name;
  if (!distributionId || !serverFunctionName) {
    throw new Error(
      'SST did not expose the CloudFront distribution id and/or server Lambda ' +
        'name (site.nodes.cdn / site.nodes.server) — the monitoring contract ' +
        'cannot be authored. This indicates an SST Nextjs component API change; ' +
        'see infra/monitoring.ts.',
    );
  }

  // M2.2–M2.6 — author the CloudFront/Lambda/ACM alarms + golden-signals
  // dashboard, all routed to the quilty-aws-owned SNS topic. WAF + canary
  // metrics are owned by quilty-aws; the dashboard references them read-only.
  // Durable stages only (preview stays alarm-free); alertsTopicArn is guaranteed
  // present here by the fail-fast gate above.
  if (durableStage && alertsTopicArn) {
    // Dynamic import — SST (Ion) forbids top-level runtime imports in sst.config.ts.
    const { defineMonitoring } = await import('./infra/monitoring');
    defineMonitoring({
      namePrefix: `quilty-web-${stage}`,
      alertsTopicArn,
      distributionId,
      serverFunctionName,
      wafAclName: wafAclNameFromArn(wafAclArn),
      syntheticsCanaryName: 'quilty-web-apex', // quilty-aws canary_synthetics.tf (M1.4)
      rustCanaryNamespace: 'Quilty/WebsiteCanary', // quilty-aws canary_rust.tf (M1.3)
      // Fresh-literal spread so the fixed-key QuiltyTags interface satisfies the
      // Record<string, string> param (a named no-index-signature type would not).
      tags: { ...siteTagsFor(stage) },
      // Full URL (not a bare repo-relative path) so an on-call engineer can
      // click straight from the SNS email / Slack message to the runbook in the
      // sibling repo at 3am, without first having to know the repo location.
      runbook: 'https://github.com/d1rect0r/quilty-aws/blob/main/docs/runbooks/track1-go-live.md',
    });
  }

  return {
    gate: 'open' as const,
    url: site.url,
    distributionId,
  };
}

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
