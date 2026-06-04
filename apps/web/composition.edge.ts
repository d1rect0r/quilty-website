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
import { makeInMemoryGuestStateStore } from '@quilty/guest-state/server';
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
import {
  assertInMemoryAdapterAllowed,
  resolveInMemoryGuardContext,
  shouldEmitInMemoryAuditLog,
} from './lib/fail-closed';
import type { EdgeContainer } from './lib/get-container';

export function makeEdgeContainer(): EdgeContainer {
  const sanitizer = makeSanitizer();

  const wrappedLogger = wrapLogger({
    adapter: makeCloudWatchLogger(),
    sanitizer,
  });

  // Fail-closed adapter selection (ADR-0030) — same policy as the server
  // root. The edge tier serves real production traffic, so its in-memory
  // ConsentStore (consent-state-bearing, D35) + GuestStateStore (ADR-0029 F)
  // must not silently ship. The edge reads process.env directly (no
  // lib/env.ts import) to stay free of the build-time-validation module on
  // the edge runtime. The Edge-compat DynamoDB adapters are fetch-based and
  // ship when their tables are provisioned — table-env presence then trips
  // the guard's "wire the real adapter" branch here just as on the server.
  const { isProductionRuntime, allowInMemory } = resolveInMemoryGuardContext();
  const guardInMemoryAdapter = (name: string, realActivationEnv: string | undefined): void => {
    const { action } = assertInMemoryAdapterAllowed({
      name,
      isProductionRuntime,
      allowInMemory,
      realActivationEnv,
    });
    if (action === 'warn-and-use' && shouldEmitInMemoryAuditLog(name)) {
      wrappedLogger.warn('inmemory_adapter_in_production', { adapter: name });
    }
  };
  guardInMemoryAdapter('consent-store', process.env.QUILTY_CONSENT_TABLE);
  guardInMemoryAdapter('guest-state-store', process.env.QUILTY_GUEST_STATE_TABLE);

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
      // See composition.server.ts for the destination fan-out rationale.
      // Edge tier uses the no-network log adapter: `@amplitude/analytics-node`
      // is not Edge-runtime safe, and edge route handlers are not a primary
      // analytics-emission surface. If edge emission is ever needed, a
      // fetch-based HTTP-V2 adapter ships here (consent stays upstream).
      destinations: new Map([
        ['product-analytics', makeAmplitudeAnalytics({ logger: wrappedLogger })],
      ]),
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
    // In-memory ConsentStore on the Edge tier — guarded at construction
    // above (ADR-0030 fail-closed). The adapter uses only the Map Web API +
    // plain JS — Edge-runtime-safe. The DynamoDB adapter is server-only (AWS
    // SDK is Node-only); when it activates, a parallel Edge-compat
    // fetch-based adapter ships here.
    consentStore: makeInMemoryConsentStore(),
    // In-memory GuestStateStore on the Edge tier — guarded above (ADR-0030
    // fail-closed). Map-based, Edge-runtime-safe; the Edge-compat DynamoDB
    // variant ships when QUILTY_GUEST_STATE_TABLE is provisioned.
    guestStateStore: makeInMemoryGuestStateStore(),
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
