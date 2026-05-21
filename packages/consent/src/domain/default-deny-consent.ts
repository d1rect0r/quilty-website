/**
 * Default-deny `ConsentReader` — the Cerebral-lesson safe baseline (D35).
 *
 * Returns `analytics: false`, `marketing: false`, `preferences: false`,
 * `gpc_detected: false` for every call so the analytics + marketing
 * wrappers no-op silently — no events fire pre-banner, no vendor SDK
 * initializes pre-consent. This is the production wiring until the
 * consent banner activation ships a real `ConsentStore` that reads
 * the `__Host-quilty_consent` cookie.
 *
 * The returned object structurally satisfies @quilty/observability's
 * `ConsentReader` port; the composition root swaps this stub for the
 * real store at the banner activation without changing the analytics
 * wrapper API.
 */

import type { ConsentReader, ConsentSnapshot } from '../ports.js';

const DENIAL: ConsentSnapshot = {
  analytics: false,
  marketing: false,
  preferences: false,
  gpc_detected: false,
};

export function makeDefaultDenyConsentReader(): ConsentReader {
  return {
    read: () => DENIAL,
  };
}
