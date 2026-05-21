# @quilty/captcha

CAPTCHA verifier — `CaptchaVerifier` port + in-memory adapter (production wiring today, default-pass) + Cloudflare Turnstile skeleton (typed-throwing until BAA + secret provisioning).

## Architecture

Single hexagonal port: `CaptchaVerifier.verify(token, context) → Promise<VerificationResult>`. The verifier is invoked from the BFF (Route Handler / Server Action) before any state-changing operation that takes user input — signup, password reset request, contact form, account deletion confirmation.

The port is vendor-agnostic; "turnstile" appears only at `src/adapters/turnstile.ts`. The composition root swaps the in-memory adapter for the Turnstile adapter at the BAA + secret-provisioning activation milestone (see `docs/runbook/baa-inventory.md`).

## Per-action token binding

`VerificationContext.action` carries the call-site label ('signup', 'password_reset', 'contact_form', etc.). Both Turnstile and hCaptcha support per-action token validation, which prevents token replay across endpoints: a token issued for the signup widget cannot satisfy a contact-form verification. The in-memory verifier echoes the action label on pass results so consumer code can validate the round-trip during development.

## Public API

```ts
import {
  // Port + types
  type CaptchaVerifier,
  type VerificationContext,
  type VerificationResult,
  // Adapters
  makeInMemoryCaptchaVerifier,
  makeTurnstileCaptchaVerifier,
} from '@quilty/captcha';
```

Deep imports into `src/` are forbidden by the cross-package barrel rule.

## In-memory adapter (Current production wiring)

`makeInMemoryCaptchaVerifier()` defaults to PASS — by design today because no captcha widget is rendered yet. Tests can construct a fail-by-default fake via `{ defaultResult: 'fail' }`. Every verify call is recorded for inspection.

## Turnstile adapter (skeleton)

`makeTurnstileCaptchaVerifier({ secretKey })` constructs without error but `verify()` rejects on every call until two gates are green:

1. Cloudflare BAA covering Turnstile is executed (Turnstile is a distinct product from the Cloudflare CDN; the CDN is NOT-PURSUED per D2, but Turnstile is evaluated separately per the BAA inventory).
2. `TURNSTILE_SECRET_KEY` is provisioned in 1Password + injected via the SST secret pipeline (NOT a literal env var).

Fallback if the BAA negotiation stalls: AWS WAF CAPTCHA (under the existing AWS BAA) or hCaptcha (offers BAA on its Pro plan).

## Tests

Run with `pnpm --filter @quilty/captcha test`. Coverage targets ≥85% / ≥80%.
