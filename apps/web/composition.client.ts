/**
 * Client-runtime composition root.
 *
 * No `'use client'` directive — this module is not a React component and is
 * not imported by JSX. Client Components and client-side hooks call
 * `getContainer(makeClientContainer)` from their own bodies; those callers
 * carry their own `'use client'` directive when the call site lives inside a
 * React module.
 *
 * Invoked from Client Components and client-side hooks. Wires browser
 * adapters per the locked vendor matrix:
 *
 *   - Sentry browser SDK with error-triggered replay per D68
 *     (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`)
 *   - Amplitude browser SDK for ANALYTICS + EXPERIMENTS ONLY. Amplitude
 *     Session Replay is rejected per D68 — the HTML-attribute leak on
 *     `alt`/`title`/`placeholder`/`aria-label`/`value`/`data-*` is
 *     structurally unsafe on a clinical surface even with Enterprise
 *     BAA. Sentry Replay (mask-all + block clinical controls) is the
 *     only replay vendor.
 *   - WebVitalsReporter (sanitized via @quilty/observability's logger).
 *
 * See ADR-0010 for the composition-root rationale.
 *
 * Discipline mirrors the server composition root: adapters live here only,
 * cross-cutting wrappers compose here only (consent gate per D35 / Cerebral
 * lesson MUST wrap analytics; PHI sanitizer per D67 MUST wrap error
 * reporter + logger), consumers consume the typed Container.
 *
 * The Container is empty at the scaffold commit; widened as @quilty/*
 * packages land in subsequent extraction commits.
 */

import { makeCspBuilder, makeHeadersBuilder, makeSanitizer } from '@quilty/security';
import type { Container } from './lib/get-container';

export function makeClientContainer(): Container {
  return {
    // Sanitizer ships in the client bundle so client-side analytics adapters
    // (Amplitude browser SDK) scrub PHI before emitting per D67.
    sanitizer: makeSanitizer(),
    // CspBuilder + HeadersBuilder are server-only by responsibility but
    // exposed in the client Container for type-shape consistency. Client
    // code MUST NOT call them (no body would render the right value at
    // request time).
    cspBuilder: makeCspBuilder(),
    headersBuilder: makeHeadersBuilder(),
    // Filled as remaining @quilty/* packages land:
    //   observability — Sentry browser SDK (error-triggered replay) +
    //                   Amplitude analytics/experiments adapter wrapped
    //                   with the ConsentStore-gated wrapper per D35 +
    //                   WebVitalsReporter
    //   consent       — ConsentStore client reader + Banner UI consumer
    //   captcha       — Turnstile widget render helper
  };
}
