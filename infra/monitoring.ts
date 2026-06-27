// SST ambient globals (aws.*, $jsonStringify, $util) resolve via the
// triple-slash reference in sst.config.ts, which is this module's only
// compile entry point (SST bundles from sst.config.ts). A second reference
// here is redundant and trips @typescript-eslint/triple-slash-reference.

/**
 * M2 (ADR-0071) — CloudWatch monitoring for the SST-created website surface.
 *
 * These resources can ONLY be authored here, in the SST/Pulumi program, because
 * they reference the CloudFront distribution id + server Lambda name + ACM cert
 * that do not exist until SST creates them (a different state from the
 * quilty-aws Terraform layers). The durable substrate they depend on —
 * the SNS alerts topic (M1.1), the CloudFront access-log bucket (M1.7), the
 * WAF Web ACL + the two canaries (M1.3/M1.4) + their alarms — is owned by
 * quilty-aws/website-baseline/. This module only adds the watch that needs the
 * dynamic SST resource handles, and routes every alarm to the TF-owned topic.
 *
 * Ownership split (so there is no double-alarming):
 *   quilty-aws/website-baseline/  → WAF BlockedRequests, SNS delivery-failure,
 *                                    budget, canary success/latency, deadman,
 *                                    ACM DaysToExpiry (the cert is TF-owned, D-T1-5).
 *   here (SST)                    → CloudFront 5xx/4xx/origin-latency, server
 *                                    Lambda errors/throttles/duration/concurrency,
 *                                    the golden-signals dashboard.
 *
 * Severity + description format mirrors the house alarm convention
 * ([OWNER]/[SEVERITY]/[FIRES_WHEN]/[INVESTIGATE]/[RUNBOOK]) so on-call triages
 * an SST-authored alarm exactly like a Terraform-authored one.
 */

export interface MonitoringInputs {
  /** Resource + alarm name prefix, e.g. `quilty-web-dev`. */
  readonly namePrefix: string;
  /** ARN of the quilty-aws-owned SNS alerts topic (M1.1). */
  readonly alertsTopicArn: string;
  /** CloudFront distribution id (Output from the SST Cdn node). */
  readonly distributionId: $util.Input<string>;
  /** Server (SSR) Lambda function name (Output from the SST Function node). */
  readonly serverFunctionName: $util.Input<string>;
  /** CLOUDFRONT-scope WAF Web ACL name (parsed from the ARN) for the dashboard. */
  readonly wafAclName?: string;
  /** Synthetics browser-canary name owned by quilty-aws (M1.4). */
  readonly syntheticsCanaryName: string;
  /** Rust HTTP-canary metric namespace owned by quilty-aws (M1.3). */
  readonly rustCanaryNamespace: string;
  /** Mandatory quilty topology tags. */
  readonly tags: Record<string, string>;
  /** Operator runbook path referenced from every alarm description. */
  readonly runbook: string;
}

// Every alarm below is named `${namePrefix}-<suffix>` (namePrefix = quilty-web-<stage>),
// which is exactly the prefix the deploy workflow's M2.8 alarm-suppression step
// matches via `describe-alarms --alarm-name-prefix`. Keep the prefix stable.

