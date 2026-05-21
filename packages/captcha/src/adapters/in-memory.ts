/**
 * In-memory CaptchaVerifier — test fake + pre-Turnstile-activation
 * production wiring.
 *
 * Default behaviour is PASS — by-design today because no captcha
 * widget is rendered yet, so no real token can reach the verifier; a
 * default-fail would make every signup form return CAPTCHA_FAILED
 * even when the token field is the empty string the unrendered widget
 * left behind. The composition root swaps in the Turnstile adapter at
 * activation and the default-pass behaviour becomes irrelevant.
 *
 * Production safety: `verify()` rejects when `NODE_ENV === 'production'`
 * AND `QUILTY_ALLOW_INMEMORY_CAPTCHA_IN_PROD` is not set, mirroring
 * the email adapter's guard. The default-pass fake silently approving
 * every CAPTCHA in production would defeat the spam/abuse defence
 * the verifier exists to provide; the loud rejection surfaces an
 * accidental wiring omission rather than a permissive silent pass.
 * Pre-production stages with `NODE_ENV=production` for parity set the
 * override env-var explicitly.
 *
 * Tests can construct a fail-by-default fake via the options block.
 * Records every verify call for inspection.
 */

import type { CaptchaVerifier, VerificationContext, VerificationResult } from '../ports';

const INMEMORY_PROD_OVERRIDE_ENV = 'QUILTY_ALLOW_INMEMORY_CAPTCHA_IN_PROD';

export interface InMemoryVerificationRecord {
  readonly token: string;
  readonly context: VerificationContext;
  readonly result: VerificationResult;
  readonly verifiedAt: string;
}

export interface InMemoryCaptchaVerifier extends CaptchaVerifier {
  readonly records: readonly InMemoryVerificationRecord[];
  readonly reset: () => void;
}

export interface InMemoryCaptchaVerifierOptions {
  /** Default verification result. `'pass'` is the current production wiring. */
  readonly defaultResult?: 'pass' | 'fail';
  /** Hostname returned on pass results. Defaults to `'localhost'`. */
  readonly hostname?: string;
}

export function makeInMemoryCaptchaVerifier(
  options: InMemoryCaptchaVerifierOptions = {},
): InMemoryCaptchaVerifier {
  const defaultResult = options.defaultResult ?? 'pass';
  const hostname = options.hostname ?? 'localhost';
  const records: InMemoryVerificationRecord[] = [];

  return {
    get records(): readonly InMemoryVerificationRecord[] {
      return records;
    },
    reset: (): void => {
      records.length = 0;
    },
    verify: (token: string, context: VerificationContext): Promise<VerificationResult> => {
      if (
        process.env['NODE_ENV'] === 'production' &&
        process.env[INMEMORY_PROD_OVERRIDE_ENV] !== '1'
      ) {
        return Promise.reject(
          new Error(
            `In-memory CaptchaVerifier refuses to run under NODE_ENV=production without ${INMEMORY_PROD_OVERRIDE_ENV}=1; the production composition root must wire the Turnstile adapter instead.`,
          ),
        );
      }
      const result: VerificationResult =
        defaultResult === 'pass'
          ? { ok: true, action: context.action, hostname }
          : { ok: false, reason: 'in_memory_default_fail' };
      records.push({
        token,
        context,
        result,
        verifiedAt: new Date().toISOString(),
      });
      return Promise.resolve(result);
    },
  };
}
