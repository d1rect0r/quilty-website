import * as Sentry from '@sentry/nextjs';
import { sanitize } from '@/lib/observability/sanitize';

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
    if (event.request) event.request = sanitize(event.request) as typeof event.request;
    return event;
  },
});
