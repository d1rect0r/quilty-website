/**
 * Public barrel for @quilty/observability.
 *
 * Consumers import factory wrappers + adapters + ports + constants from
 * this file. Deep imports into `src/*` are forbidden by
 * `.dependency-cruiser.cjs` rule `cross-package-imports-must-use-barrel`.
 *
 * The composition root MUST consume the wrapper factories
 * (`wrapAnalytics`, `wrapErrorReporter`, `wrapLogger`, `wrapReplay`) —
 * never the raw adapter functions. The wrappers compose the Cerebral-
 * lesson chokepoints (default-deny consent + PHI sanitizer + replay
 * floor); calling a raw adapter as a Container property defeats the
 * architectural seal per ADR-0010.
 */

// ---------------------------------------------------------------------------
// Ports (type-only re-exports)
// ---------------------------------------------------------------------------

export type {
  Analytics,
  AnalyticsCallContext,
  AnalyticsEvent,
  ErrorReporter,
  ErrorReporterContext,
  FeatureFlagEvaluator,
  LogFields,
  LogLevel,
  Logger,
  Replay,
  ReplayConfig,
} from './ports';

export type {
  AdapterUnavailableError,
  AnalyticsError,
  ConsentDeniedError,
  PhiAssertionError,
  ReplayConfigError,
  ReplayError,
  Result,
} from './errors';

// ---------------------------------------------------------------------------
// Domain constants + enum
// ---------------------------------------------------------------------------

export type { AccountDeleteReason } from './domain/account-delete-reason';
export { ACCOUNT_DELETE_REASONS } from './domain/account-delete-reason';
export {
  CLINICAL_PROTECTED_CLASSES,
  REPLAY_BLOCK_CLASS,
  REPLAY_IGNORE_CLASS,
  REPLAY_MASK_CLASS,
} from './domain/replay-classes';

// ---------------------------------------------------------------------------
// Factory wrappers (Cerebral-lesson chokepoint composition)
// ---------------------------------------------------------------------------

export { wrapAnalytics, type WrappedAnalyticsOptions } from './domain/wrap-analytics';
export { wrapErrorReporter, type WrappedErrorReporterOptions } from './domain/wrap-error-reporter';
export { wrapLogger, type WrappedLoggerOptions } from './domain/wrap-logger';
export { wrapReplay, type WrappedReplayOptions } from './domain/wrap-replay';

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

export { makeAmplitudeAnalytics, type AmplitudeAnalyticsOptions } from './adapters/amplitude';
export { makeBrowserLogger } from './adapters/browser-logger';
export { makeCloudWatchLogger } from './adapters/cloudwatch-logger';
export { makeEnvFlagEvaluator } from './adapters/env-flags';
export { makeSentryErrorReporter } from './adapters/sentry-error-reporter';
export { makeSentryReplay } from './adapters/sentry-replay';

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export { WebVitalsReporter } from './components/WebVitalsReporter';
