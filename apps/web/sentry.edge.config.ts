import { sanitize } from '@quilty/security';
import { makePhiScrubber } from '@quilty/observability';
import * as Sentry from '@sentry/nextjs';
import { isSentryDsnCspCoherent } from './lib/observability/sentry-dsn-gate';

/**
 * Sentry Edge-runtime config per D42a + D67. Used by proxy.ts (Next.js
 * 16 file convention) + any Route Handler running on the Edge.
 *
 * The `beforeSend` hook delegates to the @quilty/observability
 * `PHIScrubber` port adapter (D67 + D148). See sentry.server.config.ts
 * for the chokepoint-centralization rationale + why direct
 * `makePhiScrubber()` construction here (vs container singleton)
 * avoids a circular dependency with composition-root init.
 *
 * DSN host gate (data-residency hardening): init is skipped unless the
 * DSN is a CSP-coherent US-pinned Sentry host, so a misconfigured
 * non-US/non-pinned DSN no-ops instead of routing payloads off-region.
 */

const phiScrubber = makePhiScrubber();

if (isSentryDsnCspCoherent(process.env.NEXT_PUBLIC_SENTRY_DSN)) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',

    tracesSampleRate: 0.1,

    beforeSend(event) {
      // Generic `scrubSentryEvent<E>` infers the SDK's `Event` type back — the
      // `{...event}` spread preserves every field, so no cast is needed.
      return phiScrubber.scrubSentryEvent(event);
    },

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
