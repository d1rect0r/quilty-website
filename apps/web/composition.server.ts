/**
 * Server-runtime composition root.
 *
 * Invoked from Server Components, Route Handlers, server actions, and the
 * proxy.ts handler. Wires server-side adapters: Sentry server SDK, the
 * Amplitude Node analytics adapter (real SDK; dormant until
 * AMPLITUDE_SERVER_API_KEY is provisioned), CloudWatch logger, env-var
 * feature flags. The Replay port wires the in-memory adapter on the server
 * (Sentry Replay is browser-only). See ADR-0010 for the composition-root
 * rationale.
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
  makeAmplitudeNodeAnalytics,
  makeCloudWatchLogger,
  makeEnvFlagEvaluator,
  makePhiScrubber,
  makeSentryErrorReporter,
  wrapAnalytics,
  wrapErrorReporter,
  wrapLogger,
} from '@quilty/observability';
import { makeSanitizer } from '@quilty/security';
import { env } from './lib/env';
import {
  assertInMemoryAdapterAllowed,
  resolveInMemoryGuardContext,
  shouldEmitInMemoryAuditLog,
} from './lib/fail-closed';
import type { ServerContainer } from './lib/get-container';

export function makeServerContainer(): ServerContainer {
  const sanitizer = makeSanitizer();

  // Logger is consumed by the Amplitude Node analytics adapter for its
  // dormant pre-launch CloudWatch emission, so it's constructed first.
  const wrappedLogger = wrapLogger({
    adapter: makeCloudWatchLogger(),
    sanitizer,
  });

  // Fail-closed adapter selection (ADR-0030; policy in ./lib/fail-closed.ts
  // so it is unit-testable apart from this server-only module). In
  // production-runtime it refuses to SILENTLY fall back to an in-memory
  // adapter; the explicit opt-in path is audit-logged once per process.
  // Scope: the rate-limiter + consent-store in-memory adapters, which have
  // no internal guard. The email + captcha in-memory adapters self-guard at
  // call time (their own QUILTY_ALLOW_INMEMORY_{EMAIL,CAPTCHA}_IN_PROD flags),
  // so they are intentionally NOT routed through here — see ADR-0030.
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

  guardInMemoryAdapter('rate-limiter', env.QUILTY_RATE_LIMIT_TABLE);
  guardInMemoryAdapter('consent-store', env.QUILTY_CONSENT_TABLE);

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
      // Single destination today: `product-analytics`, fulfilled by the
      // Amplitude adapter. The fan-out infrastructure (per-destination
      // consent + Promise.allSettled) is wired now; the `lifecycle-
      // marketing` (Customer.io) + `warehouse` (Snowflake) destinations
      // land at their respective activation triggers per ADR-0017's
      // deferral table — no port or wrapper changes needed.
      destinations: new Map([
        [
          'product-analytics',
          // Server-tier analytics activates when AMPLITUDE_SERVER_API_KEY is
          // provisioned (an ops/key decision); absent => dormant (log-only).
          // Consent + GPC stay enforced upstream by wrapAnalytics. Unlike the
          // client tier (gated by the analytics_client_enabled flag AND a
          // public key — a browser beacon is the higher-risk, Cerebral-class
          // exfiltration surface needing an independent kill switch), the
          // server tier carries no third-party-script-in-browser risk, so
          // key-presence is a sufficient activation gate.
          makeAmplitudeNodeAnalytics({
            logger: wrappedLogger,
            apiKey: env.AMPLITUDE_SERVER_API_KEY,
            enabled: true,
          }),
        ],
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
    // In-memory adapter — self-guards at call time (it throws under
    // NODE_ENV=production unless QUILTY_ALLOW_INMEMORY_EMAIL_IN_PROD=1), so
    // it is NOT routed through the construction-time guard above. The SES
    // adapter activates once the DMARC ramp + BAA inventory both list SES as
    // covered (see docs/runbook/*.md). The wrapper composes the PHI sanitizer
    // chokepoint around the adapter per D67.
    emailSender: wrapEmailSender({
      adapter: makeInMemoryEmailSender(),
      sanitizer,
    }),
    // Default-pass in-memory verifier — self-guards at call time (rejects
    // under NODE_ENV=production unless QUILTY_ALLOW_INMEMORY_CAPTCHA_IN_PROD=1),
    // so it is NOT routed through the construction-time guard. Turnstile
    // activates once the Cloudflare BAA + secret-key provisioning are both
    // green (see baa-inventory.md).
    captchaVerifier: makeInMemoryCaptchaVerifier(),
    // In-memory sliding-window limiter — guarded at construction above
    // (no internal guard); load-bearing for auth-adjacent paths, so the
    // production guard refuses it without an explicit opt-in. The DynamoDB
    // adapter activates once QUILTY_RATE_LIMIT_TABLE + the Lambda IAM grant
    // ship (presence of the table env then trips the guard's "wire the real
    // adapter" branch).
    rateLimiter: makeInMemoryRateLimiter(),
    // In-memory ConsentStore (D63) — guarded at construction above (no
    // internal guard). Edge tier owns its own Map; the cross-tier disjoint
    // state is intentional pre-DynamoDB (auth callback migrate() hits the
    // no-op branch today). DynamoDB activation gates on QUILTY_CONSENT_TABLE
    // + a single canonical store.
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
      baseUrl: env.QUILTY_API_BASE_URL ?? 'https://api.my-quilty.com',
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
