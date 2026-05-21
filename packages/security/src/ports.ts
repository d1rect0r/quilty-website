/**
 * Security package ports.
 *
 * Two stateful ports: `Sanitizer` + `RedirectValidator`. Each closes
 * over real state (sanitization rules, allowlist) that justifies the
 * port abstraction. CSP construction + security-header composition
 * are pure functions exported directly from the package barrel — they
 * have no closed-over state and no vendor to swap, so the factory
 * shape would be over-engineering (confirmed by the Wave-1-close
 * research synthesis).
 *
 * Naming discipline (META-1): ports are role-shaped, never vendor-shaped.
 */

import type { RedirectValidatorError, Result } from './errors';

// ---------------------------------------------------------------------------
// Sanitizer port (D67, D91)
// ---------------------------------------------------------------------------

/**
 * Synchronous + async PHI sanitizer.
 *
 * Strategy:
 *   - Strip known-PHI keys (HIPAA Safe-Harbor §164.514(b)(2) + clinical
 *     signal + credentials + HTTP auth headers).
 *   - Redact JWT-shaped strings (3 dot-separated base64url segments + length
 *     guard + `ey` prefix check).
 *   - Replace user UUIDs with stable hashes (djb2 for sync, SHA-256 for
 *     async). The hash joins log lines from the same user for debug
 *     correlation but is not reversible to the user identity.
 *   - Truncate free-text values over 200 chars.
 *   - Recursion bounded to depth 16; deeper structures collapse to REDACTED.
 */
export interface Sanitizer {
  readonly scrub: <T>(value: T) => T;
  readonly scrubAsync: <T>(value: T) => Promise<T>;
  readonly isSensitiveKey: (key: string) => boolean;
  readonly assertNoPHI: (payload: unknown, context: string) => void;
}

// ---------------------------------------------------------------------------
// RedirectValidator port (D92)
// ---------------------------------------------------------------------------

export interface RedirectValidatorOptions {
  /** Origins that may receive a redirect, in absolute form (`https://app.example.com`). */
  readonly allowlist: readonly string[];
  /** Schemes permitted on the destination (default: `['https:']`). */
  readonly allowedSchemes?: readonly string[];
}

/**
 * Validates redirect targets against an allowlist + a scheme allowlist.
 * Returns Result so callers can branch on the failure kind without exception
 * handling.
 *
 * Defends against open-redirect (OWASP A01 / CWE-601). Typical use: post-auth
 * `?next=` parameter, sign-out `?to=` parameter, OAuth callback fan-out.
 */
export interface RedirectValidator {
  readonly isSafe: (raw: string) => Result<URL, RedirectValidatorError>;
}

// ---------------------------------------------------------------------------
// CSP option shape (D59, D93)
// ---------------------------------------------------------------------------

export interface CspOptions {
  /** Toggle dev-time relaxations (e.g. `unsafe-eval` for Next.js dev server). */
  readonly isDevelopment?: boolean;
}

// ---------------------------------------------------------------------------
// Security-header shape (D60, D94)
// ---------------------------------------------------------------------------

export type HstsPhase = 'm1' | 'm2-m6' | 'm7' | 'm8-prelaunch' | 'm8-launch';

export interface SecurityHeaderEntry {
  readonly key: string;
  readonly value: string;
}
