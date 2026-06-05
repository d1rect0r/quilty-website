/**
 * Lazy Sentry CLIENT initialization (Next.js 16 + @sentry/nextjs 10).
 *
 * This module owns the entire `Sentry.init` + error-triggered Replay
 * wiring. It is NOT loaded on the client first-load critical path:
 * `instrumentation-client.ts` `import()`s it on browser idle so the
 * @sentry/nextjs vendor SDK (~48 KB gzipped) lands in a separate async
 * chunk instead of the shared first-load runtime. The size-limit
 * budgets (per ADR-0018) require Sentry as a separate lazy vendor
 * chunk, not in the framework/main/webpack first-load aggregate.
 *
 * The init is gated upstream by `shouldInitializeSentryClient()` in
 * `instrumentation-client.ts`, which reads `NEXT_PUBLIC_SENTRY_DSN`
 * WITHOUT importing this module — so the chunk is never even fetched
 * when no real DSN is provisioned.
 */

import { makePhiScrubber, makeSentryReplay, wrapReplay } from '@quilty/observability';
import { sanitize } from '@quilty/security';
import * as Sentry from '@sentry/nextjs';

/**
 * Runs `Sentry.init` + the error-triggered Replay init, then returns the
 * App Router transition-instrumentation hook so the caller can wire it
 * into the exported `onRouterTransitionStart` (Next.js convention).
 *
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
export function initSentryClient(): typeof Sentry.captureRouterTransitionStart {
  const phiScrubber = makePhiScrubber();

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
      // Generic `scrubSentryEvent<E>` infers `typeof event | null` — no cast.
      return phiScrubber.scrubSentryEvent(event);
    },

    beforeBreadcrumb(breadcrumb) {
      // Strip PHI-shaped fields from breadcrumb data + message. The message
      // is free text the Sentry SDK populates from navigation events, fetch
      // URLs, and console output — a fetch breadcrumb's message may contain
      // a query-string fragment if D31's URL-no-PHI invariant is ever
      // violated; sanitizing here defends in depth.
      if (breadcrumb.data) {
        breadcrumb.data = sanitize(breadcrumb.data);
      }
      if (breadcrumb.message) {
        breadcrumb.message = sanitize(breadcrumb.message);
      }
      return breadcrumb;
    },
  });

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
  if (typeof window !== 'undefined') {
    void wrapReplay({ adapter: makeSentryReplay() }).initialize();
  }

  return Sentry.captureRouterTransitionStart;
}
