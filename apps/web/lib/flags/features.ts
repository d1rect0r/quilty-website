/**
 * Typed feature-flag catalog (D43).
 *
 * The app-specific flag map + their safe-by-default values. The env-var
 * evaluation mechanism lives in `@quilty/observability` as the
 * `FeatureFlagEvaluator` port; this file is the typed catalog
 * consumers narrow against at the call site:
 *
 *   const container = getServerContainer(makeServerContainer);
 *   const enabled = getTypedFlag(container.featureFlags, 'new_homepage_hero');
 *
 * LaunchDarkly Oct 2025 outage lesson absorbed: every flag has a
 * safe-by-default value below. The default-OFF stance is the
 * Cerebral-lesson-adjacent posture — no flag is allowed to leak a
 * feature without explicit env-var opt-in.
 *
 * Adding a flag: extend `FeatureFlags`, set a default-safe value in
 * `FEATURE_FLAG_DEFAULTS`, and document the trigger condition. Callers
 * see compile-time errors for any flag not declared here.
 */

import type { FeatureFlagEvaluator } from '@quilty/observability';

export interface FeatureFlags {
  /** Visual reveal for identity-discovery candidate hero variants. */
  new_homepage_hero: boolean;
  /** Stripe test-mode subscription flow (Stripe-integration milestone, behind eng guard). */
  experimental_subscription: boolean;
  /** Live analytics client SDK (activated after ConsentState ships at the consent extraction). */
  analytics_client_enabled: boolean;
  /**
   * Sentry Replay sample rate boost for staging/preview environments.
   *
   * IMPORTANT: this flag boosts `replaysOnErrorSampleRate` only — never
   * `replaysSessionSampleRate`. D68 mandates `sessionSampleRate: 0` in
   * all environments; the wrapper at `@quilty/observability/wrapReplay`
   * rejects any non-zero session-sample-rate at runtime, but the flag's
   * scope is explicitly the error-triggered rate to prevent a future
   * mis-wiring from defeating the HIPAA-aligned floor.
   */
  sentry_replay_boost: boolean;
}

export const FEATURE_FLAG_DEFAULTS: FeatureFlags = {
  new_homepage_hero: false,
  experimental_subscription: false,
  analytics_client_enabled: false,
  sentry_replay_boost: false,
};

/**
 * Typed wrapper over the FeatureFlagEvaluator port. The evaluator's
 * generic flag method accepts any string name; this helper narrows it
 * to the declared `FeatureFlags` keys + returns the correct value type.
 */
export function getTypedFlag<K extends keyof FeatureFlags>(
  evaluator: FeatureFlagEvaluator,
  name: K,
): FeatureFlags[K] {
  return evaluator.flag(name, FEATURE_FLAG_DEFAULTS[name]);
}
