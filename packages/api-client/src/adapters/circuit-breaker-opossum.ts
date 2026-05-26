/**
 * Opossum-backed CircuitBreaker adapter — SKELETON ONLY.
 *
 * Activation is gated on the cascading-failure trigger documented in ADR-0017:
 * Sentry dashboards show 3+ cascading-failure events within a
 * 30-day window (Rust backend 503 → user-facing error rate spike).
 *
 * Until activation, this file documents the swap-in shape so the
 * future change is a one-file edit + a one-line composition change.
 * The opossum dependency is NOT installed at today — adding it is:
 *
 *   pnpm --filter @quilty/api-client add opossum
 *   pnpm --filter @quilty/api-client add -D @types/opossum
 *
 * Then uncomment the implementation below + wire it through the
 * server / edge composition roots in place of `makeNoOpCircuitBreaker()`.
 *
 * The contract test at `__tests__/circuit-breaker.contract.test.ts`
 * already exercises the port shape against the no-op adapter; the
 * same test passes against the opossum adapter at activation,
 * proving the swap is behaviour-preserving for the happy path.
 *
 * Configuration shape (locked at planning time):
 *   - errorThresholdPercentage: 50 (50% failures over the window
 *     trip the breaker to OPEN)
 *   - timeout: 15_000 (15s — matches the per-attempt fetch timeout)
 *   - resetTimeout: 30_000 (30s in OPEN before transitioning to
 *     HALF-OPEN for a single probe)
 *   - rollingCountTimeout: 60_000 (60s rolling window)
 *   - rollingCountBuckets: 10
 *   - capacity: 100 (max concurrent calls before backpressure)
 */

import { ApiCircuitOpenError } from '../errors';
import type { CircuitBreaker } from '../ports';

export interface OpossumCircuitBreakerOptions {
  /** Percentage of failures over the rolling window that trips the breaker. Default 50. */
  readonly errorThresholdPercentage?: number;
  /** Per-call timeout in milliseconds — should match the fetch adapter timeout. Default 15_000. */
  readonly timeout?: number;
  /** Milliseconds in OPEN before a HALF-OPEN probe is allowed. Default 30_000. */
  readonly resetTimeout?: number;
  /** Rolling window duration in milliseconds. Default 60_000. */
  readonly rollingCountTimeout?: number;
  /** Number of buckets within the rolling window. Default 10. */
  readonly rollingCountBuckets?: number;
}

/**
 * Activate by:
 *   1. `pnpm --filter @quilty/api-client add opossum @types/opossum`
 *   2. Replace the throw below with the commented implementation.
 *   3. Wire `makeOpossumCircuitBreaker(...)` at the composition root
 *      in place of `makeNoOpCircuitBreaker()`.
 *   4. Verify against the existing contract test + add a stateful
 *      test asserting OPEN → HALF-OPEN → CLOSED transitions under
 *      simulated failure rates.
 */
export function makeOpossumCircuitBreaker(
  _options: OpossumCircuitBreakerOptions = {},
): CircuitBreaker {
  // CIRCUIT-BREAKER ACTIVATION GUARD (ADR-0017 Decision D).
  // The opossum dependency is intentionally NOT installed today.
  // Calling this factory before activation is a programming error;
  // the throw makes it loud rather than silently returning a no-op.
  throw new ApiCircuitOpenError({
    message:
      'makeOpossumCircuitBreaker is a future-activation skeleton. Install opossum + uncomment the implementation per the activation runbook in this file.',
  });

  /* ACTIVATION BLOCK — uncomment + remove the throw above when cascading-failure trigger fires:

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CircuitBreakerLib = require('opossum');

  const opossum = new CircuitBreakerLib(
    async <T>(fn: () => Promise<T>): Promise<T> => fn(),
    {
      errorThresholdPercentage: _options.errorThresholdPercentage ?? 50,
      timeout: _options.timeout ?? 15_000,
      resetTimeout: _options.resetTimeout ?? 30_000,
      rollingCountTimeout: _options.rollingCountTimeout ?? 60_000,
      rollingCountBuckets: _options.rollingCountBuckets ?? 10,
    },
  );

  return {
    async protect<T>(fn: () => Promise<T>): Promise<T> {
      try {
        return await opossum.fire(fn);
      } catch (err) {
        if (opossum.opened) {
          throw new ApiCircuitOpenError({
            message: 'Circuit breaker is OPEN; failing fast.',
            cause: err,
          });
        }
        throw err;
      }
    },
  };
  */
}
