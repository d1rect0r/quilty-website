/**
 * Client-runtime composition root.
 *
 * No `'use client'` directive — this module is not a React component and
 * is not imported by JSX. Client Components and client-side hooks call
 * `getContainer(makeClientContainer)` from their own bodies; those
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
  makeAmplitudeAnalytics,
  makeBrowserLogger,
  makeEnvFlagEvaluator,
  makeSentryErrorReporter,
  wrapAnalytics,
  wrapErrorReporter,
  wrapLogger,
} from '@quilty/observability';
import { makeCspBuilder, makeHeadersBuilder, makeSanitizer } from '@quilty/security';
import type { Container } from './lib/get-container';

export function makeClientContainer(): Container {
  const sanitizer = makeSanitizer();

  // Browser Logger (silent in production, console-only in development).
  // The CloudWatch adapter is Lambda-runtime-only — its console.log
  // would write to the user's DevTools console in the browser, a
  // direct D31/D42d leak surface even after sanitizer composition.
  const wrappedLogger = wrapLogger({
    adapter: makeBrowserLogger(),
    sanitizer,
  });

  return {
    sanitizer,
    // CspBuilder + HeadersBuilder are server-only by responsibility but
    // exposed in the client Container for type-shape consistency.
    // Client code MUST NOT call them (no body would render the right
    // value at request time).
    cspBuilder: makeCspBuilder(),
    headersBuilder: makeHeadersBuilder(),
    logger: wrappedLogger,
    analytics: wrapAnalytics({
      adapter: makeAmplitudeAnalytics({ logger: wrappedLogger }),
      consentReader: makeDefaultDenyConsentReader(),
      sanitizer,
    }),
    errorReporter: wrapErrorReporter({
      adapter: makeSentryErrorReporter(),
      sanitizer,
    }),
    featureFlags: makeEnvFlagEvaluator(),
  };
}
