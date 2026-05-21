/**
 * Public barrel for @quilty/security.
 *
 * CSP + Security-Headers + Redirect-Validator helpers are exported as
 * plain functions, not as factory-returned port objects. A port is a
 * seam where the implementation can swap. CSP/header construction is
 * pure string composition with no vendor to swap and no closed-over
 * state worth abstracting — the factory shape would be
 * over-engineering. Direct function exports remove dead client-bundle
 * code + ~30 lines of factory ceremony with no loss of testability.
 *
 * Deep imports into `src/*` are forbidden by `.dependency-cruiser.cjs`
 * rule `cross-package-imports-must-use-barrel`.
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

// Forms-canonical domain stubs — exported so the contract test surface is
// locked at the extraction commit. Bodies fill in at the forms-canonical
// commit per D113.
export { generateCsrfToken, verifyCsrf, type CsrfVerifyInput } from './domain/csrf';
export { makeHoneypotField, verifyHoneypot, type HoneypotField } from './domain/honeypot';
export { makeRenderTimestamp, verifyTimeTrap, type TimeTrapVerifyInput } from './domain/time-trap';

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
