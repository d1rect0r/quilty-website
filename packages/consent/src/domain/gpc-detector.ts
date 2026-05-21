/**
 * Global Privacy Control detector.
 *
 * The GPC spec (https://globalprivacycontrol.org/) defines two opt-out
 * surfaces:
 *   - the `Sec-GPC` request header (`Sec-GPC: 1` means "opt-out")
 *   - a `navigator.globalPrivacyControl === true` browser property
 *
 * This module exposes the header-side detector. The browser-side
 * property is only available to client code that runs after consent has
 * already been honored at the edge; the server-side header detection is
 * the authoritative signal for CCPA §7025(c)(6) compliance (D62).
 *
 * Disney $2.75M (Feb 2026) + Ford $375K (Mar 2026) are the enforcement
 * precedent — failure to honor a detected Sec-GPC: 1 carries direct AG
 * action.
 */

/**
 * Minimal interface for the request-header read surface so the function
 * accepts both Next.js `headers()` Promise resolution + a plain `Headers`
 * instance from a Route Handler / Edge function. Tested against both
 * shapes — the `unknown`-typed `get()` return is narrowed inline.
 */
export interface HeaderGetter {
  readonly get: (name: string) => string | null;
}

/**
 * Returns `true` if the request carries `Sec-GPC: 1`. The spec only
 * defines the value `1` as the opt-out signal; any other value (including
 * `0`, absent, or unparseable) means "no opt-out asserted." A `0` value
 * does NOT mean "opt-in" — opt-in is the absence of any signal.
 */
export function detectGpcFromHeaders(headers: HeaderGetter): boolean {
  const raw = headers.get('sec-gpc');
  return raw === '1';
}
