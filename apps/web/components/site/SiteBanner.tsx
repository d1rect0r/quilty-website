import { cookies, headers } from 'next/headers';
import {
  Banner,
  CONSENT_COOKIE_NAME,
  COOKIE_REGISTRY,
  TAXONOMY_VERSION,
  type ConsentCategoryState,
} from '@quilty/consent';
// `detectGpcFromHeaders` is server-only — it reads a request header
// + is meaningless in the browser. Routed through the /server subpath
// per the perf-bundle close-pass discipline so a future Client-
// Component import would fail at build time rather than ship the
// function to the client bundle.
import { detectGpcFromHeaders } from '@quilty/consent/server';

/**
 * Server-side wrapper around the `@quilty/consent` Banner.
 *
 * Owns three pieces of policy that don't belong in the package:
 *
 *   1. The suppression decision — banner only renders when the user
 *      has not yet made a choice AND no `Sec-GPC: 1` signal is
 *      present (D62 visible indicator replaces the banner; the
 *      Footer's `<GpcHonoredIndicator />` handles that surface).
 *   2. The Server Action that writes the `__Host-quilty_consent`
 *      cookie. The action calls Next.js `cookies().set()` — coupling
 *      the consent package to `next/headers` was avoided by passing
 *      the action in as a prop instead.
 *   3. The cookie encoding (base64 JSON of the persisted snapshot).
 *      Matches the parse path in `@quilty/consent/server` cookie-reader.
 */

// Cookie lifetime sourced from the taxonomy registry — single source
// of truth (mismatch is a Disney $2.75M / Ford $375K enforcement
// risk). Cookie NAME is the shared `CONSENT_COOKIE_NAME` constant.
const CONSENT_COOKIE_ENTRY = COOKIE_REGISTRY.find((c) => c.name === CONSENT_COOKIE_NAME);
if (CONSENT_COOKIE_ENTRY === undefined || CONSENT_COOKIE_ENTRY.lifetime === 'session') {
  throw new Error(
    `Consent cookie "${CONSENT_COOKIE_NAME}" missing from @quilty/consent COOKIE_REGISTRY or has session lifetime — registry must declare a numeric day count.`,
  );
}
const COOKIE_LIFETIME_DAYS = CONSENT_COOKIE_ENTRY.lifetime;

/**
 * Runtime validator for the Server Action payload. Next.js Server
 * Actions accept arbitrary serialised values over the wire; the
 * TypeScript signature is erased at runtime, so a direct POST to the
 * action endpoint could carry crafted keys ({ analytics: 'truthy
 * string' }, extra properties, prototype pollution shapes, etc.).
 * This guard locks the payload to exactly five booleans before the
 * action proceeds.
 */
function assertValidConsentState(value: unknown): asserts value is ConsentCategoryState {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid consent state: payload must be an object.');
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    'essential',
    'functional',
    'analytics',
    'marketing',
    'personalization',
  ] as const;
  for (const key of expectedKeys) {
    if (typeof record[key] !== 'boolean') {
      throw new Error(`Invalid consent state: ${key} must be a boolean.`);
    }
  }
  // `essential` is `true` by the type contract — reject any attempt to
  // turn it off (would break site function).
  if (record['essential'] !== true) {
    throw new Error('Invalid consent state: essential must be true.');
  }
  // Reject unexpected extra keys to keep the persisted cookie shape
  // exact + prevent prototype-pollution-style payloads from being
  // serialised into the cookie body.
  for (const key of Object.keys(record)) {
    if (!(expectedKeys as readonly string[]).includes(key)) {
      throw new Error(`Invalid consent state: unexpected key "${key}".`);
    }
  }
}

async function persistConsent(state: unknown): Promise<void> {
  'use server';

  assertValidConsentState(state);

  // GPC override: even though SiteBanner suppresses the Banner when
  // Sec-GPC: 1 is detected on the render request, the Server Action
  // endpoint is publicly addressable + can be invoked from any
  // browser context. Re-read the header inside the action so any
  // request that carries Sec-GPC: 1 writes a GPC-honored cookie with
  // sale/share categories forced off. Disney $2.75M Feb 2026
  // enforcement precedent: persisted record must carry the opt-out so
  // it survives requests where the live header is absent later.
  const h = await headers();
  const gpcDetected = detectGpcFromHeaders(h);

  const sanitized: ConsentCategoryState = gpcDetected
    ? {
        essential: true,
        functional: state.functional,
        analytics: false,
        marketing: false,
        personalization: false,
      }
    : state;

  const payload = {
    ...sanitized,
    gpc_honored: gpcDetected,
    version: TAXONOMY_VERSION,
    updated_at: new Date().toISOString(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
  const cookieStore = await cookies();
  cookieStore.set({
    name: CONSENT_COOKIE_NAME,
    value: encoded,
    // `__Host-` prefix requires Secure + Path=/ + no Domain. httpOnly is
    // intentionally false so the client-side useConsent() hook can read
    // the value when it lands (matches the registry entry in
    // @quilty/consent cookie-taxonomy).
    secure: true,
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_LIFETIME_DAYS * 24 * 60 * 60,
  });
}

export async function SiteBanner(): Promise<React.JSX.Element | null> {
  const cookieStore = await cookies();
  const existingCookie = cookieStore.get(CONSENT_COOKIE_NAME)?.value;
  const h = await headers();
  const gpcDetected = detectGpcFromHeaders(h);

  // User already chose → banner stays hidden.
  if (existingCookie !== undefined) return null;
  // Sec-GPC: 1 — banner is suppressed in favor of the
  // GpcHonoredIndicator that lives in the marketing Footer (D62).
  // The persisted GPC cookie write that survives requests without the
  // live header is deferred to the proxy.ts GPC FORCE-OFF mirror +
  // the ConsentStore.migrate path on sign-in (D87 + D100).
  if (gpcDetected) return null;

  // English-only at scaffold per the locale strategy lock. When
  // additional locales activate (next-intl wiring), these hrefs get
  // derived from the active locale segment + threaded through.
  return (
    <Banner
      persistConsent={persistConsent}
      cookiePolicyHref="/en/legal/cookies"
      privacyChoicesHref="/en/legal/privacy-choices"
    />
  );
}
