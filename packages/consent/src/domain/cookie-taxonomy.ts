/**
 * Cookie taxonomy + category enumeration.
 *
 * Five categories per D98 (EDPB cookie classification + ePrivacy Directive
 * + CCPA + CPRA + WA MHMDA + Colorado Privacy Act framework). The split
 * mirrors Stripe / Headspace / Calm / BetterHelp convergent peer practice:
 *
 *   - `essential`: strictly necessary for site function (session, CSRF,
 *     auth, consent cookie itself). NEVER gated on consent — opt-out
 *     would break the site. Always `true` in every snapshot.
 *   - `functional`: non-essential UX (theme, locale override, in-app
 *     feature toggles, accessibility preferences). User can opt-out
 *     without breaking core function. Gated on `state.functional === true`.
 *   - `analytics`: usage analytics, error reporting (Sentry non-error
 *     events, future product-analytics SDK). Gated on
 *     `state.analytics === true`.
 *   - `marketing`: cross-site / advertising / retargeting / email
 *     marketing. Gated on `state.marketing === true`. Quilty doesn't
 *     ship this category yet; reserved for marketing-pixel activation.
 *   - `personalization`: recommendation engines, behaviour-derived
 *     content ranking, ad personalization beyond simple marketing pixel.
 *     Gated on `state.personalization === true`. Reserved for the
 *     recommendation-engine activation.
 *
 * The taxonomy is the cookie-policy contract surface — every cookie set
 * by Quilty (or any vendor SDK loaded by Quilty) must declare a category.
 * The `/legal/cookies` page renders the per-category table from this
 * source of truth.
 *
 * Versioning + grandfathering (D98):
 *   - `version: 'v1'` is the locked schema field. Migrations across
 *     versions follow the grandfathering rule below.
 *   - v2 with NEW categories → re-consent banner for existing users.
 *   - v2 with REMOVED / RENAMED categories → re-consent banner.
 *   - v2 with same categories + new vendors → no re-consent.
 */

export type CookieCategory =
  | 'essential'
  | 'functional'
  | 'analytics'
  | 'marketing'
  | 'personalization';

/**
 * Locked taxonomy version. Bump when the category set itself changes;
 * vendor additions inside an existing category do NOT bump the version
 * (no re-consent required per D98 grandfathering rule).
 */
export const TAXONOMY_VERSION = 'v1' as const;

/**
 * Canonical name for the persisted consent cookie. Imported by every
 * site that reads or writes it (proxy.ts, composition roots,
 * SiteBanner Server Action) so a future rename surfaces in one place.
 */
export const CONSENT_COOKIE_NAME = '__Host-quilty_consent' as const;

export type TaxonomyVersion = typeof TAXONOMY_VERSION;

/**
 * Per-category state. The wrapper at the analytics layer reads this to
 * decide whether to fire a vendor SDK call. `essential` is `true` by
 * type (the site cannot function without it; there is no consent prompt
 * for session cookies).
 */
export interface ConsentCategoryState {
  readonly essential: true;
  readonly functional: boolean;
  readonly analytics: boolean;
  readonly marketing: boolean;
  readonly personalization: boolean;
}

/**
 * The default-deny baseline. `essential: true` is hard-coded by type.
 * Every other category defaults to `false` — the Cerebral-lesson
 * Cookie-banner baseline (D35).
 */
export const DEFAULT_DENY_STATE: ConsentCategoryState = {
  essential: true,
  functional: false,
  analytics: false,
  marketing: false,
  personalization: false,
};

/**
 * v0 (pre-migration) 4-category shape. Retained for the `migrateFromV0`
 * helper so any persisted v0 cookie can be promoted to v1 cleanly. v0
 * was: `necessary` + `analytics` + `marketing` + `preferences`.
 */
export interface V0ConsentCategoryState {
  readonly necessary: true;
  readonly analytics: boolean;
  readonly marketing: boolean;
  readonly preferences: boolean;
}

/**
 * Grandfathering helper: promote a v0 4-category state to v1 5-category
 * state per D98. The mapping:
 *
 *   - v0 `necessary` → v1 `essential` (rename; value preserved)
 *   - v0 `preferences` → v1 `functional` (semantic match — theme /
 *     locale / feature toggles)
 *   - v0 `analytics` → v1 `analytics` (unchanged)
 *   - v0 `marketing` → v1 `marketing` (unchanged)
 *   - v1 `personalization` is NEW with no v0 counterpart → defaults to
 *     `false`. Per D98 grandfathering rule, the appearance of a NEW
 *     category triggers a re-consent banner for the affected user;
 *     this helper returns the migrated state so the read path stays
 *     well-typed even before the re-consent banner is dismissed.
 *
 * Per D98 grandfathering: no production v0 cookies exist at the time
 * this code ships (the previous `__Host-quilty_consent` cookie was
 * never written in production), so this helper is forward-compat
 * scaffolding — its first real invocation is when v2 of the taxonomy
 * ships.
 */
export function migrateFromV0(state: V0ConsentCategoryState): ConsentCategoryState {
  return {
    essential: state.necessary,
    functional: state.preferences,
    analytics: state.analytics,
    marketing: state.marketing,
    personalization: false,
  };
}

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
    category: 'essential',
    purpose: 'Server-side session identifier (BFF pattern); opaque ID, no PII.',
    lifetime: 'session',
    attributes: { httpOnly: true, secure: true, sameSite: 'Lax' },
  },
  {
    name: '__Host-quilty_csrf',
    category: 'essential',
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
    category: 'essential',
    // CCPA/CPRA implementing regulations require renewed consent at
    // least annually for sensitive personal information; 180 days is
    // deliberately conservative and must not be extended without a
    // legal review.
    purpose: 'Persists the user consent state across requests.',
    lifetime: 180,
    attributes: { httpOnly: false, secure: true, sameSite: 'Lax' },
  },
  {
    // Opaque anonymous guest-session identifier (ADR-0029 F). Keys the
    // server-side @quilty/guest-state store of NON-health UI/nav state;
    // the cookie itself carries no state and no PII. Minted in proxy.ts
    // (Web Crypto, edge-safe). httpOnly — never read client-side — and
    // session-scoped (privacy-lean default for the zero-PHI tier; revisit
    // when the quiz UX lands).
    name: '__Host-quilty_sid_guest',
    category: 'essential',
    purpose: 'Opaque anonymous guest-session id; keys the server-side guest-state store (no PII).',
    lifetime: 'session',
    attributes: { httpOnly: true, secure: true, sameSite: 'Lax' },
  },
];
