/**
 * `wrapLogger` — composes the PHI sanitizer in front of every log
 * emission. Per D42d + D67: every payload passes through
 * `sanitizer.scrub()` before write; raw `console.log` is banned by
 * ESLint outside the CloudWatch adapter chokepoint.
 *
 * Both the message string AND the structured fields are scrubbed.
 * Sanitizing the message guards against the common interpolation
 * mistake — `Error('No account found for user@example.com')` would
 * otherwise reach CloudWatch unsanitized when a caller passes
 * `error.message` as the log message. The sanitizer's UUID-hash + JWT
 * detection + free-text truncation apply to the message string the
 * same way they apply to field values.
 *
 * Debug-level emissions are dropped in production (the underlying
 * adapter already implements this; the wrapper preserves the contract).
 */

import type { Sanitizer } from '@quilty/security';
import type { LogFields, Logger } from '../ports';

export interface WrappedLoggerOptions {
  readonly adapter: Logger;
  readonly sanitizer: Sanitizer;
}

export function wrapLogger(options: WrappedLoggerOptions): Logger {
  const { adapter, sanitizer } = options;

  function emit(
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    fields: LogFields = {},
  ): void {
    const sanitizedMsg = sanitizer.scrub(msg);
    const sanitizedFields = sanitizer.scrub(fields);
    adapter[level](sanitizedMsg, sanitizedFields);
  }

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
  };
}
