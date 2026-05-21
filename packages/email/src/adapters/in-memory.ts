/**
 * In-memory EmailSender — pre-production wiring at M1.5 + the test fake at
 * every milestone after.
 *
 * Records every send for inspection (tests assert on the records;
 * pre-SES dev/staging observes them in CloudWatch via the structured
 * logger). NEVER ships to a real inbox — explicit by design so the
 * SES sandbox-lift gate is meaningful: no email leaves the perimeter
 * until the BAA + DMARC ramp are both green.
 *
 * Production safety: `send()` throws when `NODE_ENV === 'production'`
 * AND `QUILTY_ALLOW_INMEMORY_EMAIL_IN_PROD` is not set. The intent is
 * that an accidental production deploy (where the SES adapter swap was
 * forgotten) surfaces as a loud failure at the call site, not a silent
 * `ok: true` that leaves the user without a password-reset email.
 * Stage-promotion runbooks deliberately set the override env-var when
 * a pre-production stage runs with `NODE_ENV=production` for parity.
 */

import type { EmailEnvelope, EmailSender, EmailSendResult } from '../ports.js';

const INMEMORY_PROD_OVERRIDE_ENV = 'QUILTY_ALLOW_INMEMORY_EMAIL_IN_PROD';

export interface InMemoryEmailSendRecord {
  readonly envelope: EmailEnvelope;
  readonly providerId: string;
  readonly sentAt: string;
}

export interface InMemoryEmailSender extends EmailSender {
  readonly records: readonly InMemoryEmailSendRecord[];
  readonly reset: () => void;
}

// Module-scope monotonic counter. The counter is intentionally NOT
// instance-scoped so providerIds are globally distinct across every
// `makeInMemoryEmailSender()` instance for the lifetime of the module
// load. The trade-off (a future `reset()` extension cannot reset the
// counter without breaking the cross-instance distinctness guarantee)
// is preserved by NOT including the counter in `reset()`.
let moduleSequence = 0;

/**
 * Construct an in-memory sender. Each instance carries its own record
 * buffer so parallel tests don't cross-contaminate. `reset()` clears
 * the buffer but does NOT reset the module-scope provider-id counter;
 * providerIds remain monotonically distinct across the lifetime of the
 * module load (verified by the cross-instance test).
 */
export function makeInMemoryEmailSender(): InMemoryEmailSender {
  const records: InMemoryEmailSendRecord[] = [];
  return {
    get records(): readonly InMemoryEmailSendRecord[] {
      return records;
    },
    reset: (): void => {
      records.length = 0;
    },
    send: (envelope: EmailEnvelope): Promise<EmailSendResult> => {
      if (
        process.env['NODE_ENV'] === 'production' &&
        process.env[INMEMORY_PROD_OVERRIDE_ENV] !== '1'
      ) {
        return Promise.reject(
          new Error(
            `In-memory EmailSender refuses to run under NODE_ENV=production without ${INMEMORY_PROD_OVERRIDE_ENV}=1; the production composition root must wire the SES adapter instead.`,
          ),
        );
      }
      moduleSequence += 1;
      const providerId = `inmem-${moduleSequence}`;
      records.push({
        envelope,
        providerId,
        sentAt: new Date().toISOString(),
      });
      return Promise.resolve({ ok: true, providerId });
    },
  };
}
