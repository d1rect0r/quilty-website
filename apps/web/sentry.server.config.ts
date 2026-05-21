import { sanitize } from '@quilty/security';
import * as Sentry from '@sentry/nextjs';

/**
 * Sentry server-side config per D42a + D67. Replay is client-only; the
 * server config is errors + traces (auto-consumed from OTel spans
 * emitted by instrumentation.ts).
 */

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',

  tracesSampleRate: 0.1,

  beforeSend(event) {
    if (event.extra) event.extra = sanitize(event.extra) as Record<string, unknown>;
    if (event.contexts) event.contexts = sanitize(event.contexts) as typeof event.contexts;
    if (event.tags) event.tags = sanitize(event.tags) as typeof event.tags;
    if (event.request) {
      // Strip query string from request.url — D31 forbids PHI in URLs,
      // but defence-in-depth catches a future URL that drifts.
      if (event.request.url) {
        const qIdx = event.request.url.indexOf('?');
        if (qIdx !== -1) event.request.url = event.request.url.slice(0, qIdx);
      }
      event.request = sanitize(event.request) as typeof event.request;
    }
    return event;
  },

  // Strip PHI-shaped fields from breadcrumb data — parity with the
  // client config (Sentry's server SDK collects breadcrumbs too).
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.data) {
      breadcrumb.data = sanitize(breadcrumb.data) as Record<string, unknown>;
    }
    if (breadcrumb.message) {
      breadcrumb.message = sanitize(breadcrumb.message);
    }
    return breadcrumb;
  },
});
