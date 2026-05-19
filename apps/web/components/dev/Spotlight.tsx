'use client';

import { useEffect } from 'react';

/**
 * Sentry Spotlight — local dev-only debug overlay for Sentry events,
 * OTel spans, replay sessions, and breadcrumbs.
 *
 * Lets us inspect what the production Sentry pipeline would see WITHOUT
 * burning Business-tier event quota. Drops into the page as a toolbar
 * (bottom-right by default) when `process.env.NODE_ENV === 'development'`.
 *
 * Why Spotlight (not just Sentry Dashboard):
 *   - Sentry Dashboard is paid quota; every dev local-test would
 *     consume an event we'd rather save for production errors.
 *   - Spotlight intercepts the same Sentry SDK payloads at the
 *     transport layer and renders them locally — verifies the PHI
 *     sanitizer chokepoint (D67) is actually scrubbing the fields it
 *     claims to scrub, BEFORE deploy.
 *   - Documented Sentry-supported pattern (2025+).
 *
 * Production: this component is gated to dev only. The dynamic import
 * keeps Spotlight out of the production client bundle entirely.
 *
 * Tree-shaking: this component is a Client Component imported from
 * app/layout.tsx only when NODE_ENV !== 'production'. Next.js's
 * production minifier folds the dev-only branch.
 */
export function Spotlight() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    // Use @spotlightjs/overlay's `_init` (non-deprecated; the public
    // `init` is documented as deprecated in 4.5.0). The 4.x API
    // simplified the options surface to sidecarUrl + debug; toolbar
    // anchor + open-state are now configured via Spotlight's own UI
    // once mounted.
    void import('@spotlightjs/overlay').then(({ _init }) => {
      void _init({ debug: false });
    });
  }, []);

  return null;
}
