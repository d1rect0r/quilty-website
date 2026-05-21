/**
 * Single source of truth for outbound user-contact strings (support
 * mailbox, etc). Pre-launch the support mailbox lives on the interim
 * `.app` domain; at the public-launch cutover the address moves to
 * the locked `.com` public domain (D45) — having one definition point
 * means the cutover is a one-line edit, not a grep-and-update sweep.
 *
 * Consumed by the two error-boundary surfaces (`app/error.tsx`,
 * `app/global-error.tsx`) for the D145 mailto fallback CTA. Other
 * consumers (transactional email From: addresses, legal page contact
 * blocks) MUST also import from here as they ship to keep the
 * single-source-of-truth invariant.
 */
export const SUPPORT_MAILTO = 'support@my-quilty.app';
