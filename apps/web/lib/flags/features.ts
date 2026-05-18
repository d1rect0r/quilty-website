/**
 * Typed env-var feature flag module (D43 day-one). The `flag()` adapter
 * in `lib/observability/flag.ts` reads from this map at M1; when the
 * runtime-toggle trigger fires (M3+), the adapter pivots to PostHog flags
 * (D43 revision) without changing this file's shape.
 *
 * LaunchDarkly Oct 2025 outage lesson absorbed: every flag has a
 * safe-by-default value. The default-OFF stance is the Cerebral-lesson-
 * adjacent posture — no flag is allowed to leak a feature without explicit
 * env-var opt-in.
 *
 * Adding a flag: extend `FeatureFlags`, set a default-safe value below,
 * and document the trigger condition (when it flips on). Callers see
 * compile-time errors for any flag not declared here.
 */

export interface FeatureFlags {
  /** Visual reveal for M3 identity-discovery candidate hero variants. */
  new_homepage_hero: boolean;
  /** Stripe test-mode subscription flow (M7-pre, behind eng guard). */
  experimental_subscription: boolean;
  /** Live PostHog client SDK (activated after ConsentState ships at M3). */
  posthog_client_enabled: boolean;
  /** Sentry Replay sample rate boost for staging/preview. */
  sentry_replay_boost: boolean;
}

const DEFAULTS: FeatureFlags = {
  new_homepage_hero: false,
  experimental_subscription: false,
  posthog_client_enabled: false,
  sentry_replay_boost: false,
};

function readEnvFlag(name: keyof FeatureFlags): boolean {
  const envKey = `FEATURE_FLAG_${name.toUpperCase()}`;
  const value = process.env[envKey];
  if (value === undefined || value === '') return DEFAULTS[name];
  // Only the literal string 'true' enables. Defense-in-depth against
  // typos like 'TRUE' or '1' enabling unintentionally.
  return value === 'true';
}

export function getFeatureFlags(): FeatureFlags {
  return {
    new_homepage_hero: readEnvFlag('new_homepage_hero'),
    experimental_subscription: readEnvFlag('experimental_subscription'),
    posthog_client_enabled: readEnvFlag('posthog_client_enabled'),
    sentry_replay_boost: readEnvFlag('sentry_replay_boost'),
  };
}
