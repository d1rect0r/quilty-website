/**
 * Cookie taxonomy + category enumeration.
 *
 * Four categories per the EDPB cookie classification + ePrivacy Directive
 * + CCPA + Colorado Privacy Act framework (D35 + D62):
 *
 *   - `necessary`: strictly necessary for site function (session, CSRF,
 *     auth). NEVER gated on consent — opt-out would break the site.
 *   - `analytics`: usage analytics, error reporting (Amplitude, Sentry
 *     non-error events). Gated on `state.analytics === true`.
 *   - `marketing`: cross-site / advertising / retargeting. Gated on
 *     `state.marketing === true`. Quilty doesn't ship this category yet;
 *     reserved for marketing-pixel activation.
 *   - `preferences`: non-essential UX (theme, locale override, feature
 *     toggles). Gated on `state.preferences === true`.
 *
 * The taxonomy is the cookie-policy contract surface — every cookie set
 * by Quilty (or any vendor SDK loaded by Quilty) must declare a category.
 * The `/legal/cookies` page renders the per-category table from this
 * source of truth.
 */

export type CookieCategory = 'necessary' | 'analytics' | 'marketing' | 'preferences';

/**
 * Per-category default-deny state. The wrapper at the analytics layer
 * reads this to decide whether to fire a vendor SDK call.
 */
export interface ConsentCategoryState {
  readonly necessary: true;
  readonly analytics: boolean;
  readonly marketing: boolean;
  readonly preferences: boolean;
}

/**
 * The default-deny baseline. `necessary: true` is hard-coded because
 * the site cannot function without it — there is no consent prompt for
 * session cookies. The other three categories default to `false`.
 */
export const DEFAULT_DENY_STATE: ConsentCategoryState = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
};

/**
 * Cookie declaration for the `/legal/cookies` page table. Each entry
 * documents one cookie (or one cookie family with a prefix) and its
 * category, lifetime, and purpose so the legal page is keyed off the
 * code, not a hand-maintained markdown table.
 */
export interface CookieDeclaration {
  readonly name: string;
  readonly category: CookieCategory;
  readonly purpose: string;
  /** Max lifetime in days. `'session'` for session-scoped cookies. */
  readonly lifetime: number | 'session';
  /** Sets `httpOnly`, `secure`, `sameSite` per cookie. */
  readonly attributes: {
    readonly httpOnly: boolean;
    readonly secure: boolean;
    readonly sameSite: 'Strict' | 'Lax' | 'None';
  };
}

/**
 * Canonical cookie registry. Add cookies here as they are introduced.
 * The list seeds `/legal/cookies`; mismatches between the registry and
 * actual cookies set in production are an audit gap and a Disney/Ford
 * enforcement risk.
 *
 * `__Host-` prefix per D7 — host-only cookies that cannot leak across
 * subdomains (`auth.my-quilty.com` vs `my-quilty.com`).
 */
export const COOKIE_REGISTRY: readonly CookieDeclaration[] = [
  {
    name: '__Host-quilty_sid',
    category: 'necessary',
    purpose: 'Server-side session identifier (BFF pattern); opaque ID, no PII.',
    lifetime: 'session',
    attributes: { httpOnly: true, secure: true, sameSite: 'Lax' },
  },
  {
    name: '__Host-quilty_csrf',
    category: 'necessary',
    purpose: 'CSRF double-submit token, paired with the X-Quilty-CSRF header.',
    lifetime: 'session',
    attributes: { httpOnly: false, secure: true, sameSite: 'Lax' },
  },
  {
    // `__Host-` prefix per D7: the prefix is mutually exclusive with
    // parent-domain sharing (no `Domain` attribute allowed, Path=/,
    // Secure required). Without the prefix, a MITM on any subdomain
    // (e.g. auth.my-quilty.com) could pre-set `quilty_consent` and
    // spoof user consent state before the banner renders — a positive-
    // consent regulatory failure under CCPA §7025(c)(2) + GDPR Recital
    // 32. The cookie is intentionally not httpOnly (the future
    // useConsent() client hook reads it), but the host-prefix locks
    // out cross-subdomain writes.
    name: '__Host-quilty_consent',
    category: 'necessary',
    // CCPA/CPRA implementing regulations require renewed consent at
    // least annually for sensitive personal information; 180 days is
    // deliberately conservative and must not be extended without a
    // legal review.
    purpose: 'Persists the user consent state across requests.',
    lifetime: 180,
    attributes: { httpOnly: false, secure: true, sameSite: 'Lax' },
  },
  // The mirror cookie for Sec-GPC: 1 cache-key consistency lands at the
  // CloudFront Function edge milestone (D63). Until that write path
  // ships, the cookie is intentionally absent from the registry — the
  // /legal/cookies page must not declare a cookie that is not set
  // (CCPA §1798.100 + GDPR Art. 13 prohibit false cookie disclosures).
];
