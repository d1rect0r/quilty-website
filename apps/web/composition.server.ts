/**
 * Server-runtime composition root.
 *
 * Invoked from Server Components, Route Handlers, server actions, and the
 * proxy.ts handler. Wires server-side adapters: Sentry server SDK, the
 * Amplitude analytics adapter (currently a logger-only stub until the
 * BAA upgrade lands), CloudWatch logger, env-var feature flags. The
 * Replay port wires the in-memory adapter on the server (Sentry Replay
 * is browser-only). See ADR-0010 for the composition-root rationale.
 *
 * Discipline:
 *   - Adapter modules are imported here and ONLY here in apps/web. Other
 *     modules consume the typed ports through the Container returned by
 *     getContainer().
 *   - All cross-cutting concerns compose HERE via the wrapper factories
 *     (wrapAnalytics, wrapErrorReporter, wrapLogger, wrapReplay) — never
 *     at call sites. The Cerebral-lesson chokepoint is the wrapper
 *     composition; the architectural seal is in ADR-0010.
 */

import 'server-only';

import { makeInMemoryCaptchaVerifier } from '@quilty/captcha';
import { makeDefaultDenyConsentReader } from '@quilty/consent';
import { makeInMemoryEmailSender, wrapEmailSender } from '@quilty/email';
import { makeInMemoryRateLimiter } from '@quilty/rate-limit';
import {
  makeAmplitudeAnalytics,
  makeCloudWatchLogger,
  makeEnvFlagEvaluator,
  makeSentryErrorReporter,
  wrapAnalytics,
  wrapErrorReporter,
  wrapLogger,
} from '@quilty/observability';
import { makeCspBuilder, makeHeadersBuilder, makeSanitizer } from '@quilty/security';
import type { Container } from './lib/get-container';

export function makeServerContainer(): Container {
  const sanitizer = makeSanitizer();

  // Logger is consumed by the Amplitude analytics stub for its pre-launch
  // CloudWatch emission, so it's constructed first.
  const wrappedLogger = wrapLogger({
    adapter: makeCloudWatchLogger(),
    sanitizer,
  });

  return {
    sanitizer,
    cspBuilder: makeCspBuilder(),
    headersBuilder: makeHeadersBuilder(),
    logger: wrappedLogger,
    // Default-deny ConsentReader baseline; the composition root swaps
    // this for the real cookie-aware @quilty/consent server reader at
    // the banner activation without changing the wrapper API.
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
    // In-memory adapter is the production wiring today; the SES
    // adapter activates once the DMARC ramp + BAA inventory both list
    // SES as covered (see docs/runbook/*.md). The wrapper composes the
    // PHI sanitizer chokepoint around the adapter per D67.
    emailSender: wrapEmailSender({
      adapter: makeInMemoryEmailSender(),
      sanitizer,
    }),
    // Default-pass in-memory verifier today (no widget rendered yet).
    // Turnstile activates once the Cloudflare BAA + secret-key
    // provisioning are both green (see docs/runbook/baa-inventory.md).
    captchaVerifier: makeInMemoryCaptchaVerifier(),
    // In-memory sliding-window limiter is the production wiring at
    // today — load-bearing for auth-adjacent paths. The DynamoDB
    // adapter activates once the table + Lambda IAM grant ship.
    rateLimiter: makeInMemoryRateLimiter(),
  };
}