export function defineMonitoring(i: MonitoringInputs): void {
  const { namePrefix, alertsTopicArn, distributionId, serverFunctionName, tags, runbook } = i;
  const topic = [alertsTopicArn];

  // Small helper so every alarm shares the routing + tags + name convention.
  const mkAlarm = (
    suffix: string,
    args: aws.cloudwatch.MetricAlarmArgs,
  ): aws.cloudwatch.MetricAlarm =>
    new aws.cloudwatch.MetricAlarm(`${namePrefix}-${suffix}`, {
      name: `${namePrefix}-${suffix}`,
      alarmActions: topic,
      okActions: topic,
      tags,
      ...args,
    });

  // CloudFront distribution metrics live in us-east-1 with the Region
  // dimension literal "Global" (NOT the home region). 5xx/4xx error-rate are
  // free default metrics; OriginLatency is an "additional" metric that requires
  // the monitoring subscription enabled below.
  const cfDims = { DistributionId: distributionId, Region: 'Global' };

  // M2.2 — CloudFront 5xx error rate (P1). A sustained 5xx rate means the
  // origin (server Lambda) is failing or OAC/edge-signing is misconfigured —
  // user-visible outage. treat-missing = notBreaching (no traffic ≠ errors).
  mkAlarm('cloudfront-5xx', {
    alarmDescription: `[OWNER] platform [SEVERITY] P1 [FIRES_WHEN] CloudFront 5xxErrorRate > 1% for 3 consecutive minutes (origin Lambda failing or OAC/edge-signing broken). [INVESTIGATE] CloudWatch AWS/CloudFront + the server Lambda log group. [RUNBOOK] ${runbook}`,
    namespace: 'AWS/CloudFront',
    metricName: '5xxErrorRate',
    dimensions: cfDims,
    statistic: 'Average',
    period: 60,
    evaluationPeriods: 3,
    datapointsToAlarm: 3,
    threshold: 1,
    comparisonOperator: 'GreaterThanThreshold',
    treatMissingData: 'notBreaching',
  });

  // M2.2 — CloudFront 4xx error rate (P2). The signal a broken OpenNext deploy
  // actually emits (OAC 403, missing-route 404). Noisier than 5xx (bots, stray
  // 404s) so a higher threshold + longer window avoids paging on background noise.
  mkAlarm('cloudfront-4xx', {
    alarmDescription: `[OWNER] platform [SEVERITY] P2 [FIRES_WHEN] CloudFront 4xxErrorRate > 5% for 5 of 5 minutes (broken route, OAC 403, or bad deploy). [INVESTIGATE] CloudFront access logs (cf/ prefix) + recent deploy diff. [RUNBOOK] ${runbook}`,
    namespace: 'AWS/CloudFront',
    metricName: '4xxErrorRate',
    dimensions: cfDims,
    statistic: 'Average',
    period: 60,
    evaluationPeriods: 5,
    datapointsToAlarm: 5,
    threshold: 5,
    comparisonOperator: 'GreaterThanThreshold',
    treatMissingData: 'notBreaching',
  });

  // M2.2 — CloudFront origin latency p95 (P2). Requires the monitoring
  // subscription (below). 3s p95 is well under the 15s server timeout but high
  // enough that sustained breaches mean a degrading origin worth investigating.
  mkAlarm('cloudfront-origin-latency', {
    alarmDescription: `[OWNER] platform [SEVERITY] P2 [FIRES_WHEN] CloudFront OriginLatency p95 > 3000 ms for 5 of 5 minutes (slow SSR origin — cold starts, downstream calls, or memory pressure). [INVESTIGATE] server Lambda Duration + ConcurrentExecutions. [RUNBOOK] ${runbook}`,
    namespace: 'AWS/CloudFront',
    metricName: 'OriginLatency',
    dimensions: cfDims,
    extendedStatistic: 'p95',
    period: 60,
    evaluationPeriods: 5,
    datapointsToAlarm: 5,
    threshold: 3000,
    comparisonOperator: 'GreaterThanThreshold',
    treatMissingData: 'notBreaching',
  });

  // Enable the additional-metrics subscription so OriginLatency (and the
  // per-status-code/cache-hit metrics on the dashboard) are published. ~$0.30
  // per metric per distribution — comfortably inside the $50 budget (D-T1-3).
  new aws.cloudfront.MonitoringSubscription(`${namePrefix}-cf-monitoring`, {
    distributionId,
    monitoringSubscription: {
      realtimeMetricsSubscriptionConfig: { realtimeMetricsSubscriptionStatus: 'Enabled' },
    },
  });

  // Server (SSR) Lambda metrics — namespace AWS/Lambda, dimension FunctionName.
  const lambdaDims = { FunctionName: serverFunctionName };

  // M2.3 — server Lambda errors (P1). Errors that escape OpenNext surface to
  // the user as a CloudFront 5xx, but alarming on the Lambda directly localizes
  // the fault (code error vs edge/OAC) faster.
  mkAlarm('server-errors', {
    alarmDescription: `[OWNER] platform [SEVERITY] P1 [FIRES_WHEN] server Lambda Errors > 5 in 1 min for 3 of 5 minutes (unhandled SSR exception). [INVESTIGATE] the server Lambda log group + Sentry. [RUNBOOK] ${runbook}`,
    namespace: 'AWS/Lambda',
    metricName: 'Errors',
    dimensions: lambdaDims,
    statistic: 'Sum',
    period: 60,
    evaluationPeriods: 5,
    datapointsToAlarm: 3,
    threshold: 5,
    comparisonOperator: 'GreaterThanThreshold',
    treatMissingData: 'notBreaching',
  });

  // M2.3 — server Lambda throttles (P1). reservedConcurrency = 100 caps the
  // function; ANY sustained throttle means real users are getting 5xx because
  // the cap is too low or a runaway is exhausting it.
  mkAlarm('server-throttles', {
    alarmDescription: `[OWNER] platform [SEVERITY] P1 [FIRES_WHEN] server Lambda Throttles > 0 for 3 of 5 minutes (reserved-concurrency cap of 100 exhausted — users seeing 5xx). [INVESTIGATE] ConcurrentExecutions trend; raise reserved concurrency or investigate a request flood. [RUNBOOK] ${runbook}`,
    namespace: 'AWS/Lambda',
    metricName: 'Throttles',
    dimensions: lambdaDims,
    statistic: 'Sum',
    period: 60,
    evaluationPeriods: 5,
    datapointsToAlarm: 3,
    threshold: 0,
    comparisonOperator: 'GreaterThanThreshold',
    treatMissingData: 'notBreaching',
  });

  // M2.3 — server Lambda duration p95 (P2). Timeout is 15s; p95 > 10s means
  // requests are approaching timeout (which would then show as 5xx).
  mkAlarm('server-duration', {
    alarmDescription: `[OWNER] platform [SEVERITY] P2 [FIRES_WHEN] server Lambda Duration p95 > 10000 ms for 5 of 5 minutes (approaching the 15s timeout). [INVESTIGATE] slow data fetches / cold starts; consider raising warm count or memory. [RUNBOOK] ${runbook}`,
    namespace: 'AWS/Lambda',
    metricName: 'Duration',
    dimensions: lambdaDims,
    extendedStatistic: 'p95',
    period: 60,
    evaluationPeriods: 5,
    datapointsToAlarm: 5,
    threshold: 10000,
    comparisonOperator: 'GreaterThanThreshold',
    treatMissingData: 'notBreaching',
  });

  // M2.3 — server Lambda concurrency (P2). Early warning at 90% of the reserved
  // cap (100) so we raise the cap BEFORE throttles (P1) start.
  mkAlarm('server-concurrency', {
    alarmDescription: `[OWNER] platform [SEVERITY] P2 [FIRES_WHEN] server Lambda ConcurrentExecutions > 90 (90% of the reserved cap of 100) for 3 of 3 minutes. [INVESTIGATE] traffic trend; raise reserved concurrency before throttles begin. [RUNBOOK] ${runbook}`,
    namespace: 'AWS/Lambda',
    metricName: 'ConcurrentExecutions',
    dimensions: lambdaDims,
    statistic: 'Maximum',
    period: 60,
    evaluationPeriods: 3,
    datapointsToAlarm: 3,
    threshold: 90,
    comparisonOperator: 'GreaterThanThreshold',
    treatMissingData: 'notBreaching',
  });

  // ACM DaysToExpiry alarms are intentionally NOT authored here. Under D-T1-5
  // the my-quilty.com cert is created + OWNED by quilty-aws/website-baseline/
  // (acm.tf), so its expiry watch lives in that same Terraform layer
  // (website-baseline/monitoring.tf, gated on enable_website_certificate),
  // referencing the cert ARN directly. That alarm fires independently of any
  // SST deploy and avoids double-paging on the same DaysToExpiry metric.

  // M2.6 — single-pane golden-signals dashboard. References CloudFront + Lambda
  // (owned here) plus the WAF + canary metrics (owned by quilty-aws) by
  // namespace/dimension — a dashboard can read any metric regardless of which
  // stack defines it. All widgets pin region us-east-1 (where the metrics live).
  const region = 'us-east-1';
  // CLOUDFRONT-scope WAFv2 metrics are dimensioned by WebACL + Rule ONLY — there
  // is NO Region dimension (CloudFront WAF reports to us-east-1 without one;
  // "Global" is a console grouping, not a metric dimension). This MUST match the
  // dimension set the deployed quilty-aws/website-baseline/monitoring.tf alarms
  // use ({ WebACL, Rule = "ALL" }) — an extra Region key matches zero datapoints.
  const wafRow: unknown[] = i.wafAclName
    ? [
        [
          'AWS/WAFV2',
          'AllowedRequests',
          'WebACL',
          i.wafAclName,
          'Rule',
          'ALL',
          { stat: 'Sum', label: 'WAF Allowed' },
        ],
        [
          'AWS/WAFV2',
          'BlockedRequests',
          'WebACL',
          i.wafAclName,
          'Rule',
          'ALL',
          { stat: 'Sum', label: 'WAF Blocked', color: '#d62728' },
        ],
      ]
    : [];

  new aws.cloudwatch.Dashboard(`${namePrefix}-dashboard`, {
    dashboardName: `${namePrefix}-golden-signals`,
    dashboardBody: $jsonStringify({
      widgets: [
        {
          type: 'metric',
          x: 0,
          y: 0,
          width: 12,
          height: 6,
          properties: {
            title: 'CloudFront — requests & error rates',
            region,
            view: 'timeSeries',
            stacked: false,
            metrics: [
              [
                'AWS/CloudFront',
                'Requests',
                'DistributionId',
                distributionId,
                'Region',
                'Global',
                { stat: 'Sum', label: 'Requests' },
              ],
              [
                'AWS/CloudFront',
                '4xxErrorRate',
                'DistributionId',
                distributionId,
                'Region',
                'Global',
                { stat: 'Average', label: '4xx %', yAxis: 'right' },
              ],
              [
                'AWS/CloudFront',
                '5xxErrorRate',
                'DistributionId',
                distributionId,
                'Region',
                'Global',
                { stat: 'Average', label: '5xx %', yAxis: 'right', color: '#d62728' },
              ],
            ],
          },
        },
        {
          type: 'metric',
          x: 12,
          y: 0,
          width: 12,
          height: 6,
          properties: {
            title: 'CloudFront — origin latency',
            region,
            view: 'timeSeries',
            metrics: [
              [
                'AWS/CloudFront',
                'OriginLatency',
                'DistributionId',
                distributionId,
                'Region',
                'Global',
                { stat: 'p95', label: 'OriginLatency p95' },
              ],
              [
                'AWS/CloudFront',
                'OriginLatency',
                'DistributionId',
                distributionId,
                'Region',
                'Global',
                { stat: 'p99', label: 'OriginLatency p99' },
              ],
            ],
          },
        },
        {
          type: 'metric',
          x: 0,
          y: 6,
          width: 12,
          height: 6,
          properties: {
            title: 'Server Lambda — errors & throttles',
            region,
            view: 'timeSeries',
            metrics: [
              [
                'AWS/Lambda',
                'Errors',
                'FunctionName',
                serverFunctionName,
                { stat: 'Sum', label: 'Errors', color: '#d62728' },
              ],
              [
                'AWS/Lambda',
                'Throttles',
                'FunctionName',
                serverFunctionName,
                { stat: 'Sum', label: 'Throttles', color: '#ff7f0e' },
              ],
              [
                'AWS/Lambda',
                'ConcurrentExecutions',
                'FunctionName',
                serverFunctionName,
                { stat: 'Maximum', label: 'Concurrency', yAxis: 'right' },
              ],
            ],
          },
        },
        {
          type: 'metric',
          x: 12,
          y: 6,
          width: 12,
          height: 6,
          properties: {
            title: 'Server Lambda — duration',
            region,
            view: 'timeSeries',
            metrics: [
              [
                'AWS/Lambda',
                'Duration',
                'FunctionName',
                serverFunctionName,
                { stat: 'p50', label: 'p50' },
              ],
              [
                'AWS/Lambda',
                'Duration',
                'FunctionName',
                serverFunctionName,
                { stat: 'p95', label: 'p95' },
              ],
              [
                'AWS/Lambda',
                'Duration',
                'FunctionName',
                serverFunctionName,
                { stat: 'p99', label: 'p99' },
              ],
            ],
          },
        },
        // WAF widget only when the ACL name parsed cleanly. A metric-type widget
        // with an empty `metrics` array is rejected by PutDashboard
        // (InvalidParameterValueException), which would abort the whole apply —
        // so omit the widget entirely rather than ship an empty one.
        ...(wafRow.length > 0
          ? [
              {
                type: 'metric',
                x: 0,
                y: 12,
                width: 12,
                height: 6,
                properties: {
                  title: 'WAF — allowed vs blocked',
                  region,
                  view: 'timeSeries',
                  stacked: false,
                  metrics: wafRow,
                },
              },
            ]
          : []),
        {
          type: 'metric',
          x: 12,
          y: 12,
          width: 12,
          height: 6,
          properties: {
            title: 'Uptime canaries (quilty-aws)',
            region,
            view: 'timeSeries',
            metrics: [
              [
                'CloudWatchSynthetics',
                'SuccessPercent',
                'CanaryName',
                i.syntheticsCanaryName,
                { stat: 'Average', label: 'Browser canary %' },
              ],
              [
                i.rustCanaryNamespace,
                'ProbeSuccess',
                'Path',
                '/',
                { stat: 'Minimum', label: 'Apex HTTP probe', yAxis: 'right' },
              ],
            ],
          },
        },
        {
          type: 'metric',
          x: 0,
          y: 18,
          width: 24,
          height: 6,
          properties: {
            title: 'All website Lambdas — errors (server + image-opt + ISR)',
            region,
            view: 'timeSeries',
            stacked: false,
            // SEARCH across every quilty-web-<stage> Lambda. The image-opt +
            // ISR-revalidation functions are NOT exposed via the SST public node
            // API (only the server fn is), so a precise per-function alarm on
            // them isn't possible without reaching into SST internals. This
            // widget gives on-call visibility into their errors (an image-opt
            // failure breaks every next/image request). A dedicated image-opt
            // Errors alarm is a Track-2 item, gated on SST exposing that node.
            metrics: [
              [
                {
                  expression: `SEARCH('{AWS/Lambda,FunctionName} MetricName="Errors" FunctionName="${namePrefix}"', 'Sum', 300)`,
                  label: 'Errors per function',
                  id: 'e1',
                  region,
                },
              ],
            ],
          },
        },
      ],
    }),
  });
}
