import { scrubValuePatterns } from './value-patterns';

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
 *   - Value-pattern scrub (D67 extension, Commit 31): every string
 *     leaf passes through `scrubValuePatterns()` to redact email-,
 *     phone-, SSN-, Luhn-valid card-, DOB-, MRN-shaped substrings
 *     in free-text fields the key-based denylist would miss
 *     (a `message` value carrying "my email is x@y.com" is the
 *     canonical failure mode).
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
  // Persistent device identifiers (Commit 31 — FTC Cerebral order's
  // "Covered Information" explicitly includes persistent identifiers
  // joined to clinical context).
  'device_id',
  'deviceid',
  'advertising_id',
  'advertisingid',
  'idfa',
  'gaid',
  'idfv',
  // Precise-location identifiers (Cerebral $7M + Monument lessons).
  'geo_lat',
  'geo_lng',
  'precise_location',
  'lat_lng',
  'latitude',
  'longitude',
  // Provider / prescriber identifiers (HIPAA-covered when joined to
  // patient context).
  'npi',
  'npi_number',
  'dea_number',
  'prescriber_id',
  'provider_id',
  // Clinical instruments (WA MHMDA explicitly names these; PHQ /
  // GAD-7 / DAST / AUDIT / PROMIS / BDI / Columbia Suicide Severity
  // Rating Scale are screening-instrument identifiers — joined to a
  // user, they are clinical signal).
  'phq2',
  'audit_c',
  'dast',
  'dast_10',
  'promis',
  'bdi',
  'cssrs',
  // Biometric identifiers (HIPAA §164.514(b)(2)(R) + WA MHMDA).
  'full_face_photo',
  'face_print',
  'voice_print',
  'biometric_identifier',
  'fingerprint',
  // Insurance + claim identifiers (covered when joined to patient).
  'claim_id',
  'eob',
  'prior_auth',
  'prior_authorization',
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
 * Pseudonymize a user-identifier-shaped value (UUID, opaque session ID).
 *
 * Uses HMAC-SHA-256 with a per-stage pepper when QUILTY_PSEUDONYM_PEPPER
 * is set (production deploy gate vends the pepper from AWS Secrets
 * Manager — never SSM Parameter Store, never config-bundled, per the
 * EDPB 01/2025 pseudonymisation guidance: the key is the GDPR Art 4(5)
 * "additional information kept separately"). Falls back to plain SHA-256
 * with a `dev:` namespace when the env var is unset (dev / test paths).
 *
 * Output is 24 hex chars (96 bits) — NIST SP 800-107r1 §5.1 collision
 * floor for log-scale volume; the prior 16-char (64-bit) prefix
 * collapsed collision resistance to ~2^32, surfacing as duplicate
 * pseudonyms above ~4B emissions.
 *
 * Versioned namespace prefix (`hmac.v1:` / `dev:`) lets the audit
 * pipeline distinguish pre-rotation vs post-rotation pseudonyms without
 * re-hashing historical data on every annual pepper rotation.
 *
 * Browser-runtime safety: NEXT_PUBLIC_* prefix is intentionally absent,
 * so the pepper is replaced with `undefined` at the Next.js client
 * bundle compile step — client-side hashing always lands on the `dev:`
 * fallback (the browser already holds the source value in clear, so a
 * client-side HMAC adds zero protection against client adversaries; the
 * server-side HMAC is what defends against log-side adversaries).
 */
const PSEUDONYM_PEPPER_ENV = 'QUILTY_PSEUDONYM_PEPPER';
const PSEUDONYM_PEPPER_VERSION = 'v1';
const PSEUDONYM_HASH_PREFIX_LENGTH = 24;

// Local minimal type for the imported HMAC key. The full WebCrypto
// `CryptoKey` lives in lib.dom.d.ts; some workspace packages compile
// without DOM lib, so we declare a structural alias here to keep the
// type-check portable across the workspace. At runtime, the value is
// the WebCrypto CryptoKey; consumers never inspect its shape.
interface PepperKey {
  readonly type: string;
  readonly extractable: boolean;
  readonly algorithm: { readonly name: string };
  readonly usages: readonly string[];
}

let cachedPepperKey: PepperKey | null = null;
let cachedPepperLookupAttempted = false;

async function getPepperKey(): Promise<PepperKey | null> {
  if (cachedPepperLookupAttempted) return cachedPepperKey;
  cachedPepperLookupAttempted = true;
  // Guard `process.env` so the module loads cleanly in browser bundles
  // where `process` is undefined; Next.js inlines the env access at
  // build time + tree-shakes the fallback when the var is empty.
  const pepper = typeof process !== 'undefined' ? process.env[PSEUDONYM_PEPPER_ENV] : undefined;
  if (pepper === undefined || pepper.length === 0) return null;
  const raw = new TextEncoder().encode(pepper);
  cachedPepperKey = (await globalThis.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )) as PepperKey;
  return cachedPepperKey;
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

async function hashId(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const key = await getPepperKey();
  if (key !== null) {
    // `key` is our local `PepperKey` alias to keep the type-check
    // portable across workspace packages whose tsconfig omits
    // lib: ["DOM"]. The runtime is the validator — Web Crypto throws
    // if the value isn't actually a valid CryptoKey.
    const sig = await globalThis.crypto.subtle.sign(
      'HMAC',
      key as unknown as Parameters<typeof globalThis.crypto.subtle.sign>[1],
      data,
    );
    return `hmac.${PSEUDONYM_PEPPER_VERSION}:${bufferToHex(sig).slice(
      0,
      PSEUDONYM_HASH_PREFIX_LENGTH,
    )}`;
  }
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return `dev:${bufferToHex(buf).slice(0, PSEUDONYM_HASH_PREFIX_LENGTH)}`;
}

/**
 * Test-only: reset the pepper key cache so a test can install a
 * different pepper between cases. Never call from production code.
 */
export function __resetPepperCacheForTesting(): void {
  cachedPepperKey = null;
  cachedPepperLookupAttempted = false;
}

function isLikelyJwt(value: string): boolean {
  return value.length >= JWT_MIN_LENGTH && JWT_PATTERN.test(value);
}

function sanitizeString(value: string): string {
  if (isLikelyJwt(value)) return REDACTED;
  // Value-pattern regex pass — catches free-text PHI (email-shaped,
  // phone-shaped, SSN-shaped, Luhn-valid card numbers, DOB-shaped
  // strings, MRN-with-marker) that the key-based denylist misses
  // (Commit 31 / D67 extension). Order matters: scrub patterns
  // BEFORE truncation so a long message with a phone number at
  // position 250 still gets that phone redacted (via the partial
  // scrub running on the full string) before the tail is cut.
  const scrubbed = scrubValuePatterns(value);
  if (scrubbed.length > MAX_FREE_TEXT_LENGTH) {
    return `${scrubbed.slice(0, MAX_FREE_TEXT_LENGTH)}…[truncated]`;
  }
  return scrubbed;
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
    // Value-pattern regex pass MUST run before truncation parity-with
    // the sync `sanitizeString()` path — without it, the async surface
    // (CloudWatch audit pipeline, future server-action explicit scrubs)
    // would emit raw email/phone/SSN/card/DOB/MRN strings while the
    // sync surface scrubbed them. [D67 + D148]
    const scrubbed = scrubValuePatterns(value);
    if (scrubbed.length > MAX_FREE_TEXT_LENGTH) {
      return `${scrubbed.slice(0, MAX_FREE_TEXT_LENGTH)}…[truncated]`;
    }
    return scrubbed;
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
