/**
 * CloudWatch Logger adapter (D42d / D84).
 *
 * Structured-JSON writer; the underlying transport is `console.log`,
 * which Lambda forwards to CloudWatch Logs. The wrapper at the
 * composition layer is responsible for PHI sanitization — this adapter
 * does NOT scrub the payload, by design. Reaching for `console.log`
 * directly anywhere else in the codebase is blocked by the ESLint
 * `no-console` rule with this file as the single exception.
 */

import type { LogFields, LogLevel, Logger } from '../ports';

interface LogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly msg: string;
  readonly [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, fields: LogFields): void {
  const record: LogRecord = {
    timestamp: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };

  console.log(JSON.stringify(record));
}

export function makeCloudWatchLogger(): Logger {
  return {
    debug(msg: string, fields: LogFields = {}): void {
      if (process.env['NODE_ENV'] === 'production') return;
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
}
