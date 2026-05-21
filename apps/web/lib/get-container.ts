/**
 * Composition-root accessor for the apps/web container.
 *
 * The Container is a discriminated union of three runtime-specific
 * shapes — `ServerContainer | ClientContainer | EdgeContainer` —
 * tagged by the `runtime` literal. TypeScript narrows on the tag so
 * server-only ports (emailSender, captchaVerifier, rateLimiter) are
 * statically inaccessible from client code; an attempted access is
 * a build error, not a runtime null check.
 *
 * The discriminated shape replaces the prior god-object Container
 * with optional server-only fields. The earlier shape relied on a
 * JSDoc convention ("client code MUST NOT call cspBuilder"); the
 * discriminated shape upgrades that convention to a type-system
 * guarantee.
 *
 * Why a globalThis anchor (see ADR-0010 for rationale):
 *
 *   Next.js 16's webpack chunk-splitting can load this module more
 *   than once under specific RSC + client-island layouts. Without an
 *   anchor, two chunks would each call `factory()` and produce two
 *   non-identical container instances — vendor SDKs would get
 *   initialized twice, replay-block-class constants would have
 *   surprising !== identity. The nullish-coalescing assignment makes
 *   the first caller win and subsequent calls return the same
 *   identity.
 *
 *   Per-runtime global slots (`__quiltyServerContainer`,
 *   `__quiltyClientContainer`, `__quiltyEdgeContainer`) make the
 *   slot-type-to-accessor alignment sound by construction —
 *   `getServerContainer` reads the server slot and returns
 *   `ServerContainer`; no cast required, no runtime tag check.
 */

import type { CaptchaVerifier } from '@quilty/captcha';
import type { EmailSender } from '@quilty/email';
import type { Analytics, ErrorReporter, FeatureFlagEvaluator, Logger } from '@quilty/observability';
import type { RateLimiter } from '@quilty/rate-limit';
import type { Sanitizer } from '@quilty/security';

/**
 * Ports present in every runtime container. The Sanitizer is the PHI
 * chokepoint per D67 + ADR-0010; the four observability ports are
 * present in client + edge bundles too because RSC streaming and
 * proxy.ts both need structured logging + error reporting.
 *
 * Analytics is present uniformly because the wrapper's default-deny
 * consent gate makes it safe to wire in any runtime — pre-consent
 * track calls no-op silently regardless of where they fire.
 */
interface BaseContainer {
  readonly sanitizer: Sanitizer;
  readonly logger: Logger;
  readonly errorReporter: ErrorReporter;
  readonly analytics: Analytics;
  readonly featureFlags: FeatureFlagEvaluator;
}

/**
 * Server-runtime container. Wires the full server-only port surface
 * — email + captcha + rate-limit. CSP + Security-Headers helpers are
 * exported as plain functions from `@quilty/security` (not on the
 * Container) because they're stateless and don't benefit from the
 * port abstraction. All container fields are required: a Route
 * Handler that calls `container.emailSender` gets the type without
 * narrowing.
 */
export interface ServerContainer extends BaseContainer {
  readonly runtime: 'server';
  readonly emailSender: EmailSender;
  readonly captchaVerifier: CaptchaVerifier;
  readonly rateLimiter: RateLimiter;
}

/**
 * Client-runtime container. Carries only the ports a Client Component
 * legitimately needs. Server-only ports are absent from the type —
 * accessing them is a build error, not a runtime null check.
 *
 * The Sentry browser Replay integration is initialized in
 * `sentry.client.config.ts`, NOT through this Container. See ADR-0010
 * for the dual-path-avoidance rationale.
 */
export interface ClientContainer extends BaseContainer {
  readonly runtime: 'client';
}

/**
 * Edge-runtime container. Consumed by `proxy.ts` + Edge Route Handlers.
 * The CSP + security-header helpers are exported as plain functions
 * from `@quilty/security` — proxy.ts imports them directly without
 * routing through a port. Server-only adapters (SES, Turnstile,
 * DynamoDB rate-limit) are absent because the Edge runtime cannot
 * import them (Node-only APIs / SDK incompatibilities).
 */
export interface EdgeContainer extends BaseContainer {
  readonly runtime: 'edge';
}

/**
 * Discriminated union of every runtime-specific container shape.
 * Consumers that hold a `Container` value (e.g., a helper accepting
 * any runtime) narrow on the `runtime` tag to access runtime-specific
 * ports.
 */
export type Container = ServerContainer | ClientContainer | EdgeContainer;

declare global {
  var __quiltyServerContainer: ServerContainer | undefined;
  var __quiltyClientContainer: ClientContainer | undefined;
  var __quiltyEdgeContainer: EdgeContainer | undefined;
}

/**
 * Returns the singleton ServerContainer for the server runtime.
 * Idempotent: the first caller wins; subsequent calls return the
 * same identity. Per-runtime slots make the type-to-slot alignment
 * sound (no cast).
 */
export function getServerContainer(factory: () => ServerContainer): ServerContainer {
  globalThis.__quiltyServerContainer ??= factory();
  const container = globalThis.__quiltyServerContainer;
  return container;
}

/**
 * Returns the singleton ClientContainer for the client runtime.
 */
export function getClientContainer(factory: () => ClientContainer): ClientContainer {
  globalThis.__quiltyClientContainer ??= factory();
  const container = globalThis.__quiltyClientContainer;
  return container;
}

/**
 * Returns the singleton EdgeContainer for the edge runtime.
 */
export function getEdgeContainer(factory: () => EdgeContainer): EdgeContainer {
  globalThis.__quiltyEdgeContainer ??= factory();
  const container = globalThis.__quiltyEdgeContainer;
  return container;
}

/**
 * Test-only: reset all runtime singletons. Used by unit tests that
 * need a fresh container per case. Never call this in production code.
 */
export function __resetContainerForTesting(): void {
  globalThis.__quiltyServerContainer = undefined;
  globalThis.__quiltyClientContainer = undefined;
  globalThis.__quiltyEdgeContainer = undefined;
}
