import { sanitize } from '@quilty/security';
import { makePhiScrubber } from '@quilty/observability';
import * as Sentry from '@sentry/nextjs';

/**
 * Sentry server-side config per D42a + D67. Replay is client-only; the
 * server config is errors + traces (auto-consumed from OTel spans
 * emitted by instrumentation.ts).
 *
 * The `beforeSend` hook now delegates to the @quilty/observability
 * `PHIScrubber` port adapter (D67 + D148). The prior inline scrubbing
 * was duplicated across server / client / edge configs; the adapter
 * centralizes the chokepoint so a future Sentry SDK upgrade or a
 * vendor swap (Datadog, Honeycomb) is a single-adapter change.
 * The adapter is stateless — direct construction here (rather than
 * via the container singleton) avoids a circular dependency between
 * Sentry init (which runs at module load) and the composition root.
 */

const phiScrubber = makePhiScrubber();

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',

  tracesSampleRate: 0.1,

  beforeSend(event) {
    // The PHIScrubber returns a SentryEventLike subset of the SDK's
    // event shape. Cast back to the SDK's `Event` type — the
    // structural subset is preserved by `scrubSentryEvent`, which
    // only mutates fields that exist on the SDK shape.
    return phiScrubber.scrubSentryEvent(event) as typeof event | null;
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
