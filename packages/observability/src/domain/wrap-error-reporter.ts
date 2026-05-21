/**
 * `wrapErrorReporter` — composes the PHI sanitizer in front of every
 * `captureException` call. Per D67: no error context reaches Sentry
 * (or any future ErrorReporter adapter) without passing through the
 * sanitizer first.
 *
 * The Sentry SDK's own `beforeSend` hook is a belt-and-suspenders
 * defense; this wrapper is the LOAD-BEARING defense. The SDK's
 * `beforeSend` runs AFTER the breadcrumb pipeline, so without this
 * wrapper PHI-shaped fields would reach breadcrumb storage before
 * being scrubbed.
 */

import type { Sanitizer } from '@quilty/security';
import type { ErrorReporter, ErrorReporterContext } from '../ports';

export interface WrappedErrorReporterOptions {
  readonly adapter: ErrorReporter;
  readonly sanitizer: Sanitizer;
}

export function wrapErrorReporter(options: WrappedErrorReporterOptions): ErrorReporter {
  const { adapter, sanitizer } = options;
  return {
    captureException: (error: unknown, context?: ErrorReporterContext): void => {
      const sanitizedContext = context ? sanitizer.scrub(context) : undefined;
      adapter.captureException(error, sanitizedContext);
    },
  };
}
