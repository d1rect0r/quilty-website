/**
 * Fail-closed adapter-selection policy (ADR-0030).
 *
 * Pure + runtime-agnostic on purpose: the composition roots
 * (`composition.server.ts` / `composition.edge.ts`) import `server-only`,
 * which throws under Vitest, so the policy lives here where it can be
 * exhaustively unit-tested apart from the wiring.
 *
 * The rule: an in-memory adapter that lacks its own call-time production
 * guard must never SILENTLY ship to production. When serving production
 * traffic, the composition root must either provision the real adapter (its
 * activation env present) or set QUILTY_ALLOW_INMEMORY_ADAPTERS=true to opt
 * in EXPLICITLY for the AWS-parked interim — each such use is audit-logged
 * once per process. The email + captcha in-memory adapters self-guard at
 * call time with their own flags and are NOT routed through here; this
 * module covers the rate-limiter + consent-store adapters, which have no
 * internal guard. See ADR-0030 for the full flag inventory + rationale.
 */

export interface InMemoryAdapterGuardInput {
  /** Adapter label, e.g. `'rate-limiter'`. Surfaced in the error + log. */
  readonly name: string;
  /**
   * True only when actually serving production traffic — NOT during a
   * `next build` static-generation pass. The caller derives this (e.g. via
   * `resolveInMemoryGuardContext`) so this assertion stays free of Next.js
   * internals.
   */
  readonly isProductionRuntime: boolean;
  /** The explicit QUILTY_ALLOW_INMEMORY_ADAPTERS opt-in. */
  readonly allowInMemory: boolean;
  /**
   * The real adapter's activation env value (e.g. `QUILTY_RATE_LIMIT_TABLE`),
   * or `undefined` when the adapter has no activation env yet. Presence means
   * the real adapter should be wired — still selecting the in-memory one is a
   * wiring bug and throws.
   */
  readonly realActivationEnv: string | undefined;
}

export interface InMemoryAdapterGuardResult {
  /**
   * `'use'` — use the in-memory adapter silently (dev/test/build).
   * `'warn-and-use'` — production opt-in: use it, but the caller MUST emit a
   * once-per-process audit log (see `shouldEmitInMemoryAuditLog`).
   */
  readonly action: 'use' | 'warn-and-use';
}

/**
 * Throws when an in-memory adapter would be selected unsafely; otherwise
 * returns whether the caller should emit an audit log before using it.
 */
export function assertInMemoryAdapterAllowed(
  input: InMemoryAdapterGuardInput,
): InMemoryAdapterGuardResult {
  if (input.realActivationEnv !== undefined) {
    throw new Error(
      `composition: ${input.name} has its real-adapter activation env set, but the ` +
        `in-memory adapter is still wired in the composition root. Wire the real ` +
        `(DynamoDB) adapter here, or unset the activation env.`,
    );
  }
  if (input.isProductionRuntime && !input.allowInMemory) {
    throw new Error(
      `composition: refusing to use the in-memory ${input.name} adapter in production. ` +
        `Provision the real adapter, or set QUILTY_ALLOW_INMEMORY_ADAPTERS=true to opt in ` +
        `explicitly for the AWS-parked interim (see apps/web/lib/env.ts + ADR-0030). ` +
        `Fail-closed: in-memory adapters must never silently ship to production.`,
    );
  }
  return { action: input.isProductionRuntime ? 'warn-and-use' : 'use' };
}

/**
 * Resolves the runtime guard context from `process.env` (the source of truth
 * in both the Node and Edge runtimes). Kept here, reading `process.env`
 * directly, so the server and edge composition roots derive
 * `isProductionRuntime` + the opt-in identically. NODE_ENV + NEXT_PHASE are
 * framework-owned signals read raw on purpose (NEXT_PHASE is unset at runtime
 * and only set to `phase-production-build` during `next build`, so the guard
 * never fires while pre-rendering static pages).
 */
export function resolveInMemoryGuardContext(): {
  isProductionRuntime: boolean;
  allowInMemory: boolean;
} {
  return {
    isProductionRuntime:
      process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build',
    allowInMemory: process.env.QUILTY_ALLOW_INMEMORY_ADAPTERS === 'true',
  };
}

const auditedAdapters = new Set<string>();

/**
 * Returns `true` the first time an adapter name is seen in this process, so
 * the `warn-and-use` audit log fires ONCE per process rather than on every
 * container construction. (The container is memoized per process today, but
 * this makes the once-per-process guarantee explicit and memoization-proof.)
 */
export function shouldEmitInMemoryAuditLog(name: string): boolean {
  if (auditedAdapters.has(name)) return false;
  auditedAdapters.add(name);
  return true;
}
