/**
 * Testing barrel for @quilty/observability.
 *
 * Exposed via the `@quilty/observability/testing` subpath export. The
 * fakes re-export the in-memory adapters under shorter names + add
 * ConsentReader factory helpers so tests can compose the chokepoint
 * without dragging in the production wrappers — or @quilty/consent,
 * which depends on this package (a re-export would create a cycle).
 */

import type { ConsentReader, ConsentSnapshot } from '../ports.js';

export {
  makeInMemoryAnalytics,
  makeInMemoryAnalytics as makeAnalyticsFake,
  makeInMemoryErrorReporter,
  makeInMemoryErrorReporter as makeErrorReporterFake,
  makeInMemoryFeatureFlagEvaluator,
  makeInMemoryFeatureFlagEvaluator as makeFeatureFlagEvaluatorFake,
  makeInMemoryLogger,
  makeInMemoryLogger as makeLoggerFake,
  makeInMemoryReplay,
  makeInMemoryReplay as makeReplayFake,
  type InMemoryAnalytics,
  type InMemoryAnalyticsRecord,
  type InMemoryErrorRecord,
  type InMemoryErrorReporter,
  type InMemoryFeatureFlagOptions,
  type InMemoryLogRecord,
  type InMemoryLogger,
  type InMemoryReplay,
} from '../adapters/in-memory.js';

const DENIAL_SNAPSHOT: ConsentSnapshot = {
  analytics: false,
  marketing: false,
  preferences: false,
  gpc_detected: false,
};

/**
 * Default-deny ConsentReader for unit tests. Equivalent to the production
 * value in @quilty/consent but inlined here to keep observability's test
 * surface self-contained (consent depends on observability for its port
 * shape; re-importing here would create a cycle).
 */
export function makeConsentReaderFake(): ConsentReader {
  return { read: () => DENIAL_SNAPSHOT };
}

/**
 * Compose a granting ConsentReader for tests that need analytics emission
 * to fire. Defaults all flags to true; callers can override per-test.
 *
 * Invariant: `gpc_detected: true` cannot coexist with granted
 * analytics/marketing — CCPA §7025(c)(2) requires GPC to force opt-out
 * across sale/sharing categories. The fake throws at construction
 * rather than silently producing a state that the production server
 * reader would never emit, which would let contract tests pass on a
 * regression that violates the GPC override semantics.
 */
export function makeGrantingConsentReaderFake(
  overrides: Partial<ConsentSnapshot> = {},
): ConsentReader {
  const snapshot: ConsentSnapshot = {
    analytics: true,
    marketing: true,
    preferences: true,
    gpc_detected: false,
    ...overrides,
  };
  if (snapshot.gpc_detected && (snapshot.analytics || snapshot.marketing)) {
    throw new Error(
      'makeGrantingConsentReaderFake invariant: gpc_detected=true must force analytics + marketing to false (CCPA §7025(c)(2)).',
    );
  }
  return {
    read: () => snapshot,
  };
}
