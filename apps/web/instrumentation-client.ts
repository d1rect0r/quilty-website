import { makePhiScrubber, makeSentryReplay, wrapReplay } from '@quilty/observability';
import { sanitize } from '@quilty/security';
import * as Sentry from '@sentry/nextjs';

/**
 * Sentry CLIENT initialization (Next.js 16 + @sentry/nextjs 10 convention).
 *
 * This is the canonical browser-init file: Next.js auto-loads
 * `instrumentation-client.ts` on the client, and `withSentryConfig`
 * (next.config.ts) wires it into the build. It REPLACES the legacy
 * `sentry.client.config.ts` (deleted) — which was orphaned (nothing
 * imported it) so `Sentry.init` never ran on the client.
 */

const phiScrubber = makePhiScrubber();

/**
 * Gate Sentry init on a CSP-coherent DSN host. The portal CSP
 * `connect-src` only allows the pinned `o<orgId>.ingest.us.sentry.io`
 * subdomain (per the csp-builder `pinnedSentryHostOrNull` policy).
 * If the DSN points at a non-pinned host, every SDK POST would be
 * CSP-blocked and the browser would emit a violation report on
 * every transport attempt — a runaway feedback loop where every
 * CSP-violation report itself fires a CSP-violation report.
 *
 * Returning `false` here skips `Sentry.init()` entirely; the SDK's
 * exported APIs no-op when uninitialised, so no transport, no loop,
 * no console error spam. Operators see no Sentry events until they
 * provision a real canonical DSN — which is why this wiring is safe to
 * land before the Sentry project + DSN are provisioned at deploy.
 */
function shouldInitializeSentryClient(): boolean {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (typeof dsn !== 'string' || dsn.trim().length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  // Same shape the CSP pin enforces server-side.
  return /^o[0-9]+\.ingest\.us\.sentry\.io$/.test(parsed.hostname);
}

/**
 * Sentry client-side config per D42a + D68 + D67.
 *
 * Replay posture (D68):
 *   - replaysSessionSampleRate: 0 — no always-on replay (HIPAA-aligned)
 *   - replaysOnErrorSampleRate: 1.0 — capture replay only when an error
 *     fires (debugging value vs PHI surface area trade-off)
 *   - maskAllText / blockAllMedia / maskAllInputs default-on (enforced
 *     by the wrapReplay floor in @quilty/observability)
 *   - Clinical-state-implying controls additionally carry the
 *     REPLAY_BLOCK_CLASS constant exported from @quilty/observability
 *   - Loaded lazily via `Sentry.lazyLoadIntegration` (inside the
 *     makeSentryReplay adapter) — the integration constructor + DOM
 *     serializer (~36 KB gzipped) only ship to the browser when an
 *     error actually fires, since replaysSessionSampleRate is 0
 *
 * PHI sanitization via beforeSend (D67):
 *   - Belt-and-suspenders with the @quilty/observability wrappers'
 *     upstream sanitize() pass at the port boundary
 *   - Drops any breadcrumb or extra context containing PHI keys
 */

const SENTRY_CLIENT_ENABLED = shouldInitializeSentryClient();

if (SENTRY_CLIENT_ENABLED) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',

    // Tracing — Sentry owns the OpenTelemetry tracer provider (v10) and
    // auto-consumes spans started via @opentelemetry/api. See
    // instrumentation.ts for the server-side OTel-ownership rationale.
    tracesSampleRate: 0.1,

    // Replay — error-triggered only (HIPAA-aligned, per D68). The
    // integration is added below via lazyLoadIntegration so the worker
    // chunk only ships when an error actually fires.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    // beforeSend — last line of defense. The PHIScrubber adapter
    // (D67 + D148) centralises the chokepoint logic that previously was
    // duplicated across server / client / edge configs. See
    // sentry.server.config.ts for the chokepoint rationale.
    beforeSend(event) {
      return phiScrubber.scrubSentryEvent(event) as typeof event | null;
    },

    beforeBreadcrumb(breadcrumb) {
      // Strip PHI-shaped fields from breadcrumb data + message. The message
      // is free text the Sentry SDK populates from navigation events, fetch
      // URLs, and console output — a fetch breadcrumb's message may contain
      // a query-string fragment if D31's URL-no-PHI invariant is ever
      // violated; sanitizing here defends in depth.
      if (breadcrumb.data) {
        breadcrumb.data = sanitize(breadcrumb.data) as Record<string, unknown>;
      }
      if (breadcrumb.message) {
        breadcrumb.message = sanitize(breadcrumb.message);
      }
      return breadcrumb;
    },
  });
}

/**
 * Replay integration is added through `wrapReplay` so the D68 floor
 * (`sessionSampleRate: 0`, mask + block defaults) is enforced via the
 * port wrapper rather than a raw `Sentry.addIntegration` call. The
 * underlying adapter still uses `Sentry.lazyLoadIntegration` so the DOM
 * serializer chunk (~36 KB gzipped) is fetched only when an error fires.
 *
 * The wrapper is intentionally NOT wired through the Container — this is
 * the single Replay init site by design. A dual path (config file +
 * Container property) would create two init code paths with different
 * enforcement coverage.
 */
if (SENTRY_CLIENT_ENABLED && typeof window !== 'undefined') {
  void wrapReplay({ adapter: makeSentryReplay() }).initialize();
}

/**
 * Instruments App Router client-side navigations (the v10
 * `instrumentation-client.ts` API). Exported unconditionally — it is a
 * no-op until `Sentry.init` has run, so it is safe even when the client
 * SDK is gated off by `shouldInitializeSentryClient`.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
