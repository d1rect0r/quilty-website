import { getFeatureFlags, type FeatureFlags } from '@/lib/flags/features';

/**
 * Feature-flag adapter (D43). At M1 reads from the typed env-var module.
 * At the trigger point (runtime toggle / non-dev flipping / A/B testing),
 * the body of this function flips to PostHog flags evaluation — call
 * sites stay untouched.
 *
 * LaunchDarkly Oct 2025 outage lesson: every flag has a safe-by-default
 * value in `lib/flags/features.ts`. If the vendor is unreachable (M3+),
 * we fall back to the default — never `false` on a kill-switch flag whose
 * default-off is unsafe.
 */
export function flag<K extends keyof FeatureFlags>(name: K): FeatureFlags[K] {
  const flags = getFeatureFlags();
  return flags[name];
}
