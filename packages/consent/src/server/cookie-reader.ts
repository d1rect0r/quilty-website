/**
 * Server-side consent cookie reader.
 *
 * Stub until the consent banner activation ships the cookie write
 * path. Returns the default-deny baseline merged with the GPC
 * detection signal. Once the banner writes `__Host-quilty_consent`,
 * this reader will parse the cookie value (Base64 JSON-encoded
 * `ConsentCategoryState`) and merge it with the `Sec-GPC: 1` signal.
 *
 * Server-only by intent. The path lives under `src/server/` so the
 * package subpath export (`@quilty/consent/server`) can gate it behind
 * the server-only condition map at the next consumer milestone.
 */

import 'server-only';

import { DEFAULT_DENY_STATE } from '../domain/cookie-taxonomy.js';
import { detectGpcFromHeaders, type HeaderGetter } from '../domain/gpc-detector.js';
import type { ConsentReader, ConsentSnapshot } from '@quilty/observability';

export interface ServerConsentReaderInput {
  /**
   * Async accessor for the request's `Headers` object. In Next.js 16
   * App Router this is `() => headers()`; in a Route Handler it can be
   * `() => Promise.resolve(request.headers)`.
   */
  readonly headers: () => Promise<HeaderGetter>;
  /**
   * Async accessor for the request's cookie reader. In Next.js 16 this
   * is `() => cookies()`; consumers can pass a custom impl in tests.
   * Returns `null` for the consent cookie until the banner activation
   * writes it; the type-shape is reserved for the real reader.
   */
  readonly readConsentCookie: () => Promise<string | null>;
}

/**
 * Build a server-side `ConsentReader` from per-request accessors. The
 * returned reader satisfies the @quilty/observability `ConsentReader`
 * port. The cookie path is a stub until the consent banner activation
 * ships the cookie write — the reader returns the default-deny
 * baseline merged with the GPC-detection signal.
 *
 * When the banner activation ships the cookie parse, the
 * `cookieGranted` block below switches to `parseConsentCookie(raw)`
 * and the GPC override below (`gpc ? deny() : granted`) becomes
 * load-bearing per CCPA §7025(c)(2) — GPC asserts opt-out across
 * sale/sharing categories regardless of stored consent.
 */
export function makeServerConsentReader(input: ServerConsentReaderInput): ConsentReader {
  return {
    read: async (): Promise<ConsentSnapshot> => {
      const h = await input.headers();
      const gpc = detectGpcFromHeaders(h);
      const cookieRaw = await input.readConsentCookie();
      // Stub branch: cookie is always null until the banner activation
      // wires the write path. The accessor is intentionally consumed
      // here so callers passing real Next.js `cookies()` accessors
      // today see the read happen — preserves the future-proof shape.
      const cookieGranted = cookieRaw !== null;
      return {
        // GPC opt-out is authoritative across analytics + marketing
        // (CCPA §7025(c)(2)). Preferences are out of scope for GPC; the
        // spec only covers "sale or sharing of personal information."
        analytics: cookieGranted && !gpc ? DEFAULT_DENY_STATE.analytics : false,
        marketing: cookieGranted && !gpc ? DEFAULT_DENY_STATE.marketing : false,
        preferences: cookieGranted ? DEFAULT_DENY_STATE.preferences : false,
        gpc_detected: gpc,
      };
    },
  };
}
