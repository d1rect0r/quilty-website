import { NextResponse } from 'next/server';

/**
 * GET /api/health — liveness probe (D124 + Kubernetes-canonical
 * split per ADR-0016 monitoring posture).
 *
 * Returns 200 if the Lambda is alive. NO downstream dependency
 * touches — this endpoint must not exercise DynamoDB, Sentry
 * ingest, or any external service. Two reasons:
 *
 *   1. Cold-start latency budget. Sentry Uptime polls this every
 *      5 minutes from US-East + EU-West; a Lambda cold start adds
 *      ~500ms to the response. Adding a DynamoDB round trip would
 *      push p99 past 800ms, which a future SLA target ("99% of
 *      health checks under 500ms") would breach.
 *   2. Circular-dependency risk. If Sentry ingest is down and we
 *      poll it from the health endpoint, every health-check call
 *      slows or fails — making the outage harder to diagnose.
 *      Liveness MUST report "Lambda is alive" without depending
 *      on anything that could be the source of an outage.
 *
 * The deeper synthetic-dependency check lives at `/api/ready` per
 * the Kubernetes readiness-probe convention.
 *
 * Response shape: `{ status, version, timestamp }`. `version` is
 * the git SHA the deploy is built from (read at build time; the
 * SST asset-version env var or a vended `NEXT_PUBLIC_BUILD_SHA`).
 * Falls back to `'unknown'` in dev / local-only runs where the
 * env var is unset.
 *
 * Header policy:
 *   - `X-Robots-Tag: noindex, nofollow` — endpoint is not a
 *     crawlable surface. Mirrors the /api/contact pattern.
 *   - `Cache-Control: no-store` — every response is per-request;
 *     CDN caching a 200 would hide a Lambda-down state.
 */

export const dynamic = 'force-dynamic';
// `runtime: 'edge'` is intentionally NOT set today — the
// Lambda runtime is the canonical target since Sentry Uptime
// polls the Lambda's URL, not an Edge function. Edge migration
// is a future-readiness decision tied to the SST asset routing.
//
// Why no `/api/startup` (third Kubernetes probe): Kubernetes
// 2024+ defines a 3-way split (liveness + readiness + startup).
// The startup probe is intended for slow-init workloads where
// the liveness probe should be suppressed until init completes.
// AWS Lambda + Next.js does not have that surface — cold starts
// are bounded (~500ms) and Lambda retries cold-start failures
// automatically. A startup probe would add complexity without
// the operational signal it provides in Kubernetes. Revisit if
// the workload migrates to a container runtime with longer init
// latency (e.g., DynamoDB-warmup, ML-model-load).

interface HealthResponse {
  readonly status: 'ok';
  readonly version: string;
  readonly timestamp: string;
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  // Raw `process.env` (not `@/lib/env`) by design: read per-GET at request
  // time (route handlers are the request-time tier the rendering-tier lint
  // rule exempts), and the unit test mutates it with `vi.stubEnv` per case —
  // `@t3-oss/env-nextjs` snapshots at import, so a validated-env read could
  // not observe that. NEXT_PUBLIC_BUILD_SHA is intentionally undeclared in
  // env.ts (optional, informational build stamp).
  // `||` (not `??`) so empty-string also falls through to `'unknown'`.
  // Vercel + SST + CI environments occasionally set the env var to
  // empty rather than unsetting it; treating both as "unknown" keeps
  // the response shape predictable.
  const buildSha = process.env['NEXT_PUBLIC_BUILD_SHA'];
  const body: HealthResponse = {
    status: 'ok',
    version: buildSha && buildSha.length > 0 ? buildSha : 'unknown',
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(body, {
    status: 200,
    headers: {
      'x-robots-tag': 'noindex, nofollow',
      'cache-control': 'no-store',
    },
  });
}
