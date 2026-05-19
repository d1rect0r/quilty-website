import * as Sentry from '@sentry/nextjs';
import { sanitize } from '@/lib/observability/sanitize';

/**
 * Sentry client-side config per D42a + D68 + D67.
 *
 * Replay posture (D68):
 *   - replaysSessionSampleRate: 0 — no always-on replay (HIPAA-aligned)
 *   - replaysOnErrorSampleRate: 1.0 — capture replay only when an error
 *     fires (debugging value vs PHI surface area trade-off)
 *   - maskAllText / blockAllMedia / maskAllInputs default-on
 *   - Clinical-state-implying controls additionally carry the
 *     `sentry-block` class (see lib/observability/replay-classes.ts)
 *   - Loaded lazily via `Sentry.lazyLoadIntegration` — the integration
 *     constructor + DOM serializer (~36 KB gzipped) only ship to the
 *     browser when an error actually fires, since replaysSessionSampleRate
 *     is 0. Recovered bundle weight per Round-5 perf-bundle reviewer H2.
 *
 * PHI sanitization via beforeSend (D67):
 *   - Belt-and-suspenders with logError()'s upstream sanitize() pass
 *   - Drops any breadcrumb or extra context containing PHI keys
 */

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',

  // Tracing — Sentry auto-consumes the OTel spans emitted from instrumentation.ts.
  tracesSampleRate: 0.1,

  // Replay — error-triggered only at M1 (HIPAA-aligned). The integration
  // is added below via lazyLoadIntegration so the worker chunk only
  // ships when an error actually fires.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // beforeSend — last line of defense. Any error payload that slipped
  // past logError()'s sanitize() pass gets scrubbed here too.
  beforeSend(event) {
    if (event.extra) event.extra = sanitize(event.extra) as Record<string, unknown>;
    if (event.contexts) event.contexts = sanitize(event.contexts) as typeof event.contexts;
    if (event.tags) event.tags = sanitize(event.tags) as typeof event.tags;
    // event.request added per Round-5 HIPAA reviewer — Sentry browser SDK
    // auto-populates request.url + request.headers + request.cookies on
    // the client side. Even though D31 says URLs never carry PHI, that's
    // design intent not enforcement; sanitize at the boundary too.
    if (event.request) {
      // Strip query string from request.url — defense-in-depth alongside
      // the D31 design intent (Round-5 final-QA HIPAA-CSP MEDIUM).
      if (event.request.url) {
        const qIdx = event.request.url.indexOf('?');
        if (qIdx !== -1) event.request.url = event.request.url.slice(0, qIdx);
      }
      event.request = sanitize(event.request) as typeof event.request;
    }
    return event;
  },

  beforeBreadcrumb(breadcrumb) {
    // Strip PHI-shaped fields from breadcrumb data before they're stored.
    if (breadcrumb.data) {
      breadcrumb.data = sanitize(breadcrumb.data) as Record<string, unknown>;
    }
    return breadcrumb;
  },
});

/**
 * Lazy-load the Replay integration. `lazyLoadIntegration` returns a Promise
 * that resolves to the integration constructor only after the DOM
 * serializer chunk has been fetched. Combined with `replaysSessionSampleRate: 0`
 * + `replaysOnErrorSampleRate: 1.0`, this means the replay chunk is fetched
 * only when an error actually fires — recovering ~36 KB from the initial
 * client bundle (Round-5 perf-bundle reviewer H2).
 *
 * If the lazy load fails (offline, CSP block, etc.) we silently swallow —
 * losing replay on errors is acceptable; losing the entire app is not.
 */
if (typeof window !== 'undefined') {
  void Sentry.lazyLoadIntegration('replayIntegration')
    .then((replayIntegration) => {
      Sentry.addIntegration(
        replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
          maskAllInputs: true,
        }),
      );
    })
    .catch(() => {
      // Replay unavailable — Sentry continues to capture errors without it.
    });
}
