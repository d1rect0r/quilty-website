/**
 * PHI sanitizer (D67) — the load-bearing Cerebral-lesson primitive.
 *
 * Every observability emission (logs, errors, analytics events, replay
 * payloads) passes through `sanitize()` before leaving the process. Single
 * chokepoint, not call-site discipline. The FTC's $7M Cerebral order was
 * specifically about *configuration* failures, not *intent* failures —
 * "we didn't mean to leak PHI" is not a defense.
 *
 * Strategy:
 *   - Strip known-PHI keys (email, phone, dob, address, diagnosis,
 *     condition, medication, notes, etc.) recursively.
 *   - Redact JWT-shaped strings (3 dot-separated base64url segments).
 *   - Replace user UUIDs with stable SHA-256 hashes (joinable for debug
 *     correlation; not reversible to identify the user).
 *   - Truncate free-text values over a threshold (clinical reflection
 *     content could be smuggled into a generic `message` field).
 *
 * Performance: this runs on EVERY observability call. Keep it O(n) over
 * the payload depth + size. Avoid regex-heavy passes; prefer Set lookups.
 */

/**
 * PHI key denylist. Covers HIPAA Safe-Harbor identifiers (§164.514(b)(2))
 * + credentials + HTTP auth headers + free-text reflection fields.
 *
 * Round-5 HIPAA reviewer flagged gaps in the initial draft (personal names,
 * cookie/authorization headers, IP addresses, appointment IDs, lab results)
 * — now covered. Names + headers are the highest-risk gaps because they
 * arrive automatically in Sentry's `event.request` payload without any
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
  // Geographic identifiers
  'address',
  'street',
  'street_address',
  'home_address',
  'city',
  'state',
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
  // Medical identifiers
  'mrn',
  'medical_record_number',
  'patient_id',
  'appointment',
  'appointment_id',
  'appointment_date',
  'beneficiary_number',
  'account_number',
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * JWT compact serialization shape: 3 dot-separated base64url segments.
 * Round-5 reviewer flagged that the naive regex matches innocent strings
 * like `auth.my-quilty.com` or `v1.0.0`. Added length guard + base64url
 * header prefix check — every real JWT starts with `ey` (the base64-url
 * encoding of the JSON header opening brace `{`) and the compact form is
 * always > 40 chars (header + payload + sig).
 */
const JWT_PATTERN = /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const JWT_MIN_LENGTH = 40;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s-]/g, '_');
}

function isPhiKey(key: string): boolean {
  return PHI_KEY_DENYLIST.has(normalizeKey(key));
}

/**
 * Hash a UUID-like identifier into a stable SHA-256 prefix. The hash is
 * deterministic, so two log lines from the same user join on `user_id_hash`
 * for debug correlation — but the prefix is not reversible to the user
 * identity. Uses Web Crypto via `globalThis.crypto.subtle`.
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
 * non-cryptographic stable hash via a simpler djb2 fallback because
 * SHA-256 is async. For PII-grade redaction use `sanitizeAsync`.
 */
export function sanitize<T>(value: T): T {
  return sanitizeImpl(value) as T;
}

function sanitizeImpl(value: unknown, depth = 0): unknown {
  if (depth > 16) return REDACTED;

  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (UUID_PATTERN.test(value)) {
      // Synchronous djb2 hash — stable + collision-resistant enough for
      // debug correlation. Real cryptographic hashing happens in
      // sanitizeAsync.
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
 * Async sanitizer with SHA-256 hashing for user-identifier fields. Use
 * when emitting to a long-lived store (CloudWatch with retention, audit
 * pipeline) where stable join keys matter more than the per-emission
 * synchronous-vs-async cost.
 */
export async function sanitizeAsync<T>(value: T): Promise<T> {
  return (await sanitizeAsyncImpl(value)) as T;
}

async function sanitizeAsyncImpl(value: unknown, depth = 0): Promise<unknown> {
  if (depth > 16) return REDACTED;
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
