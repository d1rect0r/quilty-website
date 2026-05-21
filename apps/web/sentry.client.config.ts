import { makeSentryReplay, wrapReplay } from '@quilty/observability';
import { sanitize } from '@quilty/security';
import * as Sentry from '@sentry/nextjs';

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

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',

  // Tracing — Sentry auto-consumes the OTel spans emitted from instrumentation.ts.
  tracesSampleRate: 0.1,

  // Replay — error-triggered only (HIPAA-aligned, per D68). The
  // integration is added below via lazyLoadIntegration so the worker
  // chunk only ships when an error actually fires.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // beforeSend — last line of defense. Any error payload that slipped
  // past logError()'s sanitize() pass gets scrubbed here too.
  beforeSend(event) {
    if (event.extra) event.extra = sanitize(event.extra) as Record<string, unknown>;
    if (event.contexts) event.contexts = sanitize(event.contexts) as typeof event.contexts;
    if (event.tags) event.tags = sanitize(event.tags) as typeof event.tags;
    // The exception message + top-level message strings are the path
    // through which a Zod validation error or template-literal throw
    // can carry user-typed free text — wrapErrorReporter sanitizes
    // the context object but forwards the raw Error to the adapter,
    // so the SDK serializes `error.message` straight into
    // `exception.values[i].value`. Sanitize at the SDK boundary too
    // (D67 belt-and-suspenders alongside the planned ESLint rule).
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (typeof ex.value === 'string') ex.value = sanitize(ex.value);
      }
    }
    if (typeof event.message === 'string') event.message = sanitize(event.message);
    // event.request added per architecture lock HIPAA reviewer — Sentry browser SDK
    // auto-populates request.url + request.headers + request.cookies on
    // the client side. Even though D31 says URLs never carry PHI, that's
    // design intent not enforcement; sanitize at the boundary too.
    if (event.request) {
      // Strip query string from request.url — defense-in-depth alongside
      // the D31 design intent .
      if (event.request.url) {
        const qIdx = event.request.url.indexOf('?');
        if (qIdx !== -1) event.request.url = event.request.url.slice(0, qIdx);
      }
      event.request = sanitize(event.request) as typeof event.request;
    }
    return event;
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
