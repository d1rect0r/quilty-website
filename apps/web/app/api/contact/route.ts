import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyCsrf, verifyHoneypot, verifyTimeTrap } from '@quilty/security';
import { getServerContainer } from '@/lib/get-container';
import { makeServerContainer } from '@/composition.server';
import { mintCorrelationId } from '@/lib/correlation-id';
import { claimIdempotent, storeIdempotent } from '@/lib/idempotency';
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

function jsonResult(envelope: ContactFormResult, status: number): NextResponse {
  return NextResponse.json(envelope, {
    status,
    headers: {
      'x-robots-tag': 'noindex, nofollow',
      'cache-control': 'no-store',
    },
  });
}

function readExpectedOrigin(): string {
  return process.env['QUILTY_SITE_ORIGIN'] ?? 'http://localhost:3000';
}

function readClientIp(headerStore: Awaited<ReturnType<typeof headers>>): string {
  const xff = headerStore.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headerStore.get('x-real-ip') ?? '0.0.0.0';
}

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

  // Idempotency-key lookup FIRST — the 8-piece sequence per the
  // module doc + Stripe convention. Looking up before Zod parse means
  // a retry with the same UUID short-circuits without re-running the
  // schema validator, AND a network-retry-after-a-successful-send
  // returns the cached success envelope rather than re-sending the
  // email. The idempotency key shape is itself loosely validated
  // here (must be present + non-empty string) — strict UUID checking
  // still happens in the Zod parse step below for fresh submissions.
  const idemKeyRaw =
    body !== null &&
    typeof body === 'object' &&
    typeof (body as { idempotency_key?: unknown }).idempotency_key === 'string'
      ? ((body as { idempotency_key: string }).idempotency_key as string)
      : '';
  if (idemKeyRaw.length > 0) {
    const cached = claimIdempotent<ContactFormResult>(`contact:${idemKeyRaw}`);
    if (cached) {
      return jsonResult(cached, cached.ok ? 200 : 400);
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
  const idemKey = `contact:${values.idempotency_key}`;

  // CSRF — triple layer.
  const headerStore = await headers();
  const cookieStore = await cookies();
  const csrfResult = verifyCsrf({
    origin: headerStore.get('origin'),
    referer: headerStore.get('referer'),
    cookieToken: cookieStore.get(CSRF_COOKIE_NAME)?.value ?? null,
    bodyToken: values.csrf_token,
    headerToken: headerStore.get('x-quilty-csrf'),
    expectedOrigin: readExpectedOrigin(),
  });
  if (!csrfResult.ok) {
    const envelope: ContactFormResult = { ok: false, reason: 'csrf' };
    storeIdempotent(idemKey, envelope);
    return jsonResult(envelope, 403);
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
    storeIdempotent(idemKey, envelope);
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

  // Time-trap.
  const timeResult = verifyTimeTrap({ token: values.time_token });
  if (!timeResult.ok) {
    const envelope: ContactFormResult = { ok: false, reason: 'time_trap' };
    storeIdempotent(idemKey, envelope);
    return jsonResult(envelope, 400);
  }

  // Turnstile / captcha verification.
  const clientIp = readClientIp(headerStore);
  const captchaResult = await container.captchaVerifier.verify(values.turnstile_token, {
    action: 'contact_form',
    remoteIp: clientIp,
  });
  if (!captchaResult.ok) {
    const envelope: ContactFormResult = { ok: false, reason: 'captcha' };
    storeIdempotent(idemKey, envelope);
    return jsonResult(envelope, 400);
  }

  // Rate-limit — per-IP first, then per-email. Either limit triggers
  // the 429. Per-email shadow is important against IP-rotating bot
  // farms targeting a single user/account.
  const ipKey = `contact:ip:${clientIp}`;
  const emailKey = `contact:email:${values.email.toLowerCase()}`;
  const ipDecision = await container.rateLimiter.consume(ipKey, RATE_LIMIT_POLICY);
  if (!ipDecision.allowed) {
    const envelope: ContactFormResult = {
      ok: false,
      reason: 'rate_limit',
      retry_after_ms: ipDecision.retryAfterMs,
    };
    storeIdempotent(idemKey, envelope);
    return jsonResult(envelope, 429);
  }
  const emailDecision = await container.rateLimiter.consume(emailKey, RATE_LIMIT_POLICY);
  if (!emailDecision.allowed) {
    const envelope: ContactFormResult = {
      ok: false,
      reason: 'rate_limit',
      retry_after_ms: emailDecision.retryAfterMs,
    };
    storeIdempotent(idemKey, envelope);
    return jsonResult(envelope, 429);
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
    storeIdempotent(idemKey, envelope);
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
  storeIdempotent(idemKey, success);
  container.logger.info('contact_form_submission', {
    route: '/api/contact',
    request_id: correlationId,
  });
  return jsonResult(success, 200);
}
