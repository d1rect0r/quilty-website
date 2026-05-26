/**
 * No-op CircuitBreaker adapter — the today's default per ADR-0017
 * Decision D.
 *
 * Always-closed: every call passes through unchanged. Zero runtime
 * cost beyond the function wrap. The opossum-backed adapter
 * (`makeOpossumCircuitBreaker()` at `./circuit-breaker-opossum.ts`)
 * activates at the cascading-failure trigger documented in
 * ADR-0017; the swap is a one-line composition change at the
 * server / edge composition roots.
 *
 * Why scaffold the port today: maintains hexagonal architecture
 * consistency across all ports + adapters; the opossum adapter
 * activation is a one-file change at trigger time, not a structural
 * retrofit.
 */

import type { CircuitBreaker } from '../ports';

export function makeNoOpCircuitBreaker(): CircuitBreaker {
  return {
    async protect<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
}
