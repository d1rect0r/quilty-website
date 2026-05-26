import { NextResponse } from 'next/server';

/**
 * GET /api/ready — readiness probe (D124 + Kubernetes-canonical
 * split per ADR-0016 monitoring posture).
 *
 * Returns 200 if every checked dependency reports healthy; 503 if
 * any dependency is degraded. The Kubernetes-canonical semantics:
 * "ready to serve traffic" — a load balancer reading 503 here
 * would drain traffic until the dependency recovers.
 *
 * Pre-activation scope: synthetic dependency checks only. The
 * actual live-dependency wiring activates when:
 *
 *   - DynamoDB tables exist (consent-store, rate-limit, idempotency,
 *     vended by `quilty-aws/website-baseline/`) — then this endpoint
 *     fires a cheap `DescribeTable` against the canary table.
 *   - Sentry ingest is BAA-covered — then this endpoint fires a
 *     synthetic `transport.send({ type: 'health-probe' })` against
 *     Sentry's ingest URL (Sentry's own SDK guards against
 *     amplifying its own outage, so this is safe per Sentry docs).
 *
 * Today: every dependency reports `'synthetic-ok'` with a synthetic
 * `duration_ms: 0`. The runbook at `docs/runbook/sentry-monitors.md`
 * documents the activation path.
 *
 * Why a separate endpoint from `/api/health`: Kubernetes liveness
 * vs. readiness distinction. Liveness = "Lambda alive"; readiness =
 * "dependencies up". A liveness failure should restart the pod /
 * Lambda; a readiness failure should just drain traffic. Conflating
 * the two means a transient DynamoDB blip would force a Lambda
 * restart, multiplying the outage. Split per OneUptime 2026 +
 * Kubernetes docs.
 *
 * Header policy: same as /api/health — `X-Robots-Tag: noindex,
 * nofollow` + `Cache-Control: no-store`.
 *
 * Status code semantics:
 *   - 200 + `{ status: 'ok' }` — every dependency healthy.
 *   - 503 + `{ status: 'degraded' }` — at least one dependency
 *     degraded. Body lists per-dependency status + duration.
 */

export const dynamic = 'force-dynamic';

/**
 * Per-dependency status enum. Three values:
 *
 *   - `ok` — live probe succeeded (post-activation only).
 *   - `degraded` — live probe failed or timed out.
 *   - `synthetic-ok` — no live probe yet; reporting a synthetic
 *     placeholder. Treated as NOT-`ok` at the top level so a
 *     half-wired probe cannot silently produce a 200 response
 *     when activation is partial.
 *
 * Why a Quilty-specific 3-value enum vs. Spring Boot's
 * `UP|DOWN|OUT_OF_SERVICE|UNKNOWN` or .NET's
 * `Healthy|Degraded|Unhealthy`: the synthetic-vs-live distinction
 * is a confidence dimension orthogonal to the status dimension.
 * Collapsing `synthetic-ok` into `ok` (Spring Boot) hides the
 * pre-activation gap; introducing a separate `confidence` field
 * (the .NET approach via custom checks) bloats the response.
 * The 3-value enum captures both signals in one field while the
 * top-level `status` requires `ok` (not `synthetic-ok`) so the
 * load balancer drains traffic until live probes are wired.
 */
type DependencyStatus = 'ok' | 'degraded' | 'synthetic-ok';

interface DependencyHealth {
  readonly status: DependencyStatus;
  readonly duration_ms: number;
  readonly message?: string;
}

interface ReadyResponse {
  readonly status: 'ok' | 'degraded';
  readonly timestamp: string;
  readonly dependencies: Readonly<Record<string, DependencyHealth>>;
}

/**
 * Synthetic dependency probes. Each returns a `DependencyHealth`
 * record. The synthetic implementation is intentionally trivial —
 * the activation path lives in the runbook.
 */
async function probeDependencies(): Promise<Readonly<Record<string, DependencyHealth>>> {
  return Promise.resolve({
    dynamodb: { status: 'synthetic-ok', duration_ms: 0, message: 'tables not provisioned yet' },
    sentry_ingest: {
      status: 'synthetic-ok',
      duration_ms: 0,
      message: 'BAA explicit-request pending',
    },
  });
}

export async function GET(): Promise<NextResponse<ReadyResponse>> {
  const dependencies = await probeDependencies();
  // Top-level status: require every dependency to explicitly be `ok`
  // (NOT just `!= degraded`). A `synthetic-ok` dependency is a half-
  // wired probe — silently promoting it to top-level `ok` would mask
  // the pre-activation gap when Sentry Uptime polls this endpoint.
  // Conservative default: pre-activation = 503 (drain traffic until
  // the runbook activation wires live probes). Post-activation,
  // every dependency flips from `synthetic-ok` to `ok` or `degraded`
  // + the top-level status reflects the canonical aggregate.
  const allOk = Object.values(dependencies).every((d) => d.status === 'ok');
  const body: ReadyResponse = {
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    dependencies,
  };
  return NextResponse.json(body, {
    status: allOk ? 200 : 503,
    headers: {
      'x-robots-tag': 'noindex, nofollow',
      'cache-control': 'no-store',
    },
  });
}
