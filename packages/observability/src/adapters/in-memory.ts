/**
 * In-memory adapters for every observability port.
 *
 * Production-grade fallbacks — apps wire these when the real vendor is
 * unavailable (Sentry DSN unset, Amplitude BAA pending, etc.). The
 * `@quilty/observability/testing` subpath re-exports the same factories
 * with seedable-options variants for unit + contract tests.
 *
 * The adapters do NOT sanitize their payloads — the wrapper composition
 * is the architectural seal. These adapters trust the caller went
 * through the wrapper.
 */

import type {
  Analytics,
  AnalyticsCallContext,
  AnalyticsEvent,
  ErrorReporter,
  ErrorReporterContext,
  FeatureFlagEvaluator,
  LogFields,
  Logger,
  Replay,
} from '../ports.js';

// ---------------------------------------------------------------------------
// In-memory Analytics — captures emitted events for inspection
// ---------------------------------------------------------------------------

export interface InMemoryAnalyticsRecord {
  readonly event: AnalyticsEvent;
  readonly ctx: AnalyticsCallContext | undefined;
}

export interface InMemoryAnalytics extends Analytics {
  readonly emitted: readonly InMemoryAnalyticsRecord[];
  readonly reset: () => void;
}

export function makeInMemoryAnalytics(): InMemoryAnalytics {
  const buffer: InMemoryAnalyticsRecord[] = [];
  return {
    emitted: buffer,
    reset: () => {
      buffer.length = 0;
    },
    track: async <E extends AnalyticsEvent>(
      event: E,
      ctx?: AnalyticsCallContext,
    ): Promise<void> => {
      buffer.push({ event, ctx });
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory ErrorReporter — captures errors for inspection
// ---------------------------------------------------------------------------

export interface InMemoryErrorRecord {
  readonly error: unknown;
  readonly context: ErrorReporterContext | undefined;
}

export interface InMemoryErrorReporter extends ErrorReporter {
  readonly emitted: readonly InMemoryErrorRecord[];
  readonly reset: () => void;
}

export function makeInMemoryErrorReporter(): InMemoryErrorReporter {
  const buffer: InMemoryErrorRecord[] = [];
  return {
    emitted: buffer,
    reset: () => {
      buffer.length = 0;
    },
    captureException: (error: unknown, context?: ErrorReporterContext): void => {
      buffer.push({ error, context });
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory Logger — captures log records for inspection
// ---------------------------------------------------------------------------

export interface InMemoryLogRecord {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly msg: string;
  readonly fields: LogFields;
}

export interface InMemoryLogger extends Logger {
  readonly emitted: readonly InMemoryLogRecord[];
  readonly reset: () => void;
}

export function makeInMemoryLogger(): InMemoryLogger {
  const buffer: InMemoryLogRecord[] = [];
  function push(level: InMemoryLogRecord['level'], msg: string, fields: LogFields = {}): void {
    buffer.push({ level, msg, fields });
  }
  return {
    emitted: buffer,
    reset: () => {
      buffer.length = 0;
    },
    debug: (msg, fields) => push('debug', msg, fields),
    info: (msg, fields) => push('info', msg, fields),
    warn: (msg, fields) => push('warn', msg, fields),
    error: (msg, fields) => push('error', msg, fields),
  };
}

// ---------------------------------------------------------------------------
// In-memory Replay — records the initialize() calls
// ---------------------------------------------------------------------------

export interface InMemoryReplay extends Replay {
  readonly initializeCalls: number;
}

export function makeInMemoryReplay(): InMemoryReplay {
  let calls = 0;
  return {
    get initializeCalls() {
      return calls;
    },
    initialize: async (): Promise<void> => {
      calls += 1;
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory FeatureFlagEvaluator — caller-supplied flag map
// ---------------------------------------------------------------------------

export interface InMemoryFeatureFlagOptions {
  readonly flags?: Record<string, unknown>;
}

export function makeInMemoryFeatureFlagEvaluator(
  options: InMemoryFeatureFlagOptions = {},
): FeatureFlagEvaluator {
  const flags: Record<string, unknown> = { ...(options.flags ?? {}) };
  return {
    flag: <T>(name: string, defaultValue: T): T => {
      if (name in flags) return flags[name] as T;
      return defaultValue;
    },
    all: (): Readonly<Record<string, unknown>> => flags,
  };
}
