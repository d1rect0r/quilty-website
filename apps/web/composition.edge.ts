/**
 * Edge-runtime composition root.
 *
 * Invoked from the Next.js 16 proxy.ts handler (Edge runtime). Wires
 * only the ports that have edge-runtime-compatible adapters:
 * CspBuilder + HeadersBuilder (string composition, no Node APIs),
 * Sanitizer (Web Crypto), the Sentry edge SDK for errors, the
 * CloudWatch-style logger (`console.log`), and the env-flag evaluator
 * (synchronous `process.env` reads).
 *
 * Discipline: no Node-only APIs (no `fs`, no `Buffer`, no Node `crypto`
 * — Edge exposes the Web Crypto API instead). Vendor SDKs imported here
 * must publish an Edge-compatible build.
 *
 * Replay wires the in-memory stub on the Edge — the Sentry browser
 * Replay integration is browser-only by design.
 */

import {
  makeAmplitudeAnalytics,
  makeCloudWatchLogger,
  makeDefaultDenyConsentReader,
  makeEnvFlagEvaluator,
  makeSentryErrorReporter,
  wrapAnalytics,
  wrapErrorReporter,
  wrapLogger,
} from '@quilty/observability';
import { makeCspBuilder, makeHeadersBuilder, makeSanitizer } from '@quilty/security';
import type { Container } from './lib/get-container';

export function makeEdgeContainer(): Container {
  const sanitizer = makeSanitizer();

  const wrappedLogger = wrapLogger({
    adapter: makeCloudWatchLogger(),
    sanitizer,
  });

  return {
    sanitizer,
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
