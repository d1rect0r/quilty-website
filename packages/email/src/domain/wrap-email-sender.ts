/**
 * Email-sender wrapper — factory that composes the PHI sanitizer
 * chokepoint around any EmailSender adapter.
 *
 * The wrapper enforces the D31 invariant: `templateData` field values
 * are sanitized before reaching the adapter. The closed-set `EmailKind`
 * union prevents free-text-shaped fields by construction, but the
 * sanitizer is a defence-in-depth chokepoint — the same architectural
 * seal as @quilty/observability's wrap* factories.
 *
 * Per ADR-0010 + D67: composition root MUST consume this wrapper, not
 * the raw adapter. The dep-cruiser rule
 * `no-direct-vendor-sdk-outside-adapter-chokepoint` enforces the
 * adapter boundary; this wrapper enforces the chokepoint composition.
 */

import type { Sanitizer } from '@quilty/security';
import type { EmailEnvelope, EmailSender, EmailSendResult } from '../ports.js';

export interface WrappedEmailSenderOptions {
  readonly adapter: EmailSender;
  readonly sanitizer: Sanitizer;
}

/**
 * Wrap an `EmailSender` adapter so every send call passes its
 * `templateData` through the PHI sanitizer first. The `to` address is
 * NOT sanitized (an email address is an identifier, not free text —
 * sanitizing it would break delivery); the chokepoint discipline
 * focuses on body/subject content carriers.
 */
export function wrapEmailSender(options: WrappedEmailSenderOptions): EmailSender {
  return {
    send: async (envelope: EmailEnvelope): Promise<EmailSendResult> => {
      const sanitizedData = options.sanitizer.scrub(envelope.templateData);
      return options.adapter.send({
        kind: envelope.kind,
        to: envelope.to,
        templateData: sanitizedData,
      });
    },
  };
}
