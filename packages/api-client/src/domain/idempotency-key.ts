/**
 * Idempotency-Key generation (Decision E in ADR-0017).
 *
 * UUIDv7 (IETF RFC 9562) — sortable, timestamp-bearing, 122-bit
 * entropy. Replaces ULID at our scale because UUIDv7 has the
 * IETF-RFC track record + the ecosystem-standard library (`uuid`).
 *
 * The header name is `Idempotency-Key` per IETF draft-ietf-httpapi-
 * idempotency-key-header (Stripe-canon form).
 *
 * Generated at the BFF; forwarded to the Rust backend in the request
 * header. The Rust backend caches the response keyed on
 * `IDEMP#{scope}#{email_hash}#{key}` per ADR-0016 § 3.1 + the Stripe
 * `request_hash` + `status` extension fields.
 */

import { v7 as uuidv7 } from 'uuid';

/**
 * Generate a fresh Idempotency-Key.
 *
 * Format: 36-char canonical UUID string (e.g.
 * `01904c8a-3a7b-7c34-8e6c-5e2a1d3b4f8e`). Within the IETF draft's
 * 16-256 character constraint declared by the Rust backend's
 * OpenAPI spec.
 */
export function generateIdempotencyKey(): string {
  return uuidv7();
}

/**
 * Canonical header name. Constant exported so the adapter never
 * spells the literal twice.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * Validate a caller-supplied Idempotency-Key. The BFF accepts any
 * 16-256 character string per the IETF draft + Rust-backend spec;
 * we narrow that here to ensure adapter callers don't inject
 * problematic characters (newlines, CRLF) that could split the
 * HTTP header.
 *
 * Returns true if the key is acceptable; false otherwise.
 */
export function isValidIdempotencyKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  if (key.length < 16 || key.length > 256) return false;
  // Reject CR / LF / control characters that would smuggle headers.
  // Visible ASCII + UUID-shaped chars are the working set; we permit
  // the wider range allowed by the IETF draft (token characters per
  // RFC 7230 token shape).
  return /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/.test(key) || /^[A-Za-z0-9-]+$/.test(key);
}
