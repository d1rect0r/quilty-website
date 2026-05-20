/**
 * Sentry ErrorReporter adapter (D42a / D83).
 *
 * Isomorphic — the named `captureException` import from `@sentry/nextjs`
 * resolves to the right SDK in each runtime subtree (client / server /
 * edge). Next.js tree-shakes the unused SDKs; the bundle cost is shared
 * with the SDKs already paid for at app boot via `sentry.{client,server,
 * edge}.config.ts`.
 *
 * The adapter does NOT sanitize — that's the wrapper's responsibility.
 * The Sentry SDK's own `beforeSend` hook adds a belt-and-suspenders
 * defense at the SDK boundary.
 */

import { captureException } from '@sentry/nextjs';
import type { ErrorReporter, ErrorReporterContext } from '../ports.js';

function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error('Unknown error');
  }
}

export function makeSentryErrorReporter(): ErrorReporter {
  return {
    captureException: (error: unknown, context?: ErrorReporterContext): void => {
      const err = normalizeError(error);
      captureException(err, {
        extra: (context ?? {}) as Record<string, unknown>,
      });
    },
  };
}
