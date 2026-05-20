/**
 * Public barrel for @quilty/security.
 *
 * Consumers import factories + types from this file. Deep imports into
 * `src/*` are forbidden by `.dependency-cruiser.cjs` rule
 * `cross-package-imports-must-use-barrel`.
 */

import { assertNoPHI } from './domain/assert-no-phi.js';
import {
  buildMarketingCsp,
  buildPortalCsp,
  generateNonce,
  isPortalRoute,
} from './domain/csp-builder.js';
import {
  buildHstsValue,
  buildSecurityHeaders,
  currentHstsPhase,
} from './domain/headers-builder.js';
import { isSafeRedirect } from './domain/redirect-validator.js';
import { isSensitiveKey, sanitize, sanitizeAsync } from './domain/sanitizer.js';
import type {
  CspBuilder,
  CspOptions,
  HeadersBuilder,
  HstsPhase,
  RedirectValidator,
  RedirectValidatorOptions,
  Sanitizer,
  SecurityHeaderEntry,
} from './ports.js';

// ---------------------------------------------------------------------------
// Type re-exports
// ---------------------------------------------------------------------------

export type {
  CspBuilder,
  CspOptions,
  HeadersBuilder,
  HstsPhase,
  RedirectValidator,
  RedirectValidatorOptions,
  Sanitizer,
  SecurityHeaderEntry,
};

export type {
  CsrfError,
  HoneypotError,
  RedirectValidatorError,
  Result,
  TimeTrapError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Direct function re-exports (low-ceremony consumers — proxy.ts, tests)
// ---------------------------------------------------------------------------

export { sanitize, sanitizeAsync, isSensitiveKey } from './domain/sanitizer.js';
export { assertNoPHI } from './domain/assert-no-phi.js';
export {
  buildMarketingCsp,
  buildPortalCsp,
  generateNonce,
  isPortalRoute,
} from './domain/csp-builder.js';
export {
  buildHstsValue,
  buildSecurityHeaders,
  currentHstsPhase,
} from './domain/headers-builder.js';
export { isSafeRedirect } from './domain/redirect-validator.js';

// Forms-canonical domain stubs — exported so the contract test surface is
// locked at the extraction commit. Bodies fill in at the forms-canonical
// commit per D113.
export { generateCsrfToken, verifyCsrf, type CsrfVerifyInput } from './domain/csrf.js';
export { makeHoneypotField, verifyHoneypot, type HoneypotField } from './domain/honeypot.js';
export {
  makeRenderTimestamp,
  verifyTimeTrap,
  type TimeTrapVerifyInput,
} from './domain/time-trap.js';

// ---------------------------------------------------------------------------
// Port factories — what the composition root binds into the Container
// ---------------------------------------------------------------------------

/**
 * Factory: returns a Sanitizer port instance.
 *
 * The factory exists so the composition root can hold an opaque
 * `Sanitizer` reference (typed by the port interface) while other
 * packages compose their own factory wrappers AROUND this Sanitizer
 * (e.g., `@quilty/observability` wraps every adapter; `@quilty/email`
 * wraps EmailSender). This is the chokepoint primitive per D67.
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
 */
export function makeRedirectValidator(options: RedirectValidatorOptions): RedirectValidator {
  return {
    isSafe: (raw) => isSafeRedirect(raw, options),
  };
}

/**
 * Factory: returns a CspBuilder. The opts argument is reserved for future
 * configuration knobs; today the builder is stateless and the factory just
 * wraps the module-level functions in the port shape.
 */
export function makeCspBuilder(): CspBuilder {
  return {
    buildMarketing: buildMarketingCsp,
    buildPortal: buildPortalCsp,
    isPortalRoute,
    generateNonce,
  };
}

/**
 * Factory: returns a HeadersBuilder. Stateless wrapper over the module-
 * level functions; the factory shape is the seam where future per-app
 * customization (e.g., per-tenant Permissions-Policy) could plug in.
 */
export function makeHeadersBuilder(): HeadersBuilder {
  return {
    buildSecurityHeaders,
    buildHstsValue,
    currentHstsPhase,
  };
}
