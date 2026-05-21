/**
 * Cloudflare Turnstile CaptchaVerifier adapter — typed-throwing
 * skeleton today.
 *
 * The `verify()` method rejects until both gates are green:
 *
 *   1. Cloudflare BAA covering Turnstile is executed (see
 *      `docs/runbook/baa-inventory.md`). Turnstile inspects request
 *      metadata (IP, headers, basic device signals); the BAA scope
 *      must cover that processing channel.
 *   2. `TURNSTILE_SECRET_KEY` is provisioned in 1Password + injected
 *      into the runtime via the SST secret pipeline (NOT a literal
 *      env var in source).
 *
 * If the BAA negotiation stalls, the AWS WAF CAPTCHA fallback (under
 * the existing AWS BAA) is the documented alternative.
 *
 * Naming discipline (META-1): "turnstile" appears only in this file
 * path + adapter-internal identifiers. The port + factory are
 * vendor-agnostic.
 */

import type { CaptchaVerifier, VerificationContext, VerificationResult } from '../ports';

export interface TurnstileAdapterOptions {
  /**
   * Cloudflare Turnstile secret key. The skeleton does not actually
   * use this value today (every call rejects), but the parameter is
   * declared so the composition-root wiring + tests typecheck against
   * the same shape that will be active at the BAA-execute milestone.
   */
  readonly secretKey: string;
}

const VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Build a Turnstile-shaped CaptchaVerifier skeleton. Rejects on every
 * verify() call until activation. The endpoint constant + the secret-
 * key option are scaffolded so the activation milestone is a single
 * implementation swap (replace the reject with a `fetch(VERIFY_ENDPOINT)`
 * call + result parsing) rather than a re-wire of the consumer.
 *
 * Closure-capture discipline: the `options` argument is consumed
 * immediately to derive a `hasKey` boolean + a frozen `skeletonNote`
 * string; the closure DOES NOT close over the raw `options` object or
 * its `secretKey` field. This prevents the production-tier secret
 * from being retained in the Lambda-warm process memory (where a
 * crash-dump or heap-snapshot capture could exfiltrate it) once the
 * activation milestone swaps the reject for a real `fetch()` call.
 */
export function makeTurnstileCaptchaVerifier(options: TurnstileAdapterOptions): CaptchaVerifier {
  const hasKey = options.secretKey.length > 0;
  const skeletonNote = `Turnstile adapter is a skeleton today (verify endpoint ${VERIFY_ENDPOINT}, secret key ${hasKey ? '[REDACTED]' : '[MISSING]'}); Cloudflare BAA + secret provisioning required before activation.`;
  // options reference ends here. The closure below does NOT capture
  // the raw key. At activation, the implementation will accept the
  // key as a closure-local `const` re-derived from `options` and
  // referenced only inside the verify call frame, never as a
  // long-lived object property.

  return {
    verify: (_token: string, _context: VerificationContext): Promise<VerificationResult> =>
      Promise.reject(new Error(skeletonNote)),
  };
}
