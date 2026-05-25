# ADR-0012: Canonical 8-piece form pattern for every user-input surface

- **Status:** Accepted
- **Date:** 2026-05-24
- **Last reviewed:** 2026-05-24
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** `docs/website_strategy_discussion.md` § D113
- **Related decisions:** D10 (CSRF posture), D31 (zero PHI on website tier), D53 (CSRF triple-layer), D67 (PHI sanitizer chokepoint), D89 (Turnstile lock), D95 + D121 (Result envelope discriminator), D117 (forms canonical), D148 (PHI-in-error ESLint rule)
- **Related ADRs:** [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md)
- **Related research:** Stripe webhook + Idempotency-Key conventions; Discord public-form abuse patterns; Linear contact-form posture; OWASP Cheat-Sheet 2026 (CSRF, automation defense)
- **Software versions assumed:** Next.js 16.2.6, React 19, RHF 7.65+, Zod 3.25+, @quilty/security 0.1, @quilty/captcha 0.1, @quilty/rate-limit 0.1, @quilty/email 0.1

## Context

The website ships user-input forms — `/contact` first, with subprocessors-subscribe, waitlist, and contact-sales reserved as M2-M3 surfaces. Each form is a Cerebral-shaped risk surface: a misconfigured field can leak PHI to the email channel, a missing CSRF defense can authorize a state-changing call, a missing rate-limit can drive abuse-driven cost, and a missing idempotency-key can double-charge a user when their browser retries.

The 2026 enterprise canon (Stripe + Discord + Linear + Cal.com) converged on a layered submission gate where each layer fails independently — no single primitive carries the entire load. Anti-pattern: a single "validate + sanitize + send" Server Action with no observability of which gate failed.

The "do nothing" outcome would be a form pipeline that depends on the developer remembering each piece. Wave 5's 6-reviewer audit explicitly named the absence of a canonical pattern as the highest-leverage close-out gap once `/contact` itself was scaffolded.

## Decision

Every user-input form on the site composes the following **8 pieces, in this order**, before reaching the side-effect (email send, account mutation, payment intent):

1. **Idempotency-key lookup (claim-before-Zod-parse).** Client mints `crypto.randomUUID()` at form mount; server SET-NX in the idempotency store (10-min TTL). Duplicate submissions short-circuit with the cached `Result` envelope — never re-run the side-effect.
2. **Zod schema parse.** Shared source of truth for client (RHF via `zodResolver`) AND server (validate-before-execute). Static error messages only — no user-supplied content interpolated into the messages (drift guard: a regression-test asserts no submitted field value reaches the JSON response on validation failure).
3. **CSRF triple-layer** (D10 + D53):
   - Origin/Referer header match against `QUILTY_SITE_ORIGIN`.
   - Cookie token + body token + custom `X-Quilty-CSRF` header — all three must match via `crypto.timingSafeEqual`.
   - HMAC-SHA-256 signature over the random component, bound to the server-held `CSRF_SECRET`.
