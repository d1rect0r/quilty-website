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
 *   - Value-pattern scrub (D67 + D148 extension): every string
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
  // Medical + user identifiers. `user_id` + variants (`distinct_id`,
  // `userId`) are the canonical analytics-SDK identifier fields across
  // the industry — a clinical event joined to a bare user identifier
  // is a HIPAA link field per §164.514(b)(2)(R). The camelCase
  // normalizer catches `userId`/`patientID`/`memberID` variants
  // automatically.
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
  'aws_session_token', // AWS runtime creds (normalizeKey lowercases AWS_SESSION_TOKEN)
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
  'x_aws_parameters_secrets_token', // Parameters-and-Secrets extension auth header
  'x_forwarded_for',
  'cf_connecting_ip',
  // Persistent device identifiers (D67 + D148 — FTC Cerebral order's
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
/**
 * Free-text truncation ceiling. Calibrated for the longest legitimate
 * carrier in the pipeline:
 *   - /contact form `message` field caps at 2000 chars (Zod schema).
 *   - EmailSender `templateData.message` passes through this sanitizer
 *     via wrapEmailSender; an aggressive 200-char floor would silently
 *     truncate the echoed-message acknowledgement to ~10% of its
 *     submitted length, breaking the user-locked echo UX.
 *   - Log lines beyond 2500 chars are still capped — a 2KB lower
 *     bound is restrictive enough to defend against unbounded log
 *     bloat while preserving end-to-end email content.
 */
const MAX_FREE_TEXT_LENGTH = 2500;
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
 * Versioned namespace prefix: `hmac.<seg>:` for the peppered path (`dev:`
 * for the unpeppered fallback). `<seg>` is a short one-way digest of the
 * pepper VALUE (see computePepper), NOT a code constant — so a pepper
 * rotation automatically changes the prefix with no redeploy, the segment
 * is identical across the extension + env paths for the same value, and
 * distinct pepper eras get distinct segments. This lets the audit pipeline
 * distinguish pre- vs post-rotation pseudonyms (even during a fleet-turnover
 * window where old + new coexist) without re-hashing history.
 * See docs/runbooks/website-pepper-rotation.md.
 *
 * Browser-runtime safety: NEXT_PUBLIC_* prefix is intentionally absent,
 * so the pepper is replaced with `undefined` at the Next.js client
 * bundle compile step — client-side hashing always lands on the `dev:`
 * fallback (the browser already holds the source value in clear, so a
 * client-side HMAC adds zero protection against client adversaries; the
 * server-side HMAC is what defends against log-side adversaries).
 */
const PSEUDONYM_PEPPER_ENV = 'QUILTY_PSEUDONYM_PEPPER';
const PSEUDONYM_HASH_PREFIX_LENGTH = 24;
// The version segment is a short one-way digest of the pepper VALUE (not a code
// constant), so it rotates automatically with the pepper — see computePepper().
const PSEUDONYM_VERSION_SEGMENT_LENGTH = 8;

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

// The resolved pepper: the imported HMAC key + the version SEGMENT derived from the
// pepper value (see computePepper). Cached together so hashId emits a per-pepper-era
// prefix without re-deriving on every call.
interface ResolvedPepper {
  readonly key: PepperKey;
  readonly segment: string;
}

// Memoize the in-flight PROMISE (not a boolean + a separately-set result), so
// concurrent callers on a cold instance await the SAME lookup — a hash issued while
// the pepper fetch is still pending never sees a transient null (BUG-class: silent
// `dev:` during the cold-start window, widened to the ~2s extension fetch by T2-15).
//
// Retry semantics: when the EXTENSION is the expected source (durable stages),
// a resolution that did NOT come from the extension (fallback env, or null) is
// held only for a short retry window instead of the instance lifetime —
// otherwise one slow extension startup at cold start would permanently pin
// the instance to the (possibly absent) env fallback and pseudonyms would
// silently stay `dev:`-marked until the instance recycled. Extension-served
// resolutions ARE instance-lifetime cached (rotation propagates as the fleet
// cycles — the documented T2-15 semantic). The 30s window bounds localhost
// re-probing to a trickle, not a per-log-line hammer.
//
// DELIBERATE ASYMMETRY with the CSRF key provider (csrf-keys.ts): the pepper
// is instance-lifetime cached once extension-served (pseudonym continuity
// matters more than rotation immediacy — the value-derived version segment
// already disambiguates eras), while CSRF keys refresh on a 300s TTL
// (rotation must reach warm instances or fresh tokens 403 on stale ones).
// Do not "harmonize" the two.
interface CachedPepper {
  promise: Promise<ResolvedPepper | null>;
  at: number;
  /** True when the resolution is final for this instance (extension answered,
   * or the extension isn't expected at all — env/dev path). */
  authoritative: boolean;
}
let cachedPepper: CachedPepper | null = null;
const PEPPER_RETRY_WINDOW_MS = 30_000;

