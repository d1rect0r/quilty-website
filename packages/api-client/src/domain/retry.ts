/**
 * Retry policy — exponential backoff with full jitter (Decision C in
 * ADR-0017). The canonical AWS Architecture Blog formulation:
 *
 *   delay = random(0, min(maxDelayMs, baseDelayMs * 2^attempt))
 *
 * `attempt` is 0-indexed (first failure → attempt = 0).
 *
 * Pure logic. No I/O, no `setTimeout`. The adapter owns the sleep +
 * attempt-counter loop; this module exposes the decision interface
 * the adapter calls into.
 */

import { isRetryableForMethod } from '../ports';
import type { ApiMethod, RetryPolicy } from '../ports';

export interface DefaultRetryPolicyOptions {
  /** Maximum total attempts. 1 = no retries. Default 3. */
  readonly maxAttempts?: number | undefined;
  /** Base delay in milliseconds. Default 100ms. */
  readonly baseDelayMs?: number | undefined;
  /** Maximum single-attempt delay in milliseconds. Default 5000ms. */
  readonly maxDelayMs?: number | undefined;
  /** The HTTP method the policy is gating retries for. */
  readonly method: ApiMethod;
  /**
   * Idempotency-Key for the in-flight request. Required for POST to
   * be retryable per the Stripe rule. Omit for non-POST methods or
   * for POSTs that intentionally are not idempotent.
   */
  readonly idempotencyKey?: string | undefined;
  /**
   * Override for the RNG. Tests inject a deterministic source; production
   * defaults to `Math.random`.
   */
  readonly random?: (() => number) | undefined;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 5000;

/**
 * Build a RetryPolicy honoring the AWS canonical pattern. Default
 * budget: 3 attempts, 100ms base, 5000ms max delay.
 *
 * The `method` + `idempotencyKey` arguments shape the `shouldRetry`
 * decision per the IDEMPOTENT_METHODS rule (ADR-0017 Decision C).
 */
export function makeDefaultRetryPolicy(options: DefaultRetryPolicyOptions): RetryPolicy {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const random = options.random ?? Math.random;

  return {
    maxAttempts,
    shouldRetry(error, _attempt) {
      // The retry loop bounds the attempt count via `for (; attempt < maxAttempts; …)` —
      // shouldRetry's job is to answer "is this error class retryable?" only.
      // When the loop runs out of attempts it throws ApiRetryBudgetExhaustedError.
      return isRetryableForMethod(options.method, error, options.idempotencyKey);
    },
    delayMs(attempt) {
      // Full jitter: `random(0, min(maxDelayMs, baseDelayMs * 2^attempt))`.
      // The exponent is capped to avoid `Math.pow(2, 30)` overflow on
      // pathologically high attempt counts; in practice `attempt` is
      // bounded by `maxAttempts - 1` ≤ 30 even at adversarial config.
      const cappedAttempt = Math.min(attempt, 30);
      const upperBound = Math.min(maxDelayMs, baseDelayMs * 2 ** cappedAttempt);
      return Math.floor(random() * upperBound);
    },
  };
}

/**
 * Convenience: a "no retries" policy. Useful when the caller wants
 * the typed-error union but does NOT want any retry behaviour
 * (e.g., a non-idempotent POST without an Idempotency-Key, or a
 * call-site that prefers to surface the first failure immediately).
 */
export function makeNoRetryPolicy(): RetryPolicy {
  return {
    maxAttempts: 1,
    shouldRetry() {
      return false;
    },
    delayMs() {
      return 0;
    },
  };
}

/**
 * Read the `Retry-After` header per RFC 7231 §7.1.3. Supports both
 * delta-seconds and HTTP-date forms; returns the milliseconds-to-wait
 * value, or undefined if the header is absent or malformed.
 *
 * Adapters call this in the retry loop when the server emitted a 429
 * or 503 with the header — the server's hint overrides the
 * exponential-backoff schedule.
 */
export function parseRetryAfter(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();

  // delta-seconds form — strict integer match
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }

  // HTTP-date form per RFC 7231 §7.1.1.1 — require a recognizable HTTP-
  // date shape (letters present + space-separated tokens) before trying
  // Date.parse. Otherwise `Date.parse('-5')` accepts year -5 BCE and
  // returns a finite-but-meaningless timestamp.
  const looksLikeHttpDate = /[A-Za-z]{3}/.test(trimmed) && /[ ,]/.test(trimmed);
  if (looksLikeHttpDate) {
    const dateMs = Date.parse(trimmed);
    if (Number.isFinite(dateMs)) {
      const delta = dateMs - Date.now();
      return delta > 0 ? delta : 0;
    }
  }

  return undefined;
}
