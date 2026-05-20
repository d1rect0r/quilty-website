/**
 * PHI sanitizer (D67) — the load-bearing Cerebral-lesson primitive.
 *
 * Every observability emission (logs, errors, analytics events, replay
 * payloads, email-template data) passes through `sanitize()` before
 * leaving the process. Single chokepoint, not call-site discipline. The
 * FTC's $7M Cerebral order was specifically about *configuration*
 * failures, not *intent* failures — "we didn't mean to leak PHI" is not
 * a defense.
 *
 * Strategy:
 *   - Strip known-PHI keys (HIPAA Safe-Harbor §164.514(b)(2) + clinical
 *     signal + credentials + HTTP auth headers) recursively.
 *   - Redact JWT-shaped strings (3 dot-separated base64url segments).
 *   - Replace user UUIDs with stable hashes (joinable for debug
 *     correlation; not reversible to the user identity).
 *   - Truncate free-text values over 200 chars.
 *
 * Performance: this runs on EVERY observability call. Keep it O(n) over
 * the payload depth + size. Avoid regex-heavy passes; prefer Set lookups.
 */

/**
 * PHI key denylist. Covers HIPAA Safe-Harbor identifiers (§164.514(b)(2))
 * + credentials + HTTP auth headers + free-text reflection fields.
 *
 * Names + headers are the highest-risk gaps because they arrive
 * automatically in Sentry's `event.request` payload without any
 * application code involvement.
 */
const PHI_KEY_DENYLIST: ReadonlySet<string> = new Set([
  // Direct identifiers (HIPAA §164.514(b)(2)(i))
  'email',
  'email_address',
  'emailaddress',
  'name',
  'first_name',
  'firstname',
  'last_name',
  'lastname',
  'full_name',
  'fullname',
  'fname',
  'lname',
  'display_name',
  'displayname',
  'username',
  'patient_name',
  'phone',
  'phone_number',
  'phonenumber',
  'mobile',
  'fax',
  'fax_number',
  'dob',
  'date_of_birth',
  'dateofbirth',
  'birthday',
  // Geographic identifiers. `state` is intentionally NOT in this list — it
  // collides with the OAuth 2.0 `state` parameter, common form-field names,
  // and store-key conventions (Redux/Zustand). Use `state_province` or
  // `us_state` for the geographic concept; the contract test asserts both
  // are redacted while bare `state` is not.
  'address',
  'street',
  'street_address',
  'home_address',
  'city',
  'state_province',
  'us_state',
  'postal_code',
  'postalcode',
  'zip',
  'zipcode',
  // Network identifiers
  'ip',
  'ip_address',
  'ipaddress',
  // Government identifiers
  'ssn',
  'social_security_number',
  'taxid',
  'tax_id',
  // Medical + user identifiers. `user_id` + variants are the canonical
  // analytics-SDK fields (Amplitude `user_id`, PostHog `distinct_id`,
  // Segment `userId`) — a clinical event joined to a bare user identifier
  // is a HIPAA link field per §164.514(b)(2)(R). The camelCase normalizer
  // catches `userId`/`patientID`/`memberID` variants automatically.
  'mrn',
  'medical_record_number',
  'patient_id',
  'user_id',
  'subscriber_id',
  'member_id',
  'profile_id',
  'distinct_id',
  'appointment',
  'appointment_id',
  'appointment_date',
  'beneficiary_number',
  'account_number',
  // Missing direct-identifier variants (not covered by camelCase
  // normalization because the bare snake_case forms are distinct keys).
  'birthdate',
  'birth_date',
  'maiden_name',
  // Clinical signal
  'diagnosis',
  'condition',
  'symptom',
  'symptoms',
  'medication',
  'medications',
  'prescription',
  'rx',
  'treatment',
  'therapy_notes',
  'notes',
  'clinical_notes',
  'reflection',
  'reflections',
  'mood',
  'mood_score',
  'anxiety_score',
  'depression_score',
  'phq9',
  'gad7',
  'lab_result',
  'lab_results',
  'test_result',
  'genetic_data',
  // Insurance / payment
  'insurance',
  'insurance_id',
  'policy_number',
  'credit_card',
  'card_number',
  'cvv',
  'cvc',
  'pin',
  // Credentials
  'password',
  'secret',
  'api_key',
  'auth_token',
  'session_token',
  'refresh_token',
  'access_token',
  'id_token',
  // HTTP-level auth headers (these come automatically in
  // Sentry event.request.headers — bypass user-payload code paths)
  'cookie',
  'set_cookie',
  'authorization',
  'x_auth_token',
  'x_api_key',
  'x_forwarded_for',
  'cf_connecting_ip',
]);

