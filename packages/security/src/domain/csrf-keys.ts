/**
 * CSRF signing-key provider — runtime fetch with dual-key rotation support.
 *
 * The signing key lives in AWS Secrets Manager (`quilty/website/csrf-secret`)
 * and is fetched at RUNTIME through the Parameters-and-Secrets Lambda
 * extension (localhost:2773) — never materialized as a Lambda env var, which
 * would be readable via `lambda:GetFunctionConfiguration` and would leak into
 * IaC state. Rotation is an operator `put-secret-value`: Secrets Manager
 * moves the prior version to the `AWSPREVIOUS` staging label automatically,
 * and this provider fetches BOTH labels so verification accepts tokens signed
 * by either key — a rotation therefore never invalidates in-flight tokens.
 * See quilty-aws `docs/runbooks/website_secret_rotation.md` §2.
 *
 * Resolution order:
 *   1. Extension (only when the deploy set QUILTY_CSRF_VIA_EXTENSION=1 and an
 *      AWS session is present — never a network call in tests/dev/browser):
 *      AWSCURRENT + AWSPREVIOUS. A missing AWSPREVIOUS (no rotation has ever
 *      happened) is the documented first-rotation edge, not an error.
 *   2. CSRF_SECRET env var — the dev/test/CI path. Env vars cannot change
 *      within a running instance, so this path needs no refresh.
 *   3. Neither → throw. A missing signing key is a deployment
 *      misconfiguration; fail loud rather than silently degrade to
 *      no-signing (which would let any random string pass verification).
 *
 * Caching: the extension itself caches for its TTL (default 300s), so this
 * module re-asks localhost on a matching 300s cycle — that is what propagates
 * a rotation to WARM instances (per-instance forever-memoization would hold
 * the old key for the instance's lifetime and 403 tokens minted by fresher
 * instances). The in-flight promise is memoized so concurrent cold-start
 * callers await the same lookup, and a refresh failure serves the last good
 * key set (stale-on-error, the AWS-prescribed availability pattern) with one
 * structured warning per instance for a CloudWatch metric filter.
 *
 * Web-safe by construction (fetch + env guards only, no `node:` imports) so
 * both the Node route handlers and the proxy middleware bundle can use it.
 */

const CSRF_SECRET_ID = 'quilty/website/csrf-secret';
const CSRF_SECRET_ENV = 'CSRF_SECRET';
const CSRF_VIA_EXTENSION_ENV = 'QUILTY_CSRF_VIA_EXTENSION';

/**
 * HMAC-SHA-256 wants ≥ 256 bits of entropy; the operator seed is 32 random
 * bytes hex-encoded (64 chars), so anything shorter than 32 chars is either
 * a typo or the committed placeholder — reject both. The explicit
 * PLACEHOLDER check is defense-in-depth for the activation window where the
 * repo-public placeholder string could otherwise linger on AWSPREVIOUS.
 */
const MIN_KEY_LENGTH = 32;
const PLACEHOLDER_PREFIX = 'PLACEHOLDER';

/** Matches the extension's default SECRETS_MANAGER_TTL so a rotation is
 * visible to warm instances within one extension-cache cycle. */
const KEY_CACHE_TTL_MS = 300_000;

export interface CsrfKeySet {
  /** Signing key for newly minted tokens; first verification candidate. */
  readonly current: string;
  /** Pre-rotation key (AWSPREVIOUS) — verification-only. Null until the
   * first-ever rotation, and between rotations older than one generation. */
  readonly previous: string | null;
}

interface CachedKeys {
  readonly keys: CsrfKeySet;
  /** Next moment a refresh is due; Infinity for the terminal env-only path. */
  readonly refreshAfter: number;
}

/** Failed-refresh cool-off: bounds localhost re-probing (2 fetches × up to a
 * 2s AbortSignal each) to once per window during an extension outage instead
 * of once per request — the same backoff idea as the pepper cache's retry
 * window, sized shorter because CSRF keys are on the request critical path
 * and the cool-off also delays fail-closed self-healing. */
const FAILURE_COOLDOWN_MS = 5_000;

let cached: CachedKeys | null = null;
let inFlight: Promise<CsrfKeySet> | null = null;
/** Never-loaded failure memo: fail fast (rethrow) until the cooldown lapses,
 * so a cold-start extension outage doesn't add ~4s to every request. */
let lastFailure: { until: number; error: Error } | null = null;

// One structured warning per DEGRADATION EPISODE (re-armed by a successful
// refresh, so a second outage weeks into a warm instance still warns), so a
// fleet-wide extension outage is alarmable via a CloudWatch metric filter
// without flooding the log group. Never logs the token or any key material.
let staleWarned = false;
function warnStaleKeys(reason: string): void {
  if (staleWarned) return;
  staleWarned = true;
  if (typeof console !== 'undefined') {
    // Direct console.warn (not the Logger port): this module sits BELOW the
    // observability chokepoint (the sanitizer wrapping the logger depends on
    // this package) — same structured-warn floor as the pepper path, carries
    // no secret/token material, exists for a CloudWatch metric filter.
    // eslint-disable-next-line no-console
    console.warn(
      `[csrf-keys] key refresh failed (${reason}); serving the last-good key set. ` +
        `Rotation freshness may be lost — see website_secret_rotation.md.`,
    );
  }
}

