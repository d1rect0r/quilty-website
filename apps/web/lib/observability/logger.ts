import { sanitize } from '@/lib/observability/sanitize';

/**
 * Structured-JSON logger — the single chokepoint for every log emission.
 *
 * Per D42d + D67: every log line is structured JSON; every payload passes
 * through `sanitize()` before write; raw `console.log` is banned by ESLint
 * elsewhere in the app. CloudWatch Insights queries against the emitted
 * shape; PHI never reaches the log group.
 *
 * Per ADR-0004: this lives at `lib/observability/`. Direct vendor SDK
 * imports outside this directory are blocked by the custom ESLint rule.
 *
 * Vendor-neutral by design — the underlying writer is `console.*` (which
 * Lambda forwards to CloudWatch). Sentry breadcrumbs piggyback via the
 * `@sentry/nextjs` global beforeSend hook; no direct Sentry calls in this
 * file.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  // Common structured fields — surface them explicitly so they're
  // queryable in CloudWatch Insights.
  trace_id?: string;
  span_id?: string;
  request_id?: string;
  route?: string;
  user_id_hash?: string;
  method?: string;
  status?: number;
  duration_ms?: number;
  // Arbitrary additional fields are accepted, then sanitized.
  [key: string]: unknown;
}

interface LogRecord {
  timestamp: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, fields: LogFields): void {
  const sanitized = sanitize({ ...fields, msg });
  const record: LogRecord = {
    timestamp: new Date().toISOString(),
    level,
    msg,
    ...(sanitized as Record<string, unknown>),
  };
  // ESLint custom rule allows console.log only in this file via a
  // direction-targeted overrride; everywhere else calls logger.*.

  console.log(JSON.stringify(record));
}

export const logger = {
  debug(msg: string, fields: LogFields = {}): void {
    if (process.env.NODE_ENV === 'production') return;
    emit('debug', msg, fields);
  },
  info(msg: string, fields: LogFields = {}): void {
    emit('info', msg, fields);
  },
  warn(msg: string, fields: LogFields = {}): void {
    emit('warn', msg, fields);
  },
  error(msg: string, fields: LogFields = {}): void {
    emit('error', msg, fields);
  },
};
