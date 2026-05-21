/**
 * Captcha package ports.
 *
 * Single hexagonal port: `CaptchaVerifier.verify(token, context) →
 * Promise<VerificationResult>`. The verifier is called from the BFF
 * (Route Handler or Server Action) before any state-changing
 * operation that takes user input (signup, password reset request,
 * contact form, account deletion confirmation).
 *
 * The port is vendor-agnostic. Adapters live at `src/adapters/<vendor>.ts`
 * — Turnstile today; hCaptcha / AWS WAF CAPTCHA reserved as fallback
 * paths per the BAA inventory.
 *
 * Verification context carries the request IP + the action label. The
 * IP is forwarded to the vendor for fraud signals; the action label is
 * forwarded as the verification's `action` field (Turnstile + hCaptcha
 * both support per-action token validation, which prevents token replay
 * across endpoints).
 */

/**
 * Per-call verification context. `action` is the call-site label
 * ('signup', 'password_reset', 'contact_form', etc.). `remoteIp` is the
 * resolved client IP (BFF responsibility — the proxy.ts handler reads
 * the right header chain depending on whether the request came through
 * CloudFront or directly).
 */
export interface VerificationContext {
  readonly action: string;
  readonly remoteIp: string;
}

/**
 * Discriminated result. On failure the `reason` field is the vendor's
 * error code (Turnstile's `error-codes` array values); call sites
 * branch on the boolean but log the reason for diagnostic visibility.
 */
export type VerificationResult =
  | { readonly ok: true; readonly action: string; readonly hostname: string }
  | { readonly ok: false; readonly reason: string };

/**
 * CaptchaVerifier port — single verify call. Composition root wires
 * the production adapter (in-memory at M1.5 with default-pass behaviour;
 * Turnstile once BAA + secret provisioning are green). Consumer code
 * MUST NOT call vendor SDKs directly per D67.
 */
export interface CaptchaVerifier {
  readonly verify: (token: string, context: VerificationContext) => Promise<VerificationResult>;
}
