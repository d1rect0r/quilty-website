import 'server-only';

/**
 * Public barrel for @quilty/captcha.
 *
 * Consumers import the `CaptchaVerifier` port + the in-memory adapter
 * (production wiring today) + the Turnstile adapter (typed-throwing
 * skeleton). Deep imports into `src/*` are forbidden by
 * `.dependency-cruiser.cjs` rule `cross-package-imports-must-use-barrel`.
 */

export type { CaptchaVerifier, VerificationContext, VerificationResult } from './ports';

export {
  makeInMemoryCaptchaVerifier,
  type InMemoryCaptchaVerifier,
  type InMemoryCaptchaVerifierOptions,
  type InMemoryVerificationRecord,
} from './adapters/in-memory';

export { makeTurnstileCaptchaVerifier, type TurnstileAdapterOptions } from './adapters/turnstile';
