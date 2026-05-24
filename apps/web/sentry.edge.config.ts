import { sanitize } from '@quilty/security';
import { makePhiScrubber } from '@quilty/observability';
import * as Sentry from '@sentry/nextjs';

/**
 * Sentry Edge-runtime config per D42a + D67. Used by proxy.ts (Next.js
 * 16 file convention) + any Route Handler running on the Edge.
 *
 * The `beforeSend` hook delegates to the @quilty/observability
 * `PHIScrubber` port adapter (Commit 31). See sentry.server.config.ts
 * for the chokepoint-centralization rationale + why direct
 * `makePhiScrubber()` construction here (vs container singleton)
 * avoids a circular dependency with composition-root init.
 */

const phiScrubber = makePhiScrubber();

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',

  tracesSampleRate: 0.1,

  beforeSend(event) {
    return phiScrubber.scrubSentryEvent(event) as typeof event | null;
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
