import { isSensitiveKey } from '@quilty/security';
/**
 * Sentry SERVER + EDGE initialization (Next.js 16 instrumentation API).
 *
 * `@sentry/nextjs` v10 is OTel-native and OWNS the OpenTelemetry tracer
 * provider: `Sentry.init` (run by the dynamic imports below) installs the
 * context manager, propagator, and span processor, and auto-captures any
 * span started via `@opentelemetry/api`. We therefore do NOT register a
 * separate `@vercel/otel` provider — two providers compete for the global
 * context manager and silently break request isolation + trace linking
 * (Sentry's documented "existing OTel setup" conflict). Vendor-neutrality
 * is preserved: spans still flow through the standard `@opentelemetry/api`
 * (which `@quilty/api-client` uses for W3C traceparent), and a future
 * backend swap (Datadog/Honeycomb) re-introduces an OTLP exporter behind
 * the same span calls.
 *
 * This REVISES D56's "OTel-first via @vercel/otel" mechanism: the original
 * premise that "Sentry auto-registers as the OTLP exporter and @vercel/otel
 * picks it up" is inverted for @sentry/nextjs v10, where Sentry is itself
 * the OTel layer. See ADR-0004 + the strategy-doc update log.
 *
 * Ordering: Sentry.init must own OTel before anything else sets up a
 * provider; importing the runtime config first in `register()` guarantees
 * that. Per ADR-0004 + the LaunchDarkly outage lesson, init must never
 * hard-block the request — the SDK no-ops on a missing/empty DSN.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
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
 * shaped auth headers intact (HIPAA-CSP MEDIUM —
 * request must be strip + sanitize at the chokepoint).
 *
 * Headers stripped: cookie, set-cookie, authorization, x-auth-*, x-api-key,
 * x-forwarded-for, cf-connecting-ip — all enumerated in the sanitizer's
 * PHI key denylist.
 */

export async function onRequestError(
  err: unknown,
  request: {
    path: string;
    method: string;
    // Next.js 16 passes `headers` as a plain Record<string, string | string[] | undefined>,
    // not a fetch `Headers` instance. Treating it as the latter throws
    // `headers.entries is not a function` at every invocation and
    // silently kills the Sentry capture path. Type accordingly + walk
    // entries via Object.entries.
    headers: Record<string, string | string[] | undefined>;
  },
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string;
    routeType: 'render' | 'route' | 'action' | 'middleware';
  },
): Promise<void> {
  // Sentry 10.x `captureRequestError` expects a plain header record.
  // Walk Object.entries (the Next 16 headers shape) and reject PHI-shaped
  // keys at the boundary so the SDK's serializer never sees them.
  const safeHeaders: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(request.headers)) {
    if (rawValue === undefined) continue;
    if (isSensitiveKey(key)) continue;
    safeHeaders[key] = Array.isArray(rawValue) ? rawValue.join(', ') : rawValue;
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
