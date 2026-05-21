import { sanitize } from '@quilty/security';
import * as Sentry from '@sentry/nextjs';

/**
 * Sentry Edge-runtime config per D42a + D67. Used by proxy.ts (Next.js
 * 16 file convention per audit review) + any Route Handler running on
 * the Edge.
 */

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',

  tracesSampleRate: 0.1,

  beforeSend(event) {
    if (event.extra) event.extra = sanitize(event.extra) as Record<string, unknown>;
    if (event.contexts) event.contexts = sanitize(event.contexts) as typeof event.contexts;
    if (event.tags) event.tags = sanitize(event.tags) as typeof event.tags;
    // Exception message + top-level message strings — D67 chokepoint
    // alongside the wrapErrorReporter port boundary. The Sentry SDK
    // serializes `error.message` into `exception.values[i].value`,
    // which would otherwise carry a Zod or template-literal free
    // text payload unsanitized.
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (typeof ex.value === 'string') ex.value = sanitize(ex.value);
      }
    }
    if (typeof event.message === 'string') event.message = sanitize(event.message);
    if (event.request) {
      // Edge handlers can also carry request body data when a streamed
      // request errors mid-flight; null unconditionally before
      // sanitize() since the key-denylist won't reach a body whose
      // field name is not on the denylist.
      event.request.data = undefined;
      if (event.request.url) {
        const qIdx = event.request.url.indexOf('?');
        if (qIdx !== -1) event.request.url = event.request.url.slice(0, qIdx);
      }
      event.request = sanitize(event.request) as typeof event.request;
    }
    return event;
  },

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
