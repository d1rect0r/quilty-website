/**
 * Client-runtime composition root.
 *
 * No `'use client'` directive — this module is not a React component and
 * is not imported by JSX. Client Components and client-side hooks call
 * `getClientContainer(makeClientContainer)` from their own bodies; those
 * callers carry their own `'use client'` directive when the call site
 * lives inside a React module.
 *
 * Vendor matrix per the locked decision (D42b revision):
 *   - Sentry browser SDK for error reporting + error-triggered Replay
 *     (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`).
 *   - Amplitude browser SDK for ANALYTICS + EXPERIMENTS ONLY. Amplitude
 *     Session Replay is rejected per D68 — the HTML-attribute leak on
 *     `alt`/`title`/`placeholder`/`aria-label`/`value`/`data-*` is
 *     structurally unsafe on a clinical surface even with Enterprise
 *     BAA. Sentry Replay is the only replay vendor.
 *   - WebVitalsReporter is wired by app/layout.tsx directly — it does
 *     not consume the Container at render time because the Container's
 *     Logger isn't serializable across the RSC boundary.
 *
 * See ADR-0010 for the composition-root rationale + the Cerebral-lesson
 * wrapper invariants.
 */

import { makeDefaultDenyConsentReader } from '@quilty/consent';
import {
  makeAmplitudeBrowserAnalytics,
  makeBrowserLogger,
  makeEnvFlagEvaluator,
  makePhiScrubber,
  makeSentryErrorReporter,
  wrapAnalytics,
  wrapErrorReporter,
  wrapLogger,
} from '@quilty/observability';
import { makeInMemorySearchIndex } from '@quilty/search/testing';
import { makeSanitizer } from '@quilty/security';
import { getTypedFlag } from './lib/flags/features';
import type { ClientContainer } from './lib/get-container';

export function makeClientContainer(): ClientContainer {
  const sanitizer = makeSanitizer();

  // Browser Logger (silent in production, console-only in development).
  // The CloudWatch adapter is Lambda-runtime-only — its console.log
  // would write to the user's DevTools console in the browser, a
  // direct D31/D42d leak surface even after sanitizer composition.
  const wrappedLogger = wrapLogger({
    adapter: makeBrowserLogger(),
    sanitizer,
  });

  // Feature flags constructed first: the Amplitude browser adapter's
  // activation is gated on `analytics_client_enabled`. With the flag off
  // (default) or no public API key the adapter stays dormant (log-only,
  // zero beacon); consent + GPC remain enforced upstream by wrapAnalytics.
  const featureFlags = makeEnvFlagEvaluator();
  const analyticsClientEnabled = getTypedFlag(featureFlags, 'analytics_client_enabled');

  return {
    runtime: 'client',
    sanitizer,
    logger: wrappedLogger,
    analytics: wrapAnalytics({
      // See composition.server.ts for the destination fan-out rationale.
      destinations: new Map([
        [
          'product-analytics',
          makeAmplitudeBrowserAnalytics({
            logger: wrappedLogger,
            apiKey: process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY,
            enabled: analyticsClientEnabled,
          }),
        ],
      ]),
      consentReader: makeDefaultDenyConsentReader(),
      sanitizer,
      // Observability for a chronically broken ConsentReader — a
      // silently-failing reader would otherwise drop 100% of
      // analytics with no signal.
      logger: wrappedLogger,
    }),
    errorReporter: wrapErrorReporter({
      adapter: makeSentryErrorReporter(),
      sanitizer,
    }),
    featureFlags,
    phiScrubber: makePhiScrubber(),
    // SearchIndex (ADR-0019). In-memory fake is the default wiring
    // because Pagefind would have nothing to index (zero MDX
    // content). The wiring flips to makePagefindAdapter() at content
    // activation per ADR-0019 Decision H + the trigger-watchlist.
    searchIndex: makeInMemorySearchIndex({ documents: [] }),
  };
}
