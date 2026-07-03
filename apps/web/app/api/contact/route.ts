import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyHoneypot, verifyTimeTrap } from '@quilty/security';
import { verifyCsrf } from '@quilty/security/server';
import { getServerContainer } from '@/lib/get-container';
import { makeServerContainer } from '@/composition.server';
import { mintCorrelationId } from '@/lib/correlation-id';
import { readExpectedOrigin } from '@/lib/expected-origin';
import {
  claimIdempotent,
  releaseIdempotent,
  storeIdempotent,
  IdempotencyUnavailableError,
} from '@/lib/idempotency';
import {
  contactFormSchema,
  type ContactFormResult,
} from '@/app/[locale]/(marketing)/contact/schema';

/**
 * POST /api/contact — 8-piece canonical form pattern endpoint (D113).
 *
 * Sequence (fail-fast, returns coarse Result envelope to caller):
 *   1. Idempotency-key lookup — return cached envelope on retry.
 *   2. Zod parse — schema-shape validation.
 *   3. CSRF verify — Origin/Referer + cookie+body double-submit +
 *      X-Quilty-CSRF header. Triple-layer per OWASP 2026 + D53.
 *   4. Honeypot — bot signature; reject silently.
 *   5. Time-trap — render-to-submit elapsed within plausible window.
 *   6. Turnstile verify (CaptchaVerifier port; in-memory default-pass
 *      pre-Cloudflare-BAA, real Turnstile post-activation).
 *   7. Rate-limit — per-IP AND per-email sliding window (5 req / 10min).
 *   8. Sanitizer + EmailSender.send — the wrapEmailSender chokepoint
 *      scrubs templateData via the @quilty/security sanitizer
 *      (D67 + D148 value-pattern regex catches free-text PHI in the
 *      echoed message body).
 *
 * Response shape: `ContactFormResult` JSON envelope. The `digest`
 * field on success is the request-scoped correlation ID
 * (`q1m_<crockford-base32>`) the user can quote in support emails.
 *
 * Header policy:
 *   - `X-Robots-Tag: noindex` — endpoint is not a crawlable surface.
 *   - `Cache-Control: no-store` — every response is per-request.
 *
 * Non-PHI invariant (D31): the JSON response body MUST NOT carry the
 * user's submitted content. Only the correlation ID + the coarse
 * reason classifier flow back to the client.
 */

const CSRF_COOKIE_NAME = '__Host-quilty_csrf';
const RATE_LIMIT_POLICY = { limit: 5, windowMs: 10 * 60 * 1000 } as const;

/**
 * Rate-limit bypass for k6 load tests. Two-factor unlock:
 *   1. `X-Load-Test-Bypass` header carries the rotating secret.
 *   2. `RATELIMIT_BYPASS_TOKEN` env var matches; production tier
 *      MUST leave this unset so the header is rejected even when an
 *      attacker guesses the token.
 *
 * Per ADR-0017 + TW-026 (RATELIMIT_BYPASS_TOKEN quarterly rotation),
 * staging/preview environments set this env at deploy time, rotate
 * quarterly via the trigger watchlist. Production environments
 * intentionally omit it — the function below short-circuits to
 * `false` when the env is unset, so the bypass header is inert
 * regardless of what value the client sends.
 *
 * Defense in depth: even with the correct token + env set, the
 * caller should arrive over the load-test source-IP allowlist
 * configured at the WAF tier (handled outside this file).
 */
function isLoadTestBypass(headerStore: Awaited<ReturnType<typeof headers>>): boolean {
  const envTokenRaw = process.env['RATELIMIT_BYPASS_TOKEN'];
  // Trim guards against env-injection regression where an operator
  // accidentally exports `RATELIMIT_BYPASS_TOKEN=" "` (whitespace-only):
  // the empty-after-trim check refuses to arm the bypass on that
  // configuration. Both raw and trimmed checks are required because
  // `?.trim()` returns the empty string for undefined; we need the
  // explicit nullish guard first.
  if (envTokenRaw == null) return false;
  const envToken = envTokenRaw.trim();
  if (envToken.length === 0) return false;
  const headerToken = headerStore.get('x-load-test-bypass');
  if (!headerToken) return false;
  // True constant-time compare: compute SHA-256 of BOTH sides and
  // compare the fixed-length digests via Node's timingSafeEqual.
  // Hashing first defeats the length-oracle that a direct
  // `headerToken.length !== envToken.length` short-circuit (or even
  // a padded XOR loop iterated to the longer side) leaks. SHA-256
  // digests are always 32 bytes regardless of input length, so the
  // path through timingSafeEqual is constant-time across ANY input.
  const envDigest = createHash('sha256').update(envToken).digest();
  const headerDigest = createHash('sha256').update(headerToken).digest();
  return timingSafeEqual(envDigest, headerDigest);
}

