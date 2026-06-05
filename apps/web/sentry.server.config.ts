import { sanitize } from '@quilty/security';
import { makePhiScrubber } from '@quilty/observability';
import * as Sentry from '@sentry/nextjs';
import { isSentryDsnCspCoherent } from './lib/observability/sentry-dsn-gate';

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
 *
 * DSN host gate (data-residency hardening): like the client gate, init
 * is skipped unless the DSN is a CSP-coherent US-pinned Sentry host, so
 * a misconfigured non-US/non-pinned DSN no-ops instead of routing error
 * payloads to the wrong region.
 */

const phiScrubber = makePhiScrubber();

if (isSentryDsnCspCoherent(process.env.NEXT_PUBLIC_SENTRY_DSN)) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',

    tracesSampleRate: 0.1,

    beforeSend(event) {
      // Generic `scrubSentryEvent<E>` infers the SDK's `Event` type back —
      // the `{...event}` spread preserves every field, so no cast is needed.
      return phiScrubber.scrubSentryEvent(event);
    },

    // Strip PHI-shaped fields from breadcrumb data — parity with the
    // client config (Sentry's server SDK collects breadcrumbs too).
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data) {
        breadcrumb.data = sanitize(breadcrumb.data);
      }
      if (breadcrumb.message) {
        breadcrumb.message = sanitize(breadcrumb.message);
      }
      return breadcrumb;
    },
  });
}
