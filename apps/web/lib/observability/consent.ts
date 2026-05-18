import 'server-only';
import { cookies, headers } from 'next/headers';

/**
 * ConsentState shape per D35 + D63. Server-side single source of truth.
 *
 * Marked `server-only` (Round-5 perf-bundle reviewer cross-check) so
 * Next.js throws at BUILD time if any client component tries to import
 * this module — rather than the confusing runtime error from `next/headers`
 * being called in the browser.
 *
 * Full DynamoDB-backed implementation lands at M3 with the consent banner
 * + GPC handling at CloudFront Function edge. At M1 we ship the *shape*
 * + the read API so adapters (track, replay, flags) can gate themselves
 * on `consent.analytics` and `consent.marketing` from day one.
 *
 * Pre-M3 default: all consent flags false (denial-by-default) — the
 * Cerebral-lesson safe baseline.
 */

export interface ConsentState {
  necessary: true; // Always on — required for functional cookies (sessions, CSRF).
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  // Was the user's GPC `Sec-GPC: 1` signal detected on the request?
  gpc_detected: boolean;
}

const DEFAULT_DENIAL: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
  gpc_detected: false,
};

const CONSENT_COOKIE_NAME = '__Host-quilty_consent';

/**
 * Server-component-only consent reader. Pulls from the `__Host-quilty_consent`
 * cookie (set by the CloudFront Function edge layer at M3, by a client-side
 * consent banner pre-M3) + the `Sec-GPC` header.
 *
 * Returns the denial-by-default shape if no cookie exists or parsing fails.
 */
export async function getConsentState(): Promise<ConsentState> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const gpcDetected = headerStore.get('sec-gpc') === '1';

  const raw = cookieStore.get(CONSENT_COOKIE_NAME)?.value;
  if (!raw) {
    return { ...DEFAULT_DENIAL, gpc_detected: gpcDetected };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    return {
      necessary: true,
      analytics: gpcDetected ? false : parsed.analytics === true,
      marketing: gpcDetected ? false : parsed.marketing === true,
      preferences: parsed.preferences === true,
      gpc_detected: gpcDetected,
    };
  } catch {
    return { ...DEFAULT_DENIAL, gpc_detected: gpcDetected };
  }
}
