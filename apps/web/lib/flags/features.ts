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
  /**
   * Search UI activation (ADR-0019). Flips when MDX content lands AND
   * `pnpm build:pagefind` produces a populated index. Until then the
   * `/[locale]/search` route renders `<ComingSoonSearch>`; the
   * Cmd-K modal trigger in `Header.tsx` stays hidden. The SearchIndex
   * port is always wired on the ClientContainer (in-memory fake by
   * default); the flag gates the UI surface, not the underlying
   * adapter wiring.
   */
  search_enabled: boolean;
  /**
   * PWA install-prompt UI activation (ADR-0022). When true, the
   * unified `<InstallPrompt>` component listens for the
   * `beforeinstallprompt` event on Chrome/Edge/Android and renders
   * an iOS coach-mark fallback when running standalone-eligible on
   * iOS Safari. Default OFF — the activation trigger is the first
   * install-conversion-intent measurement signal (TW-015).
   *
   * The Service Worker itself registers regardless of this flag
   * (cache strategies are always-on once SSR is past); the flag
   * controls only the install-prompt surface visibility.
   */
  install_prompt_enabled: boolean;
}

export const FEATURE_FLAG_DEFAULTS: FeatureFlags = {
  new_homepage_hero: false,
  experimental_subscription: false,
  analytics_client_enabled: false,
  sentry_replay_boost: false,
  search_enabled: false,
  install_prompt_enabled: false,
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
