/**
 * AWS SES EmailSender adapter — typed-throwing skeleton at M1.5.
 *
 * The `send()` method intentionally throws until BOTH of these are
 * green:
 *
 *   1. AWS SES production-access sandbox lift for `my-quilty.com` —
 *      cuts the daily-cap + sender-restriction limits.
 *   2. AWS BAA execution covering the SES account — without the BAA,
 *      any email content that could be construed as relating to a
 *      mental-health condition (even a password-reset confirmation
 *      mentioning the user's account in a sensitive context) creates
 *      HIPAA exposure on the deliverer side.
 *
 * See `docs/runbook/dmarc-ramp.md` for the DMARC progressive-ramp
 * sequence (D117) and `docs/runbook/baa-inventory.md` for the BAA
 * status surface (D169).
 *
 * Naming discipline (META-1): "ses" appears only in this file path +
 * adapter-internal identifiers. The port + factory are vendor-agnostic.
 */

import type { EmailEnvelope, EmailSender, EmailSendResult } from '../ports.js';

export interface SesAdapterOptions {
  readonly region: string;
  readonly fromAddress: string;
}

/**
 * Build an SES-shaped EmailSender skeleton. Throws on every call until
 * the production-access + BAA gates are flipped. The adapter file is
 * scaffolded so the composition root + tests can reference the shape
 * without changing imports at activation; the call site stays valid.
 */
export function makeSesEmailSender(options: SesAdapterOptions): EmailSender {
  // Reference options so the parameter is intentionally consumed
  // (typed-throwing skeletons that drop their arguments are a footgun
  // when the activation milestone arrives + the developer assumes the
  // wiring was already exercised).
  const reason = `SES adapter is a skeleton at M1.5; production-access sandbox lift + BAA execution required before activation. Configured region: ${options.region}, fromAddress: ${options.fromAddress}.`;

  return {
    // Promise.reject (not a sync throw) so callers using `.catch()` or
    // `await sender.send().catch()` see the failure through the
    // declared `Promise<EmailSendResult>` contract; a sync throw would
    // escape before the Promise was created.
    send: (_envelope: EmailEnvelope): Promise<EmailSendResult> => Promise.reject(new Error(reason)),
  };
}
