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

import { cookies as nextCookies, headers as nextHeaders } from 'next/headers';
import { makeFetchApiClient, makeNoOpCircuitBreaker } from '@quilty/api-client';
import { CONSENT_COOKIE_NAME } from '@quilty/consent';
import { makeInMemoryConsentStore, makeServerConsentReader } from '@quilty/consent/server';
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
    // ConsentReader detects Sec-GPC: 1 on every read. Reads `headers()`
    // + `cookies()` from `next/headers` — both are available in
    // Edge-runtime Route Handlers (where this container is invoked).
    // The reader is NOT used from `proxy.ts` middleware; middleware
    // reads `request.headers` directly. See composition.server.ts for
    // the matching wiring on the Node runtime.
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
    // In-memory ConsentStore on the Edge tier. The adapter uses only
    // the Map Web API + plain JS — Edge-runtime-safe. The DynamoDB
    // adapter is server-only (AWS SDK is Node-only); when it activates,
    // a parallel Edge-compat fetch-based adapter ships here.
    consentStore: makeInMemoryConsentStore(),
    // ApiClient at the Edge tier (ADR-0017). Native-fetch + retry +
    // problem-details parsing — Edge-runtime-safe (no Node-only deps).
    // Same baseUrl + onRetry hook as the server composition; the
    // shared port surface keeps both runtimes behaviourally identical.
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
