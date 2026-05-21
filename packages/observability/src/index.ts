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
  ConsentReader,
  ConsentSnapshot,
  ErrorReporter,
  ErrorReporterContext,
  FeatureFlagEvaluator,
  LogFields,
  LogLevel,
  Logger,
  Replay,
  ReplayConfig,
} from './ports.js';

export type {
  AdapterUnavailableError,
  AnalyticsError,
  ConsentDeniedError,
  PhiAssertionError,
  ReplayConfigError,
  ReplayError,
  Result,
} from './errors.js';

// ---------------------------------------------------------------------------
// Domain constants + enum
// ---------------------------------------------------------------------------

export type { AccountDeleteReason } from './domain/account-delete-reason.js';
export { ACCOUNT_DELETE_REASONS } from './domain/account-delete-reason.js';
export {
  CLINICAL_PROTECTED_CLASSES,
  REPLAY_BLOCK_CLASS,
  REPLAY_IGNORE_CLASS,
  REPLAY_MASK_CLASS,
} from './domain/replay-classes.js';

// ---------------------------------------------------------------------------
// Factory wrappers (Cerebral-lesson chokepoint composition)
// ---------------------------------------------------------------------------

export { wrapAnalytics, type WrappedAnalyticsOptions } from './domain/wrap-analytics.js';
export {
  wrapErrorReporter,
  type WrappedErrorReporterOptions,
} from './domain/wrap-error-reporter.js';
export { wrapLogger, type WrappedLoggerOptions } from './domain/wrap-logger.js';
export { wrapReplay, type WrappedReplayOptions } from './domain/wrap-replay.js';

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

export { makeAmplitudeAnalytics, type AmplitudeAnalyticsOptions } from './adapters/amplitude.js';
export { makeCloudWatchLogger } from './adapters/cloudwatch-logger.js';
export { makeEnvFlagEvaluator } from './adapters/env-flags.js';
export { makeSentryErrorReporter } from './adapters/sentry-error-reporter.js';
export { makeSentryReplay } from './adapters/sentry-replay.js';

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export { WebVitalsReporter } from './components/WebVitalsReporter.js';
