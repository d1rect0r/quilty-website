/**
 * Sentry ErrorReporter adapter (D42a / D83).
 *
 * Isomorphic — the named `captureException` import from `@sentry/nextjs`
 * resolves to the right SDK in each runtime subtree (client / server /
 * edge). Next.js tree-shakes the unused SDKs. On the client the Sentry SDK
 * now lands in a lazy async chunk (there is no `sentry.client.config.ts`
 * anymore — it was replaced by the idle-loaded `instrumentation-client.ts`
 * → `sentry-client-init.ts` path per ADR-0018); this adapter's
 * `captureException` shares that same lazy chunk, which is loaded when the
 * client container is constructed by an error boundary. Server + edge still
 * init at app boot via `sentry.{server,edge}.config.ts`.
 *
 * The adapter does NOT sanitize — that's the wrapper's responsibility.
 * The Sentry SDK's own `beforeSend` hook adds a belt-and-suspenders
 * defense at the SDK boundary.
 */

import { captureException } from '@sentry/nextjs';
import type { ErrorReporter, ErrorReporterContext } from '../ports';

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