function isUsableKey(value: string | null): value is string {
  return value !== null && value.length >= MIN_KEY_LENGTH && !value.startsWith(PLACEHOLDER_PREFIX);
}

/**
 * Fetch one staging label from the Parameters-and-Secrets extension.
 * Returns null on any failure — the CALLER decides whether null is fatal
 * (AWSCURRENT) or expected (AWSPREVIOUS before the first rotation).
 */
async function fetchStage(stage: 'AWSCURRENT' | 'AWSPREVIOUS'): Promise<string | null> {
  const token = process.env.AWS_SESSION_TOKEN;
  if (!token || typeof fetch === 'undefined') return null;
  const port = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT ?? '2773';
  const url =
    `http://localhost:${port}/secretsmanager/get?secretId=` +
    `${encodeURIComponent(CSRF_SECRET_ID)}&versionStage=${stage}`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Aws-Parameters-Secrets-Token': token },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { SecretString?: string };
    return body.SecretString && body.SecretString.length > 0 ? body.SecretString : null;
  } catch {
    return null;
  }
}

async function fetchFromExtension(): Promise<CsrfKeySet | null> {
  if (typeof process === 'undefined') return null;
  if (process.env[CSRF_VIA_EXTENSION_ENV] !== '1') return null;
  const [current, previous] = await Promise.all([
    fetchStage('AWSCURRENT'),
    fetchStage('AWSPREVIOUS'),
  ]);
  if (!isUsableKey(current)) return null;
  return {
    current,
    // A previous key that fails validation (placeholder residue, malformed)
    // is DROPPED, not fatal: verification simply won't accept its tokens.
    previous: isUsableKey(previous) ? previous : null,
  };
}

function readFromEnv(): CsrfKeySet | null {
  if (typeof process === 'undefined') return null;
  const secret = process.env[CSRF_SECRET_ENV];
  return isUsableKey(secret ?? null) && secret !== undefined
    ? { current: secret, previous: null }
    : null;
}

async function resolveKeys(): Promise<CsrfKeySet> {
  const extensionExpected =
    typeof process !== 'undefined' && process.env[CSRF_VIA_EXTENSION_ENV] === '1';

  const fromExtension = await fetchFromExtension();
  if (fromExtension) {
    cached = { keys: fromExtension, refreshAfter: Date.now() + KEY_CACHE_TTL_MS };
    staleWarned = false; // re-arm the degradation warn for the NEXT episode
    lastFailure = null;
    return fromExtension;
  }

  // Extension expected but unusable: serve the last-good set (stale-on-error,
  // the AWS-prescribed availability pattern) — and RE-STAMP the refresh clock
  // so the next probe waits out the cooldown instead of every request paying
  // the 2×2s localhost timeout for the outage's duration.
  if (extensionExpected && cached !== null) {
    warnStaleKeys('extension unavailable');
    cached = { keys: cached.keys, refreshAfter: Date.now() + FAILURE_COOLDOWN_MS };
    return cached.keys;
  }

  const fromEnv = readFromEnv();
  if (fromEnv) {
    // Under an EXPECTED extension the env is a stop-gap, not terminal: keep
    // re-probing on the cooldown so one cold-start extension blip cannot pin
    // the instance to non-rotating env keys for its lifetime (mirrors the
    // pepper cache's authoritative/retry split). Without the extension flag
    // (dev/test/CI) the env IS the source — never re-probe.
    if (extensionExpected) {
      warnStaleKeys('extension unavailable; serving env fallback');
      cached = { keys: fromEnv, refreshAfter: Date.now() + FAILURE_COOLDOWN_MS };
    } else {
      cached = { keys: fromEnv, refreshAfter: Number.POSITIVE_INFINITY };
    }
    return fromEnv;
  }

  // No key from any source: fail closed, and memo the failure briefly so a
  // cold-start extension outage fails FAST (rethrow) instead of re-paying
  // the probe per request; the cooldown keeps self-healing automatic.
  const failure = new Error(
    `CSRF signing key unavailable: the Parameters-and-Secrets extension yielded no usable ` +
      `AWSCURRENT for ${CSRF_SECRET_ID} and no ${CSRF_SECRET_ENV} env fallback (≥ ${MIN_KEY_LENGTH} ` +
      `chars, non-placeholder) is set. Minting/verification fails closed. See quilty-aws ` +
      `docs/runbooks/website_secret_rotation.md §2.`,
  );
  lastFailure = { until: Date.now() + FAILURE_COOLDOWN_MS, error: failure };
  throw failure;
}

/**
 * Resolve the CSRF key set. Throws when no usable key exists (fail-closed —
 * the caller's request 500s rather than the site silently losing CSRF
 * protection). Callers: token mint (signs with `current`) and verification
 * (accepts `current`, then `previous`).
 */
export function getCsrfKeys(): Promise<CsrfKeySet> {
  if (cached !== null && Date.now() <= cached.refreshAfter) {
    return Promise.resolve(cached.keys);
  }
  if (lastFailure !== null && Date.now() < lastFailure.until) {
    return Promise.reject(lastFailure.error);
  }
  // Memoize the in-flight promise so concurrent callers on a cold (or
  // just-expired) instance share one lookup instead of stampeding localhost.
  inFlight ??= resolveKeys().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Test seam — clears the module-level cache between test cases. */
export function __resetCsrfKeyCacheForTesting(): void {
  cached = null;
  inFlight = null;
  staleWarned = false;
  lastFailure = null;
}
