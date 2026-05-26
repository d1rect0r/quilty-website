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
 *     modules consume the typed ports through the ServerContainer
 *     returned by getServerContainer().
 *   - All cross-cutting concerns compose HERE via the wrapper factories
 *     (wrapAnalytics, wrapErrorReporter, wrapLogger, wrapReplay) — never
 *     at call sites. The Cerebral-lesson chokepoint is the wrapper
 *     composition; the architectural seal is in ADR-0010.
 */

import 'server-only';

import { cookies as nextCookies, headers as nextHeaders } from 'next/headers';
import { makeFetchApiClient, makeNoOpCircuitBreaker } from '@quilty/api-client';
import { makeInMemoryCaptchaVerifier } from '@quilty/captcha';
import { CONSENT_COOKIE_NAME } from '@quilty/consent';
import { makeInMemoryConsentStore, makeServerConsentReader } from '@quilty/consent/server';
import { makeInMemoryEmailSender, wrapEmailSender } from '@quilty/email';
import { makeInMemoryRateLimiter } from '@quilty/rate-limit';
import {
  makeAmplitudeAnalytics,
  makeCloudWatchLogger,
  makeEnvFlagEvaluator,
  makePhiScrubber,
  makeSentryErrorReporter,
  wrapAnalytics,
  wrapErrorReporter,
  wrapLogger,
} from '@quilty/observability';
import { makeSanitizer } from '@quilty/security';
import type { ServerContainer } from './lib/get-container';

export function makeServerContainer(): ServerContainer {
  const sanitizer = makeSanitizer();

  // Logger is consumed by the Amplitude analytics stub for its pre-launch
  // CloudWatch emission, so it's constructed first.
  const wrappedLogger = wrapLogger({
    adapter: makeCloudWatchLogger(),
    sanitizer,
  });

  return {
    runtime: 'server',
    sanitizer,
    logger: wrappedLogger,
    // ConsentReader detects Sec-GPC: 1 from the request headers on
    // every read AND parses the consent cookie when the banner
    // activation writes it. Today the cookie is always null so the
    // reader returns the default-deny baseline — but GPC detection
    // is LIVE: a Sec-GPC: 1 request now surfaces `gpc_detected: true`
    // through the snapshot, which lets the wrapper enforce the
    // /.well-known/gpc.json commitment from day one rather than
    // silently falling back to the previous static `false`.
    analytics: wrapAnalytics({
      adapter: makeAmplitudeAnalytics({ logger: wrappedLogger }),
      consentReader: makeServerConsentReader({
        headers: async () => nextHeaders(),
        readConsentCookie: async () => {
          const cookieStore = await nextCookies();
          return cookieStore.get(CONSENT_COOKIE_NAME)?.value ?? null;
        },
      }),
      sanitizer,
      logger: wrappedLogger,
    }),
    errorReporter: wrapErrorReporter({
      adapter: makeSentryErrorReporter(),
      sanitizer,
    }),
    featureFlags: makeEnvFlagEvaluator(),
    phiScrubber: makePhiScrubber(),
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
    // In-memory ConsentStore (D63). Edge tier owns its own Map; the
    // cross-tier disjoint state is intentional pre-DynamoDB (auth
    // callback migrate() hits the no-op branch today). DynamoDB
    // activation gates on a single canonical store.
    consentStore: makeInMemoryConsentStore(),
    // ApiClient (ADR-0017) — outbound HTTPS to the Rust backend.
    // Native-fetch transport + exponential-backoff retry + W3C
    // traceparent injection + RFC 9457 Problem Details parsing.
    // CircuitBreaker is the no-op adapter today; opossum-backed
    // adapter activates at the cascading-failure trigger per
    // ADR-0017 Decision D. The `onRetry` callback logs to
    // CloudWatch via the wrapped logger — toast-on-retry is a
    // browser-side concern (server retries don't have a UI surface
    // since the user is awaiting the Lambda response).
    apiClient: makeFetchApiClient({
      baseUrl: process.env.QUILTY_API_BASE_URL ?? 'https://api.my-quilty.com',
      circuitBreaker: makeNoOpCircuitBreaker(),
      onRetry: (attempt, error) => {
        wrappedLogger.info('api_client_retry', {
          attempt,
          error_code:
            error && typeof error === 'object' && 'code' in error
              ? String((error as { code: unknown }).code)
              : 'unknown',
        });
      },
    }),
  };
}
