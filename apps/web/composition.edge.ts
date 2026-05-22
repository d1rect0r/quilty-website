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
import { makeServerConsentReader } from '@quilty/consent/server';
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

// Future cookie name — see composition.server.ts for the cookie-write
// activation gate. Mirrored here so the edge tier reads the same
// cookie name once the banner writes it.
const CONSENT_COOKIE_NAME = '__Host-quilty_consent';

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
  };
}
