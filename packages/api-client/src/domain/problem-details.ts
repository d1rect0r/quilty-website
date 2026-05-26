/**
 * RFC 9457 Problem Details parser (Decision G in ADR-0017).
 *
 * Two parse paths:
 *   1. Canonical shape: `{ type, title, status, detail, instance, extensions }`.
 *   2. Wrapper shape: `{ error: { code, message, details } }` — some
 *      Rust-backend Cognito-bound endpoints emit this older form.
 *
 * Both shapes serialize through the same `ProblemDetails` typed
 * envelope; consumers never see the parse-time discriminator.
 *
 * The parser MUST be tolerant: a malformed problem+json body still
 * yields a "best-effort" envelope rather than throwing — consumers
 * always get something to render, and the `ApiHttpError` path covers
 * the truly-unstructured case at the adapter layer.
 */

import { slugForUri } from './problem-types';
import type { ProblemTypeSlug } from './problem-types';

/**
 * Canonical RFC 9457 + Quilty-extension shape.
 *
 * `extensions` carries vendor-specific extras the RFC permits at the
 * top level. We surface them as a typed map so consumer code can
 * narrow without inspecting `unknown`.
 *
 * Quilty extensions used today:
 *   - `retryable`: boolean override of the canonical retryability per
 *     problem-types.ts.
 *   - `retry_after_ms`: server-supplied wait hint for rate-limit
 *     problems.
 *   - `field_errors`: per-field validation messages, used by
 *     react-hook-form to focus + highlight invalid inputs.
 *   - `request_hash` / `idempotency_status`: Stripe-canon idempotency
 *     conflict + concurrent-retry detail.
 */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string | undefined;
  /**
   * Quilty-canonical extension promoted to a top-level field. The Rust
   * backend emits `correlation_id` on every problem+json response (cross-
   * referenced with the `x-correlation-id` response header) so consumer
   * code can render it directly without rummaging through `extensions`.
   * Falls back to undefined when the server didn't emit one.
   */
  readonly correlationId: string | undefined;
  readonly extensions: Readonly<Record<string, unknown>>;
  /**
   * Slug derived from `type` URI via the local type-registry. Undefined
   * when the URI is not a Quilty-issued type. Surfaced as a typed
   * convenience so consumers can switch without re-parsing the URI.
   */
  readonly slug: ProblemTypeSlug | undefined;
}

/**
 * Parse a server response into a Problem Details envelope.
 *
 * `httpStatus` is the response HTTP status — used as a fallback when
 * the payload omits `status` (some servers do this).
 *
 * `responseBody` is the parsed JSON body of the response. The caller
 * is responsible for the JSON parse; this function only handles shape
 * normalization.
 */
export function parseProblemDetails(responseBody: unknown, httpStatus: number): ProblemDetails {
  if (typeof responseBody !== 'object' || responseBody === null) {
    return synthesizeFallback(httpStatus);
  }

  const body = responseBody as Record<string, unknown>;

  // Wrapper shape: { error: { code, message, details } }
  if ('error' in body && typeof body.error === 'object' && body.error !== null) {
    return parseWrapperShape(body.error as Record<string, unknown>, httpStatus);
  }

  // Canonical RFC 9457 shape
  return parseCanonicalShape(body, httpStatus);
}