// T2-15 — the pepper's Secrets Manager id, fetched at runtime via the AWS
// Parameters-and-Secrets Lambda extension (localhost:2773). The extension serves the
// CURRENT secret, so a rotation is picked up as the Lambda fleet cycles — no redeploy.
const PEPPER_SECRET_ID = 'quilty/website/pseudonym-pepper';

/** Deploy-time env pepper — the fallback + the tests / dev / browser path. */
function readPepperFromEnv(): string | undefined {
  return typeof process !== 'undefined' ? process.env[PSEUDONYM_PEPPER_ENV] : undefined;
}

/**
 * Fetch the CURRENT pepper from the AWS Parameters-and-Secrets Lambda extension.
 * Returns null (→ env fallback) whenever the extension isn't present or errors — in
 * particular whenever `AWS_SESSION_TOKEN` is unset (tests / dev / browser), so this
 * NEVER makes a network call outside the Lambda runtime. The deploy-time env fallback
 * guarantees the pepper is always available even if this fails, so log
 * pseudonymisation can never silently degrade to the unpeppered `dev:` path.
 */
async function fetchPepperFromExtension(): Promise<string | null> {
  if (typeof process === 'undefined') return null;
  // Only attempt when the deploy signalled the extension is attached (durable stages
  // set QUILTY_PEPPER_VIA_EXTENSION=1). This skips the guaranteed-to-fail localhost
  // call on preview / dev / test / browser, AND makes any failure below a REAL signal
  // (extension expected but unreachable) worth surfacing.
  if (process.env.QUILTY_PEPPER_VIA_EXTENSION !== '1') return null;
  const token = process.env.AWS_SESSION_TOKEN;
  if (!token || typeof fetch === 'undefined') return null;
  const port = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT ?? '2773';
  try {
    const res = await fetch(
      `http://localhost:${port}/secretsmanager/get?secretId=${encodeURIComponent(PEPPER_SECRET_ID)}`,
      {
        headers: { 'X-Aws-Parameters-Secrets-Token': token },
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!res.ok) {
      warnExtensionFallback(`http ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { SecretString?: string };
    if (body.SecretString && body.SecretString.length > 0) return body.SecretString;
    warnExtensionFallback('empty SecretString');
    return null;
  } catch (err) {
    // Network / parse / timeout. The env fallback still covers AVAILABILITY, but a
    // fleet-wide outage here means we're serving the (possibly stale) env pepper
    // blind — so surface it. Never logs the token or the secret value.
    warnExtensionFallback(err instanceof Error ? err.name : 'fetch failed');
    return null;
  }
}

// One structured warning per instance when the extension was EXPECTED but the env
// fallback engaged — enough for a CloudWatch metric-filter alarm on rotation-freshness
// loss, with no token / secret / PII in the message.
let extensionFallbackWarned = false;
function warnExtensionFallback(reason: string): void {
  if (extensionFallbackWarned) return;
  extensionFallbackWarned = true;
  if (typeof console !== 'undefined') {
    // Direct console.warn (not the Logger port): the sanitizer IS the
    // chokepoint the logger wraps — importing the logger here would be
    // circular. Structured, secret-free, metric-filter-friendly.
    // eslint-disable-next-line no-console
    console.warn(
      `[pepper] Parameters-and-Secrets extension unavailable (${reason}); serving the ` +
        `deploy-time env pepper. Rotation freshness may be lost — see ` +
        `website-pepper-rotation.md.`,
    );
  }
}

function getPepper(): Promise<ResolvedPepper | null> {
  const extensionExpected =
    typeof process !== 'undefined' && process.env.QUILTY_PEPPER_VIA_EXTENSION === '1';
  if (cachedPepper !== null) {
    const retryDue =
      !cachedPepper.authoritative && Date.now() - cachedPepper.at > PEPPER_RETRY_WINDOW_MS;
    if (!retryDue) return cachedPepper.promise;
  }
  const entry: CachedPepper = {
    at: Date.now(),
    // Without the extension in play, whatever computePepper resolves (env or
    // null) is final for this instance; with it, only an extension-served
    // value is — computePepper flips this flag when the extension answers.
    authoritative: !extensionExpected,
    promise: Promise.resolve(null),
  };
  entry.promise = computePepper(entry);
  cachedPepper = entry;
  return entry.promise;
}

async function computePepper(entry: CachedPepper): Promise<ResolvedPepper | null> {
  // T2-15: prefer the extension's CURRENT pepper (rotation without redeploy), then
  // the deploy-time env. An extension-served value is resolved once per warm
  // instance — a rotation propagates as instances cycle; a FAILED extension fetch
  // is retried after PEPPER_RETRY_WINDOW_MS (see getPepper). `process` is guarded
  // so this loads cleanly in browser bundles.
  const fromExtension = await fetchPepperFromExtension();
  if (fromExtension !== null) entry.authoritative = true;
  const pepper = fromExtension ?? readPepperFromEnv();
  if (pepper === undefined || pepper.length === 0) return null;
  const raw = new TextEncoder().encode(pepper);
  const [key, digest] = await Promise.all([
    globalThis.crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ]) as Promise<PepperKey>,
    globalThis.crypto.subtle.digest('SHA-256', raw),
  ]);
  // Version segment = a short one-way digest of the pepper VALUE. It rotates
  // automatically when the pepper does (no code bump / redeploy), is IDENTICAL across
  // the extension + env paths for the same value (so a fallback never forks the
  // pseudonym space for an unchanged pepper), and DIFFERS across pepper eras — so the
  // audit pipeline can distinguish pre- vs post-rotation pseudonyms, even during a
  // fleet-turnover window where old + new coexist. 8 hex (32 bits) of SHA-256 leaks
  // nothing usable about the 256-bit+ pepper.
  const segment = bufferToHex(digest).slice(0, PSEUDONYM_VERSION_SEGMENT_LENGTH);
  return { key, segment };
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
  const resolved = await getPepper();
  if (resolved !== null) {
    // `resolved.key` is our local `PepperKey` alias to keep the type-check
    // portable across workspace packages whose tsconfig omits lib: ["DOM"].
    // The runtime is the validator — Web Crypto throws if the value isn't
    // actually a valid CryptoKey.
    const sig = await globalThis.crypto.subtle.sign(
      'HMAC',
      resolved.key as unknown as Parameters<typeof globalThis.crypto.subtle.sign>[1],
      data,
    );
    return `hmac.${resolved.segment}:${bufferToHex(sig).slice(0, PSEUDONYM_HASH_PREFIX_LENGTH)}`;
  }
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return `dev:${bufferToHex(buf).slice(0, PSEUDONYM_HASH_PREFIX_LENGTH)}`;
}

/**
 * Test-only: reset the pepper key cache so a test can install a
 * different pepper between cases. Never call from production code.
 */
export function __resetPepperCacheForTesting(): void {
  cachedPepper = null;
  extensionFallbackWarned = false;
}

function isLikelyJwt(value: string): boolean {
  return value.length >= JWT_MIN_LENGTH && JWT_PATTERN.test(value);
}

function sanitizeString(value: string): string {
  if (isLikelyJwt(value)) return REDACTED;
  // Value-pattern regex pass — catches free-text PHI (email-shaped,
  // phone-shaped, SSN-shaped, Luhn-valid card numbers, DOB-shaped
  // strings, MRN-with-marker) that the key-based denylist misses
  // (D67 + D148 extension). Order matters: scrub patterns
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