function jsonResult(envelope: ContactFormResult, status: number): NextResponse {
  return NextResponse.json(envelope, {
    status,
    headers: {
      'x-robots-tag': 'noindex, nofollow',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Derive the HTTP status code from a cached `ContactFormResult`. The
 * idempotency cache stores only the envelope (per D113); on a duplicate
 * submission the route returns the cached envelope with this status
 * code so the response is byte-identical to the live path. A blanket
 * `cached.ok ? 200 : 400` would collapse 403 / 429 / 502 into 400 and
 * mask the original failure semantics for callers that branch on
 * status (Playwright contract tests, third-party retry policies, etc).
 *
 * Honeypot trip intentionally returns 200 even though `ok: true`
 * (the bot must not learn it was filtered); the live path matches.
 */
function statusForResult(envelope: ContactFormResult): number {
  if (envelope.ok) return 200;
  switch (envelope.reason) {
    case 'csrf':
      return 403;
    case 'rate_limit':
      return 429;
    case 'send_failed':
      return 502;
    case 'validation':
    case 'time_trap':
    case 'captcha':
    default:
      return 400;
  }
}

function readClientIp(headerStore: Awaited<ReturnType<typeof headers>>): string {
  const xff = headerStore.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headerStore.get('x-real-ip') ?? '0.0.0.0';
}

/**
 * Type-safe pre-Zod idempotency-key extractor. Narrows `unknown` via
 * an object + property + typeof chain so the return type is `string`
 * without an unsafe cast. Returns the empty string when the field is
 * missing or non-string — the call site treats empty-string as a
 * fresh request (no lookup, fall through to Zod).
 */
function extractIdempotencyKey(raw: unknown): string {
  if (raw === null || typeof raw !== 'object') return '';
  const candidate = (raw as { idempotency_key?: unknown }).idempotency_key;
  return typeof candidate === 'string' ? candidate : '';
}

/**
 * Pre-claim key-shape gate (mirrors the Zod `z.string().uuid()` the schema
 * enforces later). The claim is a DynamoDB write that runs BEFORE the rate
 * limiter, so without this an attacker gets one unauthenticated write per
 * arbitrary-string key (WAF rate rules are the only bound), and a >2KB key
 * is an invalid partition key whose ValidationException would surface as an
 * attacker-triggerable 502 indistinguishable from a real table outage.
 * A non-UUID key skips the idempotency layer entirely — Zod then rejects it
 * with the proper field error.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<NextResponse> {
  const container = getServerContainer(makeServerContainer);
  const correlationId = mintCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResult(
      { ok: false, reason: 'validation', field_errors: { message: 'Malformed request body.' } },
      400,
    );
  }

  // Idempotency-key claim FIRST — the 8-piece sequence per the
  // module doc + Stripe convention. Claiming before Zod parse means
  // a retry with the same UUID short-circuits without re-running the
  // schema validator, AND a network-retry-after-a-successful-send
  // returns the cached success envelope rather than re-sending the
  // email. The claim is two-phase: a concurrent duplicate (double-
  // click racing itself) gets `inflight` → a short client retry, by
  // which time the winner's envelope is cached. The key must be
  // UUID-shaped BEFORE the claim (see UUID_SHAPE) — a non-UUID key
  // skips the layer and lands in the Zod field error below. Because
  // keys are client-minted per mount and never persisted in cookies/
  // URLs, an attacker cannot target a victim's key; the residual
  // (writes ahead of the rate limiter) is bounded by the WAF rules.
  const idemKeyRaw = extractIdempotencyKey(body);
  const idempotencyActive = UUID_SHAPE.test(idemKeyRaw);
  const idemKey = `contact:${idemKeyRaw.toLowerCase()}`;
  // Release a fresh claim rejected by a PRE-execution guard (the cache-only-
  // executed-outcomes rule in lib/idempotency.ts) — a cached guard failure
  // would brick every retry under the client's per-mount key for the TTL.
  const releaseClaim = async (): Promise<void> => {
    if (idempotencyActive) await releaseIdempotent(idemKey);
  };
  if (idempotencyActive) {
    let claim;
    try {
      claim = await claimIdempotent<ContactFormResult>(idemKey);
    } catch (err) {
      if (err instanceof IdempotencyUnavailableError) {
        // Fail CLOSED: without a claim we cannot rule out a duplicate
        // send — refuse rather than risk it. 502 matches the "we did
        // not perform the side effect" semantics of send_failed.
        container.logger.warn('contact_form_idempotency_unavailable', {
          route: '/api/contact',
          request_id: correlationId,
        });
        return jsonResult({ ok: false, reason: 'send_failed' }, 502);
      }
      throw err;
    }
    if (claim.state === 'cached') {
      return jsonResult(claim.value, statusForResult(claim.value));
    }
    if (claim.state === 'inflight') {
      // A concurrent request with the same key is mid-flight; the
      // client retries shortly and hits the cached envelope. (The
      // envelope schema has no dedicated concurrent-request reason —
      // logs disambiguate; a dedicated reason code is a launch-gate.md row.)
      return jsonResult({ ok: false, reason: 'rate_limit', retry_after_ms: 2000 }, 429);
    }
  }

  const parsed = contactFormSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof typeof contactFormSchema.shape, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (
        typeof key === 'string' &&
        key in contactFormSchema.shape &&
        fieldErrors[key as keyof typeof contactFormSchema.shape] === undefined
      ) {
        fieldErrors[key as keyof typeof contactFormSchema.shape] = issue.message;
      }
    }
    await releaseClaim();
    return jsonResult(
      {
        ok: false,
        reason: 'validation',
        field_errors: fieldErrors,
      },
      400,
    );
  }
  const values = parsed.data;

  // CSRF — triple layer. The verify RESULT is exhaustive, but the key
  // PROVIDER throws when no signing key is available (fail-closed) — map
  // that to a structured retryable envelope instead of a bare 500 the
  // client can't parse (mirrors the idempotency-unavailable handling).
  const headerStore = await headers();
  const cookieStore = await cookies();
  let csrfResult;
  try {
    csrfResult = await verifyCsrf({
      origin: headerStore.get('origin'),
      referer: headerStore.get('referer'),
      cookieToken: cookieStore.get(CSRF_COOKIE_NAME)?.value ?? null,
      bodyToken: values.csrf_token,
      headerToken: headerStore.get('x-quilty-csrf'),
      expectedOrigin: readExpectedOrigin(),
    });
  } catch {
    container.logger.warn('contact_form_csrf_keys_unavailable', {
      route: '/api/contact',
      request_id: correlationId,
    });
    await releaseClaim();
    return jsonResult({ ok: false, reason: 'send_failed' }, 502);
  }
  if (!csrfResult.ok) {
    await releaseClaim();
    return jsonResult({ ok: false, reason: 'csrf' }, 403);
  }

  // Honeypot — read all FormData-style fields, find anything OTHER
  // than the known schema fields with a non-empty value. The handler
  // is JSON-bodied here, so the convention is: any extra top-level
  // string property on the body is a honeypot trip.
  const knownKeys = new Set(Object.keys(contactFormSchema.shape));
  let honeypotFilled: string | null = null;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (!knownKeys.has(k) && typeof v === 'string' && v.length > 0) {
      honeypotFilled = k;
      break;
    }
  }
  if (honeypotFilled !== null) {
    verifyHoneypot({ fieldName: honeypotFilled, value: 'tripped' });
    // Silent success to the bot — return ok envelope but DO NOT send
    // an email. The user-facing copy never knows.
    const envelope: ContactFormResult = { ok: true, digest: correlationId };
    await storeIdempotent(idemKey, envelope);
    // Log a numeric tally (length of the tripped field name) rather
    // than the field name itself — the honeypot rotation pool includes
    // PHI-adjacent names like `address_line_3` and logging the name
    // verbatim would surface a PHI-shaped key in CloudWatch. The
    // tally is sufficient signal for the abuse-trend dashboard.
    container.logger.warn('contact_form_honeypot_tripped', {
      route: '/api/contact',
      field_name_length: honeypotFilled.length,
      request_id: correlationId,
    });
    return jsonResult(envelope, 200);
  }

  // Time-trap. Guard failure — released, not cached: "too fast" / "stale
  // form" are exactly the rejections a human corrects and resubmits under
  // the same per-mount key.
  const timeResult = verifyTimeTrap({ token: values.time_token });
  if (!timeResult.ok) {
    await releaseClaim();
    return jsonResult({ ok: false, reason: 'time_trap' }, 400);
  }

  // Turnstile / captcha verification. Guard failure — released, not cached
  // (the user redoes the challenge and resubmits).
  const clientIp = readClientIp(headerStore);
  const captchaResult = await container.captchaVerifier.verify(values.turnstile_token, {
    action: 'contact_form',
    remoteIp: clientIp,
  });
  if (!captchaResult.ok) {
    await releaseClaim();
    return jsonResult({ ok: false, reason: 'captcha' }, 400);
  }

  // Rate-limit — per-IP first, then per-email. Either limit triggers
  // the 429. Per-email shadow is important against IP-rotating bot
  // farms targeting a single user/account.
  //
  // Load-test bypass: when X-Load-Test-Bypass matches RATELIMIT_BYPASS_TOKEN
  // (env var, unset in production), skip the rate-limit decision but
  // still run captcha + CSRF + honeypot above. k6 scenarios supply
  // the bypass token from `tests/load/lib/bypass-token.ts`; without
  // it, k6 hits the rate-limit ceiling within the first 5 iterations.
  const bypassRateLimit = isLoadTestBypass(headerStore);
  if (bypassRateLimit) {
    // Audit-trail per D42d: every bypass MUST land in CloudWatch
    // (the only server-side authoritative trail for D31 zero-PHI
    // posture). The log carries the correlation ID only — no token
    // fragment, no header value — so a leaked-token incident is
    // greppable without exposing the secret on the way to the log.
    container.logger.info('contact_form_rate_limit_bypassed', {
      route: '/api/contact',
      request_id: correlationId,
    });
  }
  const ipKey = `contact:ip:${clientIp}`;
  // Hash the email before using it as the rate-limit key. The raw
  // email is a HIPAA §164.514(b)(2)(i) direct identifier; storing it
  // as a Map/DynamoDB key risks PHI leakage if the rate-limit adapter
  // ever logs the key in a SDK-level exception or DynamoDB
  // ConditionExpression error. SHA-256 is deterministic (same email →
  // same bucket) so the per-email rate-limit semantics are preserved.
  const emailHash = createHash('sha256')
    .update(values.email.toLowerCase())
    .digest('hex')
    .slice(0, 32);
  const emailKey = `contact:email:${emailHash}`;
  if (!bypassRateLimit) {
    // Rate-limit rejections are guard failures — released, not cached: a
    // cached 429 would keep serving a STALE retry_after_ms under the
    // client's per-mount key long after the window actually reset.
    const ipDecision = await container.rateLimiter.consume(ipKey, RATE_LIMIT_POLICY);
    if (!ipDecision.allowed) {
      const envelope: ContactFormResult = {
        ok: false,
        reason: 'rate_limit',
        retry_after_ms: ipDecision.retryAfterMs,
      };
      await releaseClaim();
      return jsonResult(envelope, 429);
    }
    const emailDecision = await container.rateLimiter.consume(emailKey, RATE_LIMIT_POLICY);
    if (!emailDecision.allowed) {
      const envelope: ContactFormResult = {
        ok: false,
        reason: 'rate_limit',
        retry_after_ms: emailDecision.retryAfterMs,
      };
      await releaseClaim();
      return jsonResult(envelope, 429);
    }
  }

  // Send acknowledgement email. wrapEmailSender already composes the
  // sanitizer chokepoint around templateData — the value-pattern
  // regex pass (D67 + D148) catches phone/email/SSN/card/DOB/MRN in
  // the echoed message body even though the visible disclaimer
  // instructs users not to include sensitive data.
  const sendResult = await container.emailSender.send({
    kind: 'contact_acknowledgement',
    to: values.email,
    templateData: {
      name: values.name,
      subject: values.subject,
      message: values.message,
      reference: correlationId,
    },
  });
  if (!sendResult.ok) {
    const envelope: ContactFormResult = { ok: false, reason: 'send_failed' };
    await storeIdempotent(idemKey, envelope);
    // Log only the coarse reason classifier (transient / permanent).
    // The adapter's `message` field is intentionally NOT forwarded —
    // SES error strings can echo the recipient address, and while the
    // logger wrapper would scrub email-shaped substrings via the
    // value-pattern regex, the broader set of SES-emitted detail
    // strings is unbounded. The reason classifier carries enough
    // operational signal for the alert/dashboard surface; deeper
    // diagnostic detail flows to Sentry (which already wraps every
    // event through the PHIScrubber chokepoint).
    container.logger.warn('contact_form_email_send_failed', {
      route: '/api/contact',
      reason: sendResult.reason,
      request_id: correlationId,
    });
    return jsonResult(envelope, 502);
  }

  const success: ContactFormResult = { ok: true, digest: correlationId };
  await storeIdempotent(idemKey, success);
  container.logger.info('contact_form_submission', {
    route: '/api/contact',
    request_id: correlationId,
  });
  return jsonResult(success, 200);
}