function parseCanonicalShape(body: Record<string, unknown>, httpStatus: number): ProblemDetails {
  const typeValue = pickString(body, 'type') ?? 'about:blank';
  const titleValue = pickString(body, 'title') ?? `HTTP ${httpStatus}`;
  const statusValue = pickNumber(body, 'status') ?? httpStatus;
  const detailValue = pickString(body, 'detail') ?? '';
  const instanceValue = pickString(body, 'instance');
  // Rust backend emits `correlation_id` at top level (verified against
  // quilty-aws/lambdas/rust/crates/auth-user/tests/snapshots/*.snap).
  // Promote to a first-class field on ProblemDetails so consumers can
  // render the support-reference ID without rummaging through extensions.
  const correlationIdValue = pickString(body, 'correlation_id');

  // Extensions are every top-level key EXCEPT the canonical RFC 9457
  // members AND the Quilty-promoted `correlation_id`. RFC 9457 §3.2
  // explicitly allows arbitrary additional members; the promoted
  // `correlation_id` is removed from `extensions` to avoid double-
  // exposure (the value lives on the top-level field).
  const canonicalKeys = new Set([
    'type',
    'title',
    'status',
    'detail',
    'instance',
    'correlation_id',
  ]);
  const extensions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!canonicalKeys.has(key)) {
      extensions[key] = value;
    }
  }

  return {
    type: typeValue,
    title: titleValue,
    status: statusValue,
    detail: detailValue,
    instance: instanceValue,
    correlationId: correlationIdValue,
    extensions,
    slug: slugForUri(typeValue),
  };
}

/**
 * Rust-backend wrapper shape: `{ error: { code, message, details } }`.
 * Map to canonical:
 *   - `code` → derive a `type` URI under the Quilty namespace
 *   - `message` → `detail`
 *   - `details` (if object) → `extensions`
 */
function parseWrapperShape(errorObj: Record<string, unknown>, httpStatus: number): ProblemDetails {
  const codeValue = pickString(errorObj, 'code') ?? 'unknown';
  const messageValue = pickString(errorObj, 'message') ?? `HTTP ${httpStatus}`;
  const detailsValue = errorObj.details;

  // Derive the type URI from the code. The mapping is naive (slugify
  // the code lowercase + replace underscores) but stable — if the
  // Rust backend later codifies a vendor problem-type registry, we
  // can swap this for an explicit lookup.
  const slugCandidate = codeValue.toLowerCase().replace(/_/g, '-');
  const knownSlug = slugForUri(`https://my-quilty.com/problems/v1/${slugCandidate}`);

  const type = knownSlug
    ? `https://my-quilty.com/problems/v1/${slugCandidate}`
    : `urn:quilty:error:${slugCandidate}`;

  const extensions: Record<string, unknown> = { error_code: codeValue };
  if (typeof detailsValue === 'object' && detailsValue !== null) {
    Object.assign(extensions, detailsValue);
  }

  return {
    type,
    title: knownSlug ? humanizeSlug(knownSlug) : codeValue,
    status: httpStatus,
    detail: messageValue,
    instance: undefined,
    correlationId: undefined,
    extensions,
    slug: knownSlug,
  };
}

function synthesizeFallback(httpStatus: number): ProblemDetails {
  return {
    type: 'about:blank',
    title: `HTTP ${httpStatus}`,
    status: httpStatus,
    detail: '',
    instance: undefined,
    correlationId: undefined,
    extensions: {},
    slug: undefined,
  };
}

function pickString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

function pickNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function humanizeSlug(slug: ProblemTypeSlug): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Detect the `application/problem+json` content type. Adapters call
 * this on the response Content-Type header to decide whether to parse
 * the body through `parseProblemDetails` (throwing `ApiProblemError`)
 * vs treat it as an opaque error body (throwing `ApiHttpError`).
 *
 * RFC 9457 §3 mandates `application/problem+json`; we also tolerate
 * `application/json` IF the body shape matches — some upstream proxies
 * strip the `+problem` suffix.
 */
export function isProblemJsonContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const normalised = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
  return normalised === 'application/problem+json';
}

/**
 * Read the `retry_after_ms` extension if present. Returns undefined
 * when absent — adapters fall back to the canonical exponential-
 * backoff schedule in that case.
 */
export function retryAfterMsFromProblem(problem: ProblemDetails): number | undefined {
  const value = problem.extensions['retry_after_ms'];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return undefined;
}

/**
 * Read the explicit `retryable` extension override if present. Returns
 * undefined when absent — adapters fall back to the canonical
 * retryability table in `problem-types.ts`.
 */
export function retryableFromProblem(problem: ProblemDetails): boolean | undefined {
  const value = problem.extensions['retryable'];
  return typeof value === 'boolean' ? value : undefined;
}
