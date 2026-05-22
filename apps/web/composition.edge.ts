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

import { makeDefaultDenyConsentReader } from '@quilty/consent';
import {
  makeAmplitudeAnalytics,
  makeCloudWatchLogger,
  makeEnvFlagEvaluator,
  makeSentryErrorReporter,
  wrapAnalytics,
  wrapErrorReporter,
  wrapLogger,
} from '@quilty/observability';
import { makeSanitizer } from '@quilty/security';
import type { EdgeContainer } from './lib/get-container';

export function makeEdgeContainer(): EdgeContainer {
  const sanitizer = makeSanitizer();

  const wrappedLogger = wrapLogger({
    adapter: makeCloudWatchLogger(),
    sanitizer,
  });

  return {
    runtime: 'edge',
    sanitizer,
    logger: wrappedLogger,
    // GPC-propagation TODO: switch this reader to a request-scoped
    // one calling `detectGpcFromHeaders(request)` before the consent
    // banner activates — otherwise the live Sec-GPC: 1 signal is
    // silently bypassed at the edge even though `/.well-known/gpc.json`
    // commits to honoring it.
    analytics: wrapAnalytics({
      adapter: makeAmplitudeAnalytics({ logger: wrappedLogger }),
      consentReader: makeDefaultDenyConsentReader(),
      sanitizer,
      logger: wrappedLogger,
    }),
    errorReporter: wrapErrorReporter({
      adapter: makeSentryErrorReporter(),
      sanitizer,
    }),
    featureFlags: makeEnvFlagEvaluator(),
  };
}
