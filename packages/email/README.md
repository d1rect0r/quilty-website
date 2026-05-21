# @quilty/email

Transactional email surface — `EmailSender` port + in-memory adapter (production wiring at M1.5) + AWS SES skeleton (typed-throwing until sandbox-lift + BAA-execute).

## Architecture

Single hexagonal port: `EmailSender.send(envelope) → Promise<EmailSendResult>`. The composition root wires the in-memory adapter at M1.5 and swaps in `makeSesEmailSender(...)` only after the runbook gates flip — `docs/runbook/dmarc-ramp.md` (D117) + `docs/runbook/baa-inventory.md` (D169). The port stays vendor-agnostic; "SES" appears only in `src/adapters/ses.ts`.

## D31 invariant — zero PHI

Email subject + body MUST NOT carry mental-health clinical content. The `EmailKind` closed-set union (`email_verification`, `password_reset`, `account_deletion_confirmation`, `subscription_renewal_receipt`, `sign_in_from_new_device_alert`) is the contract — adding a kind requires a HIPAA review at schema-change time, not at call-site time. The `wrapEmailSender({ adapter, sanitizer })` factory composes the PHI sanitizer chokepoint over the adapter; the dep-cruiser rule + ESLint chokepoint enforce that the composition root cannot consume a raw adapter.

## Public API

```ts
import {
  // Port + types
  type EmailSender,
  type EmailEnvelope,
  type EmailKind,
  type EmailSendResult,
  // Factory wrapper (always use this; never the raw adapter)
  wrapEmailSender,
  // Adapters
  makeInMemoryEmailSender,
  makeSesEmailSender,
} from '@quilty/email';
```

Deep imports into `src/` are forbidden by the cross-package barrel rule.

## In-memory adapter (M1.5 production wiring)

`makeInMemoryEmailSender()` records every send to an in-memory buffer. NEVER ships to a real inbox — explicit by design so the SES sandbox-lift gate is meaningful: no email leaves the perimeter until the BAA + DMARC ramp are both green. Pre-SES the in-memory records are inspected via the structured logger in CloudWatch.

## SES adapter (skeleton)

`makeSesEmailSender({ region, fromAddress })` constructs without error but `send()` throws on every call until two gates are green:

1. AWS SES production-access sandbox lift for `my-quilty.com` (cuts the 200-emails/day cap + sender restrictions)
2. AWS BAA execution covering the SES account

See `docs/runbook/dmarc-ramp.md` for the DMARC progressive-ramp sequence and `docs/runbook/baa-inventory.md` for the BAA status surface.

## Tests

Run with `pnpm --filter @quilty/email test`. Coverage targets ≥85% / ≥80%.
