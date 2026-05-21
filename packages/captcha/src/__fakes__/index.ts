/**
 * Testing barrel for @quilty/captcha. Consumed via
 * `@quilty/captcha/testing`. The in-memory verifier is the canonical
 * test fake (also the production wiring today).
 */

export {
  makeInMemoryCaptchaVerifier,
  type InMemoryCaptchaVerifier,
  type InMemoryCaptchaVerifierOptions,
  type InMemoryVerificationRecord,
} from '../adapters/in-memory.js';
