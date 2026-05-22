/**
 * Default-deny `ConsentReader` — the Cerebral-lesson safe baseline (D35).
 *
 * Returns the 5-category default-deny snapshot for every call so the
 * analytics + marketing wrappers no-op silently — no events fire
 * pre-banner, no vendor SDK initializes pre-consent. This is the
 * production wiring for the client-runtime composition root until the
 * client-side ConsentStore reader ships (signed-in user lookup); the
 * server + edge runtimes use `makeServerConsentReader` (which reads the
 * `__Host-quilty_consent` cookie via Next.js `cookies()`).
 *
 * The returned object structurally satisfies @quilty/observability's
 * `ConsentReader` port; the composition root swaps this stub for the
 * real store at the consent-banner activation without changing the
 * analytics wrapper API.
 */

import { TAXONOMY_VERSION } from './cookie-taxonomy';
import type { ConsentReader, ConsentSnapshot } from '../ports';

const DENIAL: ConsentSnapshot = {
  essential: true,
  functional: false,
  analytics: false,
  marketing: false,
  personalization: false,
  gpc_detected: false,
  gpc_honored: false,
  version: TAXONOMY_VERSION,
  updated_at: null,
};

export function makeDefaultDenyConsentReader(): ConsentReader {
  return {
    read: () => DENIAL,
  };
}
