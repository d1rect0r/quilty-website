/**
 * Composition-root accessor for the apps/web container.
 *
 * The Container interface enumerates the typed ports the workspace packages
 * expose. At this commit the interface is empty; each subsequent extraction
 * commit (security / observability / consent / email / captcha / rate-limit
 * for the hexagonal packages, plus seo / content for the utility packages)
 * widens the interface with its own port surface.
 *
 * Why a globalThis anchor (see ADR-0010 for rationale):
 *
 *   Next.js 16's webpack chunk-splitting can load this module more than once
 *   under specific RSC + client-island layouts. Without an anchor, two chunks
 *   would each call `factory()` and produce two non-identical container
 *   instances — vendor SDKs would get initialized twice, ConsentStore would
 *   diverge, and replay-block-class constants would have surprising !==
 *   identity. The nullish-coalescing assignment makes the first caller win
 *   and subsequent calls return the same identity.
 *
 *   Single-threaded JavaScript makes the `??=` operator atomic at the spec
 *   level: the read-modify-write step cannot be interleaved with another
 *   `??=` on the same property. The TOCTOU race only matters across
 *   runtimes (server / client / edge), and Next.js gives each runtime its
 *   own globalThis — so the singleton is per-runtime by construction.
 */

import type { Analytics, ErrorReporter, FeatureFlagEvaluator, Logger } from '@quilty/observability';
import type { CspBuilder, HeadersBuilder, Sanitizer } from '@quilty/security';

/**
 * Typed Container surface.
 *
 * Widened at each extraction commit. Current ports come from:
 *   - @quilty/security        — Sanitizer, CspBuilder, HeadersBuilder
 *   - @quilty/observability   — Analytics, ErrorReporter, Logger, FeatureFlagEvaluator
 *
 * Subsequent extraction commits add:
 *   - @quilty/consent         — ConsentStore
 *   - @quilty/email           — EmailSender
 *   - @quilty/captcha         — Captcha
 *   - @quilty/rate-limit      — RateLimiter
 *
 * RedirectValidator is exported from @quilty/security as a config-bound
 * factory consumers instantiate per call site (the allowlist differs per
 * caller — auth callback vs sign-out vs OAuth state extension), so it is
 * not on Container.
 *
 * The observability ports are bound to factory wrappers (wrapAnalytics,
 * wrapErrorReporter, wrapLogger) — never the raw adapters, per the
 * ADR-0010 architectural seal.
 *
 * `Replay` is intentionally NOT on the Container. Sentry Replay's
 * initialization lives in `apps/web/sentry.client.config.ts` (the
 * Next.js Sentry SDK convention file). That file composes through
 * `wrapReplay` so the D68 floor enforcement still applies, but there
 * is no programmatic `container.replay.initialize()` surface — a
 * dual-path Container property would create two init sites with
 * different enforcement coverage. The wrapper + adapter remain exported
 * from `@quilty/observability` for test composition and any future
 * non-Sentry Replay vendor.
 */
export interface Container {
  readonly sanitizer: Sanitizer;
  readonly cspBuilder: CspBuilder;
  readonly headersBuilder: HeadersBuilder;
  readonly analytics: Analytics;
  readonly errorReporter: ErrorReporter;
  readonly logger: Logger;
  readonly featureFlags: FeatureFlagEvaluator;
}

declare global {
  var __quiltyContainer: Container | undefined;
}

/**
 * Returns the singleton Container for the current runtime.
 *
 * The factory is injected by the caller — each runtime (server / client /
 * edge) imports the composition factory from its respective composition
 * file (`composition.server.ts`, `composition.client.ts`, `composition.edge.ts`)
 * and passes it here. This keeps `get-container.ts` free of any runtime-
 * specific imports so it can be safely included in any chunk.
 *
 * Idempotent: calling more than once with the same factory returns the
 * same Container identity. The first caller wins.
 */
export function getContainer(factory: () => Container): Container {
  globalThis.__quiltyContainer ??= factory();
  // Bind to a local const so the narrowing survives any future code
  // inserted between the ??= and the return. Without this, an inserted
  // log line or early branch would revert the type to `Container | undefined`.
  const container = globalThis.__quiltyContainer;
  return container;
}

/**
 * Test-only: reset the singleton. Used by unit tests that need a fresh
 * container per test case. Never call this in production code.
 */
export function __resetContainerForTesting(): void {
  globalThis.__quiltyContainer = undefined;
}
