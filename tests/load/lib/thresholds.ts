/**
 * SLO thresholds — one per route type, sourced from Vercel Fluid
 * Compute benchmarks + Speed Insights canon (2026). Centralised so
 * every k6 scenario in `tests/load/scenarios/` references the same
 * limits; tweaks happen here, scenarios pick up automatically.
 *
 * Latency units: milliseconds (k6 native).
 * Error rate: fraction of requests that returned non-2xx OR did not
 * match the scenario's response-validity check.
 */

export interface RouteThresholds {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly errorRate: number;
}

export const ROUTE_THRESHOLDS: Record<string, RouteThresholds> = {
  /**
   * Statically pre-rendered HTML routes (most marketing pages).
   * Served from CloudFront edge cache with brotli.
   */
  static_html: { p50: 100, p95: 300, p99: 800, errorRate: 0.001 },
  /**
   * SSR routes where the Lambda runtime renders per-request
   * (e.g., `/[locale]/search` post-Pagefind activation).
   */
  ssr_dynamic: { p50: 200, p95: 800, p99: 1500, errorRate: 0.005 },
  /**
   * POST endpoints with side effects (contact, future signup, etc.).
   * Tolerances accommodate captcha + email-send + DynamoDB writes.
   */
  form_post: { p50: 300, p95: 1000, p99: 2000, errorRate: 0.005 },
  /**
   * Auth-token refresh / session-tier endpoints under `/api/auth/*`.
   * Allowed-error fraction is tight — auth flakiness directly hits
   * user trust.
   */
  auth_refresh: { p50: 150, p95: 500, p99: 1200, errorRate: 0.001 },
};

/**
 * k6 threshold-object builder. Pass a `RouteThresholds` and the
 * scenario name; returns the canonical k6 `thresholds` shape for
 * `options.thresholds`.
 */
export function thresholdsForRoute(routeType: keyof typeof ROUTE_THRESHOLDS, scenarioName: string) {
  const t = ROUTE_THRESHOLDS[routeType];
  if (!t) throw new Error(`thresholdsForRoute: unknown route type ${routeType}`);
  return {
    [`http_req_duration{scenario:${scenarioName}}`]: [
      `p(50)<${t.p50}`,
      `p(95)<${t.p95}`,
      `p(99)<${t.p99}`,
    ],
    [`http_req_failed{scenario:${scenarioName}}`]: [`rate<${t.errorRate}`],
  };
}
