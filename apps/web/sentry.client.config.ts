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

  // Replay — error-triggered only at M1 (HIPAA-aligned).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
      maskAllInputs: true,
    }),
  ],

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
    if (event.request) event.request = sanitize(event.request) as typeof event.request;
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
