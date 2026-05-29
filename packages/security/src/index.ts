/**
 * Public barrel for @quilty/security — the client-bundle-safe default.
 *
 * Subpath layout (package.json `exports`):
 *   - `@quilty/security` (this file) — client-bundle-safe surface:
 *     CSP builders, security headers, redirect validator, sanitizer,
 *     PHI assertion, honeypot, time-trap, and the makeSanitizer +
 *     makeRedirectValidator port factories. Everything here MUST be
 *     reachable from a webpack client bundle without pulling Node-
 *     only modules.
 *   - `@quilty/security/server` — Node-only surface: `generateCsrfToken`
 *     + `verifyCsrf` (csrf.ts uses `node:crypto`). Server Components,
 *     Route Handlers, and edge-runtime code import from this subpath.
 *   - `@quilty/security/client` — narrower client subset (no sanitizer
 *     / no PHI denylist payload). Reserved for the bundle-weight
 *     reduction commit that moves `composition.client.ts` +
 *     `sentry.client.config.ts` + `WebVitalsReporter.tsx` over from
 *     this default barrel. Triggered when client-bundle size budgets
 *     tighten below the current ~4-5 KB sanitizer overhead.
 *   - `@quilty/security/testing` — test fakes + helpers.
 *
 * CSP + Security-Headers + Redirect-Validator helpers are exported as
 * plain functions, not factory-returned port objects. A port is a seam
 * where the implementation can swap. CSP/header construction is pure
 * string composition with no vendor to swap and no closed-over state
 * worth abstracting — direct function exports remove dead client-bundle
 * code + ~30 lines of factory ceremony with no loss of testability.
 *
 * Deep imports into `src/*` are forbidden by `.dependency-cruiser.cjs`
 * rule `cross-package-imports-must-use-barrel`. Subpath barrels at
 * `src/<subpath>/index.ts` satisfy the rule.
 *
 * Current client-bundle posture: the sanitizer + PHI denylist + value-
 * pattern regex set ships through THIS barrel into the client bundle
 * whenever a client module imports `makeSanitizer` (composition.client.ts)
 * or `sanitize` (sentry.client.config.ts). The runtime cost is small
 * (~4-5 KB gzipped) and the defensive value is non-negative even in
 * the browser. The `/client` subpath (already wired in package.json)
 * stands ready for the bundle-tightening commit that activates it.
 */

import { assertNoPHI } from './domain/assert-no-phi';
import { isSafeRedirect } from './domain/redirect-validator';
import { isSensitiveKey, sanitize, sanitizeAsync } from './domain/sanitizer';
import type { RedirectValidator, RedirectValidatorOptions, Sanitizer } from './ports';

// ---------------------------------------------------------------------------
// Type re-exports
// ---------------------------------------------------------------------------

export type {
  CspOptions,
  HstsPhase,
  RedirectValidator,
  RedirectValidatorOptions,
  Sanitizer,
  SecurityHeaderEntry,
} from './ports';

export type {
  CsrfError,
  HoneypotError,
  RedirectValidatorError,
  Result,
  TimeTrapError,
} from './errors';

// ---------------------------------------------------------------------------
// Direct function exports — preferred consumer pattern
// ---------------------------------------------------------------------------

export { sanitize, sanitizeAsync, isSensitiveKey } from './domain/sanitizer';
export { assertNoPHI } from './domain/assert-no-phi';
export {
  buildMarketingCsp,
  buildPortalCsp,
  generateNonce,
  isPortalRoute,
} from './domain/csp-builder';
export { buildHstsValue, buildSecurityHeaders, currentHstsPhase } from './domain/headers-builder';
export { isSafeRedirect } from './domain/redirect-validator';

// Forms-canonical domain stubs (D113). The Node-runtime CSRF surface
// (sync `generateCsrfToken` + `verifyCsrf`) lives at the `/server`
// subpath because `./domain/csrf.ts` imports `node:crypto`. The
// edge-runtime CSRF mint (`generateCsrfTokenEdge`) ships in the default
// barrel because Web Crypto is bundle-safe in both Node and Edge
// targets — proxy.ts (Edge) consumes it to mint-and-set the cookie on
// first /contact GET, satisfying the Next.js 16 invariant that Server
// Components cannot mutate cookies during render.
export { makeHoneypotField, verifyHoneypot, type HoneypotField } from './domain/honeypot';
export { makeRenderTimestamp, verifyTimeTrap, type TimeTrapVerifyInput } from './domain/time-trap';
export { generateCsrfTokenEdge } from './domain/csrf-edge';

// ---------------------------------------------------------------------------
// Port factories — only ports with real state earn a factory shape
// ---------------------------------------------------------------------------

/**
 * Factory: returns a Sanitizer port instance.
 *
 * The factory exists so other packages can compose their own wrapper
 * factories AROUND the Sanitizer (e.g., `@quilty/observability` wraps
 * every adapter; `@quilty/email` wraps EmailSender). The opaque port
 * reference is the chokepoint primitive per D67 — consumers hold a
 * `Sanitizer` interface, not the concrete `sanitize` function.
 */
export function makeSanitizer(): Sanitizer {
  return {
    scrub: sanitize,
    scrubAsync: sanitizeAsync,
    isSensitiveKey,
    assertNoPHI,
  };
}

/**
 * Factory: returns a RedirectValidator bound to the given allowlist.
 * The factory earns its shape because the validator closes over the
 * caller-provided allowlist — that's the per-call-site policy that
 * makes the port-style abstraction non-trivial.
 */
export function makeRedirectValidator(options: RedirectValidatorOptions): RedirectValidator {
  return {
    isSafe: (raw) => isSafeRedirect(raw, options),
  };
}
