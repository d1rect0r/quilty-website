/**
 * RFC 9457 Problem Details type-URI registry (Decision G in ADR-0017).
 *
 * Eleven canonical Quilty-issued problem types. The `type` URI is the
 * stable identifier consumers switch on (i18n catalog lookup, UI
 * remediation routing, Sentry tagging). The URIs live at
 * `https://my-quilty.com/problems/v1/<slug>` so a future public
 * JSON-LD registry page can render documentation per type at the
 * trigger documented in `docs/m1.6_foundation_finishing_plan.md`.
 *
 * The set is closed; adding a new type requires an ADR amendment +
 * a coordinated Rust-backend OpenAPI extension. Per the active plan,
 * the pre-cache lives at `apps/web/lib/problems-catalog.json` (built
 * at compile time) so error rendering does NOT make a network round
 * trip at error time.
 */

export const PROBLEM_TYPES = {
  validation: 'https://my-quilty.com/problems/v1/validation',
  csrf: 'https://my-quilty.com/problems/v1/csrf',
  'rate-limit': 'https://my-quilty.com/problems/v1/rate-limit',
  'auth-required': 'https://my-quilty.com/problems/v1/auth-required',
  'consent-required': 'https://my-quilty.com/problems/v1/consent-required',
  'session-expired': 'https://my-quilty.com/problems/v1/session-expired',
  'step-up-required': 'https://my-quilty.com/problems/v1/step-up-required',
  'not-found': 'https://my-quilty.com/problems/v1/not-found',
  'service-unavailable': 'https://my-quilty.com/problems/v1/service-unavailable',
  'idempotency-key-conflict': 'https://my-quilty.com/problems/v1/idempotency-key-conflict',
  'precondition-failed': 'https://my-quilty.com/problems/v1/precondition-failed',
} as const;

/**
 * Slug union — the closed set of Quilty-issued problem-type
 * identifiers. Consumers narrow on `slug` to map to i18n strings
 * + UI remediation.
 */
export type ProblemTypeSlug = keyof typeof PROBLEM_TYPES;

/**
 * Full URI union — useful when comparing against the `type` field of
 * a parsed Problem Details payload directly.
 */
export type ProblemTypeUri = (typeof PROBLEM_TYPES)[ProblemTypeSlug];

/**
 * Reverse-lookup: URI → slug. Returns undefined when the URI is not
 * a Quilty-issued type (third-party or upstream-vendor problem types
 * are fine; the caller decides how to handle them).
 */
export function slugForUri(uri: string): ProblemTypeSlug | undefined {
  for (const [slug, registeredUri] of Object.entries(PROBLEM_TYPES) as [
    ProblemTypeSlug,
    string,
  ][]) {
    if (registeredUri === uri) return slug;
  }
  return undefined;
}

/**
 * Recommended HTTP status code per problem type. Used by the parser
 * to validate consistency between the `status` field and the `type`
 * field on payloads from cooperating servers; mismatches are not
 * errors but emit a warning log.
 */
export const RECOMMENDED_STATUS: Readonly<Record<ProblemTypeSlug, number>> = {
  validation: 400,
  csrf: 403,
  'rate-limit': 429,
  'auth-required': 401,
  'consent-required': 451,
  'session-expired': 401,
  'step-up-required': 401,
  'not-found': 404,
  'service-unavailable': 503,
  'idempotency-key-conflict': 422,
  'precondition-failed': 412,
} as const;

/**
 * Whether the problem type is canonically retryable by clients
 * without further user action. Used by the default retry policy to
 * shape retry-vs-surface decisions:
 *
 *   - `service-unavailable`: retryable (transient backend issue).
 *   - `rate-limit`: retryable AFTER the server-supplied Retry-After
 *     window elapses; the retry adapter parses the extension field.
 *   - everything else: not retryable (auth flows + validation are
 *     user-action-required).
 *
 * Consumers MAY override via the `retryable` extension field on a
 * specific Problem Details payload — the server has final say.
 */
export const CANONICALLY_RETRYABLE: Readonly<Record<ProblemTypeSlug, boolean>> = {
  validation: false,
  csrf: false,
  'rate-limit': true,
  'auth-required': false,
  'consent-required': false,
  'session-expired': false,
  'step-up-required': false,
  'not-found': false,
  'service-unavailable': true,
  'idempotency-key-conflict': false,
  'precondition-failed': false,
} as const;
