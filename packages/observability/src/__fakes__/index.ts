/**
 * Testing barrel for @quilty/observability.
 *
 * Exposed via the `@quilty/observability/testing` subpath export. The
 * fakes re-export the in-memory adapters under shorter names + add a
 * default-deny ConsentReader factory so tests can compose the
 * chokepoint without dragging in the production wrappers.
 */

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
  type InMemoryLogRecord,
  type InMemoryLogger,
  type InMemoryReplay,
} from '../adapters/in-memory.js';

export { makeDefaultDenyConsentReader as makeConsentReaderFake } from '../domain/default-deny-consent.js';

/**
 * Compose a granting ConsentReader for tests that need analytics emission
 * to fire. Defaults all flags to true; callers can override per-test.
 */
import type { ConsentReader, ConsentSnapshot } from '../ports.js';

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
  return {
    read: () => snapshot,
  };
}
