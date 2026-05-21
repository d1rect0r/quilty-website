import 'server-only';

/**
 * Public barrel for @quilty/email.
 *
 * Consumers import the EmailSender port + the `wrapEmailSender` factory
 * + the adapters (in-memory production-grade today, SES skeleton).
 * Deep imports into `src/*` are forbidden by `.dependency-cruiser.cjs`
 * rule `cross-package-imports-must-use-barrel`.
 *
 * Composition root MUST consume `wrapEmailSender({ adapter, sanitizer })`
 * — never the raw adapter — so the PHI sanitizer chokepoint stays
 * load-bearing per D67 + ADR-0010.
 */

export type { EmailEnvelope, EmailKind, EmailSender, EmailSendResult } from './ports.js';

export { wrapEmailSender, type WrappedEmailSenderOptions } from './domain/wrap-email-sender.js';

export {
  makeInMemoryEmailSender,
  type InMemoryEmailSender,
  type InMemoryEmailSendRecord,
} from './adapters/in-memory.js';

export { makeSesEmailSender, type SesAdapterOptions } from './adapters/ses.js';
