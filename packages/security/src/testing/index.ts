/**
 * Testing barrel for @quilty/security.
 *
 * Exposed via the `@quilty/security/testing` subpath export. Tests + apps
 * that need deterministic seedable fakes import from here; the
 * .dependency-cruiser.cjs rule `cross-package-imports-must-use-barrel`
 * allows exactly this entry plus the package barrel.
 *
 * The production Sanitizer + RedirectValidator are already pure (no I/O,
 * no vendor SDK), so the fakes share their implementation. The fake
 * factories exist for naming consistency with future ports that ship
 * non-trivial fakes (the consent / email / captcha / rate-limit fakes
 * landing in subsequent commits will diverge from their production
 * adapters, and contract tests will parameterize over both).
 */

import { assertNoPHI } from '../domain/assert-no-phi';
import { isSafeRedirect } from '../domain/redirect-validator';
import {
  __resetPepperCacheForTesting,
  isSensitiveKey,
  sanitize,
  sanitizeAsync,
} from '../domain/sanitizer';
import type { RedirectValidator, RedirectValidatorOptions, Sanitizer } from '../ports';

/**
 * Reset the pseudonymisation pepper cache. Tests that install a
 * temporary `QUILTY_PSEUDONYM_PEPPER` value between cases (via
 * `vi.stubEnv`) MUST call this in `afterEach` so the next case re-reads
 * the env. Production code never calls this.
 */
export { __resetPepperCacheForTesting };

export function makeSanitizerFake(): Sanitizer {
  return {
    scrub: sanitize,
    scrubAsync: sanitizeAsync,
    isSensitiveKey,
    assertNoPHI,
  };
}

export function makeRedirectValidatorFake(options: RedirectValidatorOptions): RedirectValidator {
  return {
    isSafe: (raw) => isSafeRedirect(raw, options),
  };
}