4. **Honeypot empty-check.** Randomized field name from a rotation pool (`fax_number`, `extension`, `prefix`, `middle_initial`, `address_line_3`) — CSS-offscreen, `aria-hidden="true"`, `tabindex="-1"`, `autocomplete="nope"`, `data-lpignore`, `data-1p-ignore`. A filled honeypot returns `ok: true` silently (silent-200 to the bot; no email send).
5. **Time-trap window.** Base64url-encoded `{ t: <unix-ms> }` token minted server-side at render; verified server-side at submit. Minimum 1500 ms (lower bound — humans can't fill faster), maximum 30 min (upper bound — stale render, "form expired, please reload"). Three failure kinds: `time_too_fast`, `time_too_slow`, `malformed_token`.
6. **CaptchaVerifier port verify.** In-memory default-pass adapter pre-Cloudflare-BAA; Turnstile adapter activates post-BAA + secret provisioning. Real `POST` to `challenges.cloudflare.com/turnstile/v0/siteverify` with `AbortController` timeout (5 s default). Form-encoded body; closure-captured secret (never retained as object property — heap-dump exfiltration defense).
7. **Rate-limit** (`@quilty/rate-limit` sliding window). Per-IP **AND** per-email (5 req / 10 min). Per-email shadow defends against IP-rotating bot farms targeting a single user/account.
8. **Sanitizer + EmailSender.send** (D67 chokepoint). `wrapEmailSender` scrubs `templateData` via `@quilty/security/sanitize` — Commit 31's value-pattern regex pass catches free-text PHI (email/phone/SSN/card/DOB/MRN) in the echoed message body.

The Route Handler returns a `Result` envelope: `{ ok: true; digest } | { ok: false; reason; field_errors?; retry_after_ms? }`. The `ok` discriminator (not `success`) is per D95 + D121 to avoid the TypeScript generic-narrowing bug.

The response NEVER carries user-submitted content. Only the correlation ID (`q1m_<crockford-base32>`) + a coarse reason classifier flow back to the client. `X-Robots-Tag: noindex, nofollow` + `Cache-Control: no-store` on every response.

## Consequences

### Positive

- **Cerebral-lesson chokepoint discipline.** Each layer fails independently; observability tells operators which gate triggered. The PHI sanitizer chokepoint (layer 8) is structurally unbypassable for the email channel.
- **Zero PHI in the response envelope.** A future Zod refine that interpolates user input would break the D31 invariant; the drift-guard test catches this at PR time.
- **Idempotency = zero double-sends.** Network retry + double-click + page-reload-after-submit all return the cached envelope.
- **Idempotency-before-Zod-parse.** A retry with the same UUID short-circuits without re-running the schema validator, which means the cached envelope flows even when the original request was a validation failure (the user sees the same "fix the highlighted fields" message on retry rather than burning rate-limit budget).

### Negative

- **8 pieces is a lot.** The `/contact` Route Handler is ~200 lines because every gate is explicit. A future framework helper could collapse the boilerplate; today the explicitness is a feature (every gate is visible in the handler body, no magic).
- **Per-Lambda in-memory idempotency store.** A Lambda cold start resets the store; the DynamoDB activation milestone lifts to per-account.
- **Per-Lambda in-memory rate-limit store.** Same trade-off as idempotency.

### Neutral

- **`'honeypot'` is intentionally absent from the failure `reason` union.** The silent-200 path is the contract; surfacing the discriminator would leak bot-detection semantics into an OpenAPI codegen target.
- **The 8-piece order is fixed.** Idempotency-first short-circuits retries cheaply; Zod-parse-before-CSRF ensures the cookie/body comparison sees real values. Reordering breaks subtle invariants.

## Alternatives considered

- **Server Action instead of Route Handler.** Server Actions are the Next.js 16-recommended forms surface, but they cannot set arbitrary request headers — the X-Quilty-CSRF custom header layer would be unreachable. The Route Handler path keeps the canonical OWASP triple-layer intact.
- **7-piece pattern (D113 original).** Dropped idempotency-key. The Stripe convention is the right reference for any user-facing form that can be retried; not adding it now means every consumer eventually needs to add it later.
- **Single all-in-one validator function.** Bundles 8 concerns into one function — caller can't observe which gate failed, and the chokepoint discipline collapses to a single internal `if`-chain. Rejected on Cerebral-lesson grounds.

## Implementation status

Reference implementation lives at:

- `apps/web/app/api/contact/route.ts` (the Route Handler)
- `apps/web/app/[locale]/(marketing)/contact/page.tsx` (Server Component — renders form + disclaimer + mints CSRF cookie)
- `apps/web/app/[locale]/(marketing)/contact/ContactForm.tsx` (Client Component — RHF + Zod via zodResolver)
- `apps/web/app/[locale]/(marketing)/contact/schema.ts` (Zod schema + Result envelope type)
- `apps/web/lib/idempotency.ts` (in-memory store)

The security primitives (`generateCsrfToken`, `verifyCsrf`, `makeHoneypotField`, `verifyHoneypot`, `makeRenderTimestamp`, `verifyTimeTrap`) live in `packages/security/src/domain/`. The captcha verifier lives in `packages/captcha/src/`. The rate-limiter lives in `packages/rate-limit/src/`. The EmailSender chokepoint wrap lives in `packages/email/src/domain/wrap-email-sender.ts`.
