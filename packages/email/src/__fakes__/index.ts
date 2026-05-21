/**
 * Testing barrel for @quilty/email. Consumed via
 * `@quilty/email/testing`. The in-memory adapter is the canonical
 * test fake (also the production wiring today).
 */

export {
  makeInMemoryEmailSender,
  type InMemoryEmailSender,
  type InMemoryEmailSendRecord,
} from '../adapters/in-memory.js';
