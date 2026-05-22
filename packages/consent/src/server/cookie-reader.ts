/**
 * Server-side consent cookie reader.
 *
 * Reads the `__Host-quilty_consent` cookie (when present) + the
 * `Sec-GPC: 1` header signal + folds the two into a single
 * `ConsentSnapshot`. Cookie absent → returns default-deny merged with
 * GPC detection. Cookie present + GPC detected → GPC FORCE-OFF wins
 * (D100 + CCPA §7025(c)(2)). Cookie present + no GPC → cookie state
 * wins.
 *
 * Server-only by intent. The path lives under `src/server/` so the
 * package subpath export (`@quilty/consent/server`) can gate it behind
 * the server-only condition map at the next consumer milestone.
 */

import 'server-only';

import {
  DEFAULT_DENY_STATE,
  TAXONOMY_VERSION,
  migrateFromV0,
  type V0ConsentCategoryState,
} from '../domain/cookie-taxonomy';
import { detectGpcFromHeaders, type HeaderGetter } from '../domain/gpc-detector';
import type { ConsentReader, ConsentSnapshot } from '../ports';

// Strict RFC 3339 with UTC `Z` suffix — defends against `new Date()`
// silently accepting locale strings or unzoned ISO forms.
const ISO_8601_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function isValidIso8601Utc(value: unknown): value is string {
  return typeof value === 'string' && ISO_8601_UTC_PATTERN.test(value);
}

function isV0CookieShape(value: unknown): value is V0ConsentCategoryState {
  // v0 had `necessary` + `preferences`; v1 has `essential` + `functional`.
  // Presence of `necessary` is the canonical version-detector.
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record['necessary'] === true &&
    typeof record['analytics'] === 'boolean' &&
    typeof record['marketing'] === 'boolean' &&
    typeof record['preferences'] === 'boolean'
  );
}

export interface ServerConsentReaderInput {
  /**
   * Async accessor for the request's `Headers` object. In Next.js 16
   * App Router this is `() => headers()`; in a Route Handler it can be
   * `() => Promise.resolve(request.headers)`.
   */
  readonly headers: () => Promise<HeaderGetter>;
  /**
   * Async accessor for the request's `__Host-quilty_consent` cookie
   * value. In Next.js 16 this reads through `cookies()`; consumers can
   * pass a custom impl in tests. Returns `null` when the cookie is
   * absent (the user has not made a choice yet).
   */
  readonly readConsentCookie: () => Promise<string | null>;
}

/**
 * Parse the `__Host-quilty_consent` cookie value. The cookie carries a
 * base64-encoded JSON payload of the persisted state. Malformed or
 * unparseable values return `null` so the read path falls through to
 * default-deny (fail-closed per D35).
 */
function parseConsentCookie(raw: string | null): Partial<ConsentSnapshot> | null {
  if (raw === null) return null;
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    const parsed: unknown = JSON.parse(decoded);
    if (typeof parsed !== 'object' || parsed === null) return null;
    // v0 → v1 grandfathering per D98. A v0-shaped cookie is migrated
    // on read so the rest of the reader can assume v1 fields. The
    // grandfathering rule for NEW categories (`personalization`) is
    // satisfied at the SiteBanner level: a v0 cookie has no `version`
    // field, so the v0 detection branch promotes the state to v1
    // without setting `version: 'v1'` on the persisted cookie — the
    // next user interaction (re-consent banner) re-writes the cookie
    // with the v1 stamp.
    if (isV0CookieShape(parsed)) {
      const promoted = migrateFromV0(parsed);
      return {
        essential: true,
        functional: promoted.functional,
        analytics: promoted.analytics,
        marketing: promoted.marketing,
        personalization: promoted.personalization,
      };
    }
    return parsed as Partial<ConsentSnapshot>;
  } catch {
    return null;
  }
}

/**
 * Build a server-side `ConsentReader` from per-request accessors. The
 * returned reader satisfies the @quilty/observability `ConsentReader`
 * port.
 *
 * GPC override semantics (D100, CCPA §7025(c)(2)): the GPC signal on
 * the request — OR the `gpc_honored` flag persisted in the cookie —
 * forces analytics + marketing + personalization to `false` regardless
 * of explicit-grant cookie state. This is the FORCE-OFF semantics, not
 * just an indicator flip; Disney $2.75M Feb 2026 + Ford $375K Mar 2026
 * precedent.
 */
export function makeServerConsentReader(input: ServerConsentReaderInput): ConsentReader {
  return {
    read: async (): Promise<ConsentSnapshot> => {
      const h = await input.headers();
      const gpcDetected = detectGpcFromHeaders(h);
      const cookieRaw = await input.readConsentCookie();
      const parsed = parseConsentCookie(cookieRaw);
      const cookieGpcHonored = parsed?.gpc_honored === true;
      const gpcOverride = gpcDetected || cookieGpcHonored;

      // Pre-banner-activation cookie path: when no cookie is present
      // the snapshot is default-deny merged with GPC detection.
      if (parsed === null) {
        return {
          ...DEFAULT_DENY_STATE,
          gpc_detected: gpcDetected,
          gpc_honored: gpcDetected,
          version: TAXONOMY_VERSION,
          updated_at: null,
        };
      }

      // Cookie present: merge with the GPC override. The persisted
      // `functional` and `essential` flags survive GPC (those categories
      // do not involve "sale or sharing of personal information" under
      // CCPA §7025(c)(2) — only analytics/marketing/personalization
      // are forced off).
      return {
        essential: true,
        functional: parsed.functional === true,
        analytics: gpcOverride ? false : parsed.analytics === true,
        marketing: gpcOverride ? false : parsed.marketing === true,
        personalization: gpcOverride ? false : parsed.personalization === true,
        gpc_detected: gpcDetected,
        gpc_honored: gpcOverride,
        version: TAXONOMY_VERSION,
        // Strict ISO 8601 UTC validation (defends against crafted
        // strings that would defeat the future 180-day re-consent
        // threshold by producing NaN or far-future dates when parsed).
        updated_at: isValidIso8601Utc(parsed.updated_at) ? parsed.updated_at : null,
      };
    },
  };
}