const REDACTED = '[REDACTED]';
const MAX_FREE_TEXT_LENGTH = 200;
const MAX_DEPTH = 16;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * JWT compact serialization shape: 3 dot-separated base64url segments.
 * The naive regex matches innocent strings like `auth.my-quilty.com` or
 * `v1.0.0` — guarded with a length minimum + the `ey` prefix check (every
 * real JWT starts with `ey` because the base64url-encoded JSON header
 * always opens with `{`).
 */
const JWT_PATTERN = /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const JWT_MIN_LENGTH = 40;

/**
 * Normalize a key for denylist membership testing.
 *
 * Three transforms applied in order:
 *   1. Insert an underscore at every camelCase boundary (`userId` → `user_Id`,
 *      `patientID` → `patient_ID`). Without this, JS analytics SDKs that
 *      emit camelCase property names would bypass the denylist — the exact
 *      Cerebral failure mode (configuration gap, not intent gap).
 *   2. Replace remaining whitespace + dashes with underscores.
 *   3. Lowercase.
 *
 * Result is a canonical snake_case string the denylist Set is keyed on.
 */
function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[\s-]/g, '_')
    .toLowerCase();
}

function isPhiKey(key: string): boolean {
  return PHI_KEY_DENYLIST.has(normalizeKey(key));
}

/**
 * SHA-256 prefix of a UUID-like identifier. Deterministic so two log lines
 * from the same user join on the hash; not reversible to the user identity.
 * Uses Web Crypto via `globalThis.crypto.subtle` (available on Edge + Node
 * 24 + browser runtimes).
 */
async function hashId(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `sha256:${hex.slice(0, 16)}`;
}

function isLikelyJwt(value: string): boolean {
  return value.length >= JWT_MIN_LENGTH && JWT_PATTERN.test(value);
}

function sanitizeString(value: string): string {
  if (isLikelyJwt(value)) return REDACTED;
  if (value.length > MAX_FREE_TEXT_LENGTH) {
    return `${value.slice(0, MAX_FREE_TEXT_LENGTH)}…[truncated]`;
  }
  return value;
}

/**
 * Synchronous sanitizer (logs, error payloads). Replaces UUIDs with a
 * non-cryptographic stable hash via djb2 (sync). For PII-grade
 * redaction use `sanitizeAsync` (SHA-256).
 *
 * Type-system note: the `as T` cast preserves the shape of the input
 * type but is semantically imprecise — the runtime values for redacted
 * fields become the literal string `'[REDACTED]'` rather than their
 * original type. A precise type would be a mapped `SanitizedOf<T>` that
 * deep-replaces every leaf type with `T | '[REDACTED]'`; in practice
 * that mapped type defeats consumers' downstream narrowing without
 * adding meaningful safety, so we accept the unsoundness here.
 */
export function sanitize<T>(value: T): T {
  return sanitizeImpl(value) as T;
}

function sanitizeImpl(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return REDACTED;

  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (UUID_PATTERN.test(value)) {
      // djb2 hash — stable + collision-resistant enough for debug correlation.
      // Real cryptographic hashing happens in sanitizeAsync.
      let hash = 5381;
      for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
      }
      return `id:${hash.toString(16).padStart(8, '0')}`;
    }
    return sanitizeString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeImpl(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as object)) {
      if (isPhiKey(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = sanitizeImpl(v, depth + 1);
      }
    }
    return out;
  }

  return REDACTED;
}

/**
 * Async sanitizer with SHA-256 hashing for user-identifier fields. Use when
 * emitting to a long-lived store (CloudWatch with retention, audit pipeline)
 * where stable join keys matter more than the per-emission synchronous
 * vs async cost.
 */
export async function sanitizeAsync<T>(value: T): Promise<T> {
  return (await sanitizeAsyncImpl(value)) as T;
}

async function sanitizeAsyncImpl(value: unknown, depth = 0): Promise<unknown> {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (UUID_PATTERN.test(value)) return hashId(value);
    if (isLikelyJwt(value)) return REDACTED;
    if (value.length > MAX_FREE_TEXT_LENGTH) {
      return `${value.slice(0, MAX_FREE_TEXT_LENGTH)}…[truncated]`;
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      out.push(await sanitizeAsyncImpl(item, depth + 1));
    }
    return out;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as object)) {
      if (isPhiKey(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = await sanitizeAsyncImpl(v, depth + 1);
      }
    }
    return out;
  }

  return REDACTED;
}

/**
 * Exposed for tests + ESLint rule integration. Returns true if the given
 * key would be redacted by the sanitizer.
 */
export function isSensitiveKey(key: string): boolean {
  return isPhiKey(key);
}
