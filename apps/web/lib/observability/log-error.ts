import { captureException } from '@sentry/nextjs';
import { sanitize } from '@/lib/observability/sanitize';
import { logger } from '@/lib/observability/logger';

/**
 * `logError()` adapter — single chokepoint for error capture. Per ADR-0004
 * + D67: every error in the codebase flows through here so PHI is
 * sanitized + Sentry-bound payloads are vendor-neutralized.
 *
 * Sentry is OTel-native (D56) — span context attaches automatically when
 * called from inside an active OTel span. No manual `Sentry.startSpan`
 * calls needed in business logic.
 *
 * Caller patterns:
 *   logError(new Error('oops'), { route: '/en/account', user_id_hash: 'h' });
 *   logError(err, { traced: true });  // attaches active span context
 *
 * Isomorphic by design: Client error boundaries (`app/error.tsx`,
 * `app/global-error.tsx`) and Server Components / Route Handlers BOTH
 * call this. The named `captureException` import lets the bundler
 * resolve to the client SDK in client subtrees + the server SDK in
 * server subtrees, and tree-shakes everything else. The Sentry client
 * bundle is already paid for at app boot via `sentry.client.config.ts`,
 * so this is a zero-bundle-cost re-use (Round-5 perf-bundle reviewer
 * H1 — named import preserved; isomorphic on purpose).
 */

export interface LogErrorContext {
  route?: string;
  user_id_hash?: string;
  request_id?: string;
  // Additional context fields (sanitized before send).
  [key: string]: unknown;
}

export function logError(error: unknown, context: LogErrorContext = {}): void {
  const sanitizedContext = sanitize(context);
  const err = normalizeError(error);

  // Structured-JSON log to CloudWatch.
  logger.error(err.message, {
    ...(sanitizedContext as Record<string, unknown>),
    error_name: err.name,
    error_stack_first_frame: err.stack?.split('\n')[1]?.trim(),
  });

  // Sentry capture — Sentry's own `beforeSend` (in sentry.client.config.ts)
  // applies its sanitization pass too. Two-layer redaction (sanitize() here
  // + beforeSend in the SDK) is intentional defense-in-depth.
  captureException(err, {
    extra: sanitizedContext as Record<string, unknown>,
  });
}

function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error('Unknown error');
  }
}
