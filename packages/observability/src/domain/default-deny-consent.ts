/**
 * Default-deny ConsentReader stub.
 *
 * The Cerebral-lesson safe baseline (D35). Used by the composition root
 * before `@quilty/consent` ships its real `ConsentStore`. Returns
 * `analytics: false`, `marketing: false`, `preferences: false` for every
 * call so the analytics + marketing wrappers no-op silently — no events
 * fire pre-launch, no vendor SDK initializes pre-consent.
 *
 * `@quilty/consent`'s real `ConsentStore` will structurally satisfy
 * `ConsentReader` (same `read()` shape), so the composition root swaps
 * this stub for the real store without changing the wrapper API.
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
