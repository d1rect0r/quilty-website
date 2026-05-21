/**
 * Observability package ports.
 *
 * Five role-shaped interfaces — Analytics, ErrorReporter, Logger,
 * Replay, FeatureFlagEvaluator — consumed by the composition root.
 * Naming discipline (META-1): ports never carry vendor names — vendor
 * identifiers appear only inside `adapters/<vendor>.ts`.
 *
 * The `ConsentReader` + `ConsentSnapshot` types consumed by
 * `wrapAnalytics` are owned by `@quilty/consent` (port-owned-by-
 * provider); this package depends on `@quilty/consent` for those
 * contracts.
 */

import type { AccountDeleteReason } from './domain/account-delete-reason.js';

// ---------------------------------------------------------------------------
// Analytics port (D82)
// ---------------------------------------------------------------------------

/**
 * Typed analytics event union. Adding events here is cheap; refactoring
 * a string-typed API at vendor activation is expensive. Free-form
 * `reason: string` was rejected by the Cerebral-lesson review — callers
 * must pre-classify server-side before emitting. New enum values for
 * `account_deleted.reason` are added to `AccountDeleteReason`.
 */
export type AnalyticsEvent =
  | {
      readonly name: 'page_view';
      readonly props: { readonly route: string; readonly locale: string };
    }
  | {
      readonly name: 'cta_click';
      readonly props: { readonly cta_id: string; readonly location: string };
    }
  | { readonly name: 'signup_started'; readonly props: { readonly source: string } }
  | {
      readonly name: 'signup_completed';
      readonly props: { readonly method: 'password' | 'passkey' | 'social' };
    }
  | { readonly name: 'subscription_started'; readonly props: { readonly plan: string } }
  | { readonly name: 'account_deleted'; readonly props: { readonly reason: AccountDeleteReason } };

export interface AnalyticsCallContext {
  readonly user_id_hash?: string;
  readonly session_id?: string;
}

/**
 * Analytics port. `track()` is the only public surface; the wrapper applies
 * the consent gate + sanitizer + assertNoPHI before delegating to the
 * underlying adapter (Amplitude in production, in-memory for tests).
 */
export interface Analytics {
  readonly track: <E extends AnalyticsEvent>(event: E, ctx?: AnalyticsCallContext) => Promise<void>;
}

// ---------------------------------------------------------------------------
// ErrorReporter port (D83)
// ---------------------------------------------------------------------------

export interface ErrorReporterContext {
  readonly route?: string;
  readonly user_id_hash?: string;
  readonly request_id?: string;
  // Additional context fields. The wrapper sanitizes recursively.
  readonly [key: string]: unknown;
}

/**
 * Single chokepoint for error capture. The wrapper normalizes the error +
 * sanitizes the context before delegating to the vendor SDK. Isomorphic
 * across runtimes — Next.js resolves the named `captureException` import
 * to the right SDK in each subtree.
 */
export interface ErrorReporter {
  readonly captureException: (error: unknown, context?: ErrorReporterContext) => void;
}

// ---------------------------------------------------------------------------
// Logger port (D84)
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  // Structured fields surfaced explicitly so they're queryable in
  // CloudWatch Insights. Arbitrary additional fields are accepted; the
  // wrapper sanitizes them.
  readonly trace_id?: string;
  readonly span_id?: string;
  readonly request_id?: string;
  readonly route?: string;
  readonly user_id_hash?: string;
  readonly method?: string;
  readonly status?: number;
  readonly duration_ms?: number;
  readonly [key: string]: unknown;
}

/**
 * Structured-JSON logger. Per D42d + D67: every log line passes through
 * the PHI sanitizer before write; raw `console.log` is banned by ESLint
 * outside this adapter.
 */
export interface Logger {
  readonly debug: (msg: string, fields?: LogFields) => void;
  readonly info: (msg: string, fields?: LogFields) => void;
  readonly warn: (msg: string, fields?: LogFields) => void;
  readonly error: (msg: string, fields?: LogFields) => void;
}

// ---------------------------------------------------------------------------
// Replay port (D85)
// ---------------------------------------------------------------------------

/**
 * Replay-integration config. Sentry's session-vs-error sample rates are
 * set at `Sentry.init()` time inside the Sentry init files (the SDK does
 * not accept them as `replayIntegration` arguments); this port covers
 * only the masking surface the wrapper composes around the adapter.
 *
 * `sessionSampleRate: 0` is included as a literal-typed field that the
 * wrapper guards at runtime — even though Sentry ignores it on the
 * integration object, the wrapper rejects any caller that passes a
 * non-zero value to lock the API surface against a future regression
 * where someone tries to enable always-on replay via the port.
 */
export interface ReplayConfig {
  /** Per D68, MUST be 0 for HIPAA-aligned posture. Wrapper rejects non-zero. */
  readonly sessionSampleRate: 0;
  readonly maskAllText?: boolean;
  readonly blockAllMedia?: boolean;
  readonly maskAllInputs?: boolean;
}

/**
 * Replay port. The wrapper enforces D68 invariants at `initialize()`:
 * `sessionSampleRate` MUST be 0, `maskAllText`/`blockAllMedia`/`maskAllInputs`
 * default-on. Any config that tries to relax these is rejected — Amplitude
 * Session Replay is rejected outright because the HTML-attribute leak is
 * structural regardless of the wrapper.
 */
export interface Replay {
  readonly initialize: (config?: Partial<ReplayConfig>) => Promise<void>;
}

// ---------------------------------------------------------------------------
// FeatureFlagEvaluator port (D86)
// ---------------------------------------------------------------------------

/**
 * FeatureFlagEvaluator port. The flag-name parameter is intentionally
 * generic — consumers narrow against their own `FeatureFlags` type at the
 * call site. The env-var adapter reads from typed env vars; the PostHog
 * adapter at the trigger point swaps in without changing the signature.
 *
 * LaunchDarkly Oct 2025 outage lesson: every flag has a safe-by-default
 * value at the call site. If the underlying vendor is unreachable, the
 * adapter falls back to the default rather than `false`-everything.
 */
export interface FeatureFlagEvaluator {
  readonly flag: <T>(name: string, defaultValue: T) => T;
  readonly all: () => Readonly<Record<string, unknown>>;
}
