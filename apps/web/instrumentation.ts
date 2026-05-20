import { isSensitiveKey } from '@quilty/security';
import { registerOTel } from '@vercel/otel';

/**
 * OpenTelemetry-first instrumentation (D56). Sentry's JS SDK is OTel-native
 * under the hood since 2024-2025 — by writing OTel-first via @vercel/otel,
 * Sentry RUM + APM data flows automatically AND we stay vendor-neutral
 * (Datadog, Honeycomb, SigNoz, etc., remain swap-ready behind the same
 * span calls).
 *
 * W3C tracecontext + baggage propagators only (no B3, no Jaeger). The
 * propagators are the canonical 2026 picks; B3 is legacy Zipkin and
 * Jaeger is being absorbed into OTel.
 *
 * Per ADR-0004 + the LaunchDarkly outage lesson: instrumentation must
 * never hard-block the request. registerOTel returns silently on
 * misconfiguration; we tolerate that and let the rest of the request
 * succeed even if tracing isn't set up.
 */
export function register() {
  registerOTel({
    serviceName: 'quilty-web',
    // Sentry's Next.js SDK auto-registers as the OTLP exporter; @vercel/otel
    // picks it up. No explicit exporter config needed here.
  });
}

/**
 * `onRequestError` hook (Next.js 16 instrumentation API). Forwards
 * uncaught server-side errors to Sentry with span context attached.
 * Imported lazily so the Sentry SDK isn't loaded in environments where
 * SENTRY_DSN isn't configured.
 *
 * Pre-sanitizes the request payload before handing to Sentry — the
 * Sentry SDK's own `beforeSend` is the load-bearing defense (D67), but
 * this hook runs BEFORE that pipeline and the raw `request.headers`
 * Headers object would otherwise reach the SDK's serializer with PHI-
 * shaped auth headers intact (Round-5 final-QA HIPAA-CSP MEDIUM —
 * request must be strip + sanitize at the chokepoint).
 *
 * Headers stripped: cookie, set-cookie, authorization, x-auth-*, x-api-key,
 * x-forwarded-for, cf-connecting-ip — all enumerated in the sanitizer's
 * PHI key denylist.
 */

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Headers },
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string;
    routeType: 'render' | 'route' | 'action' | 'middleware';
  },
): Promise<void> {
  // Sentry 10.x `captureRequestError` expects a plain header record, not
  // a Headers object. Build a string-record so PHI keys are skipped at
  // the boundary (Round-5 final-QA HIPAA-CSP MEDIUM).
  const safeHeaders: Record<string, string> = {};
  for (const [key, value] of request.headers.entries()) {
    if (isSensitiveKey(key)) continue;
    safeHeaders[key] = value;
  }
  // Strip query string from path — defense-in-depth alongside D31 design
  // intent (URLs MUST NOT carry PHI; this guards against a future regression).
  const qIdx = request.path.indexOf('?');
  const safePath = qIdx === -1 ? request.path : request.path.slice(0, qIdx);

  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(
    err,
    { path: safePath, method: request.method, headers: safeHeaders },
    context,
  );
}
