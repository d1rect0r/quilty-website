/**
 * CSRF defense — triple-layer per D10 + D53 / OWASP 2026 + BCP draft-26 §6.3.
 *
 *   1. Origin/Referer header check against the expected origin.
 *   2. Signed double-submit token (cookie matches request body or header).
 *   3. Custom `X-Quilty-CSRF` header (preflight-required; cross-origin
 *      browsers cannot set arbitrary headers without CORS preflight).
 *
 * This module ships as a typed-throwing stub at the package-extraction
 * commit. The forms-canonical commit fills in the bodies and wires the
 * helpers into the contact form Server Action. The signatures are locked
 * here so contract tests can assert the API surface before the
 * implementation lands.
 */

import type { CsrfError, Result } from '../errors';

const NOT_IMPLEMENTED = new Error(
  'Not implemented — see D113 in the architecture strategy document.',
);

export interface CsrfVerifyInput {
  readonly origin: string | null;
  readonly referer: string | null;
  readonly cookieToken: string | null;
  readonly bodyToken: string | null;
  readonly headerToken: string | null;
  readonly expectedOrigin: string;
}

export function verifyCsrf(_input: CsrfVerifyInput): Result<true, CsrfError> {
  throw NOT_IMPLEMENTED;
}

export function generateCsrfToken(): string {
  throw NOT_IMPLEMENTED;
}
