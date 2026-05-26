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
  AnalyticsDestination,
  AnalyticsEvent,
  ErrorReporter,
  ErrorReporterContext,
  FeatureFlagEvaluator,
  LogFields,
  LogLevel,
  Logger,
  PHIScrubber,
  Replay,
  ReplayConfig,
  SentryEventLike,
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
export type { AccountState, AccountStateTuple, ClinicalRecordsState } from './domain/account-state';
export {
  ACCOUNT_DELETION_GRACE_PERIOD_MS,
  deriveAccountStateFromReason,
  deriveStatesFromReason,
} from './domain/account-state';
export {
  CLINICAL_PROTECTED_CLASSES,
  REPLAY_BLOCK_CLASS,
  REPLAY_IGNORE_CLASS,
  REPLAY_MASK_CLASS,
} from './domain/replay-classes';

// ---------------------------------------------------------------------------
// Factory wrappers (Cerebral-lesson chokepoint composition)
// ---------------------------------------------------------------------------

export {
  wrapAnalytics,
  DEFAULT_CONSENT_CATEGORY_BY_DESTINATION,
  type ConsentCategoryForDestination,
  type WrappedAnalyticsOptions,
} from './domain/wrap-analytics';
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
export { makePhiScrubber } from './adapters/phi-scrubber';
export { makeSentryErrorReporter } from './adapters/sentry-error-reporter';
export { makeSentryReplay } from './adapters/sentry-replay';

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export { WebVitalsReporter } from './components/WebVitalsReporter';
