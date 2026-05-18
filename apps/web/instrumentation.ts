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
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(err, request, context);
}
