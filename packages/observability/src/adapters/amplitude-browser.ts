/**
 * Amplitude Browser SDK 2 analytics adapter (client tier).
 *
 * Consent + GPC are enforced UPSTREAM by `wrapAnalytics` (the D35/D67
 * chokepoint): `track()` here is only ever reached after the wrapper's
 * per-destination consent gate passes and after the event has been
 * sanitised + `assertNoPHI`-checked. This adapter therefore never makes a
 * consent decision — it only emits.
 *
 * SDK-2 consent mechanism: Browser SDK 2 has NO `deferInitialization` flag
 * (that was legacy `amplitude-js`). The documented SDK-2 pattern is to NOT
 * call `init()` until consent — so the SDK module is dynamically imported
 * and initialised lazily on the first `track()` (which, per the wrapper, is
 * already post-consent). Nothing loads, no cookie is written, and no beacon
 * fires before the first consented event.
 *
 * Dormant by default: unless `enabled` (the `analytics_client_enabled`
 * flag) is true AND an `apiKey` is present, the adapter logs the event NAME
 * only (never props/ctx, per D67) and makes no network call. This is the
 * pre-activation "observe what would be tracked" posture; flipping the flag
 * + provisioning the key at the consent-banner milestone activates emission
 * with no call-site changes.
 *
 * Session Replay is NOT used (D68): this adapter only imports the analytics
 * SDK and never the `@amplitude/plugin-session-replay-browser` plugin.
 */

import type { Analytics, AnalyticsCallContext, AnalyticsEvent, Logger } from '../ports';

export interface AmplitudeBrowserAnalyticsOptions {
  readonly logger: Logger;
  /** `NEXT_PUBLIC_AMPLITUDE_API_KEY`. Absent => dormant (log-only). */
  readonly apiKey?: string | undefined;
  /** The `analytics_client_enabled` flag. False => dormant (log-only). */
  readonly enabled?: boolean | undefined;
}

export function makeAmplitudeBrowserAnalytics(
  options: AmplitudeBrowserAnalyticsOptions,
): Analytics {
  const { logger, apiKey, enabled } = options;
  const active = Boolean(enabled) && typeof apiKey === 'string' && apiKey.length > 0;

  // Dynamically import + initialise the SDK once, on the first consented
  // track. The module type is inferred from this loader (no top-level
  // `import` of the SDK — nothing loads pre-consent).
  //
  // Consent-revocation teardown (calling the SDK's setOptOut(true)/reset on
  // a consent withdrawal or a mid-session Sec-GPC:1) is wired at the
  // consent-banner activation milestone alongside the live API key — the
  // SDK only ever reaches init() post-consent, so there is nothing to tear
  // down while the adapter ships dormant. identityStorage is left at the
  // SDK default (cookie) deliberately: that cookie is written only
  // post-consent and belongs in the consent-banner cookie inventory.
  async function loadSdk(key: string) {
    const mod = await import('@amplitude/analytics-browser');
    mod.init(key, undefined, {
      // Explicit events only — no implicit DOM/page/session autocapture,
      // which on a clinical surface risks capturing identifying context
      // (D31 zero-PHI). The app emits named events deliberately.
      autocapture: false,
      // No remote-config fetch — avoids a config beacon we don't control.
      fetchRemoteConfig: false,
      // IP minimisation: do not let Amplitude derive geo from IP.
      trackingOptions: { ipAddress: false },
    });
    return mod;
  }

  // Cached init promise (typed by inference from loadSdk). `??=` ensures a
  // single init even under concurrent first-track calls.
  let sdkPromise: ReturnType<typeof loadSdk> | null = null;

  return {
    track: async <E extends AnalyticsEvent>(
      event: E,
      ctx?: AnalyticsCallContext,
    ): Promise<void> => {
      if (!active) {
        // Dormant: observe-what-would-track with event NAME only (no
        // props/ctx — D67) and zero network emission.
        logger.debug('analytics:event', { event_name: event.name });
        return;
      }
      try {
        sdkPromise ??= loadSdk(apiKey as string);
        const mod = await sdkPromise;
        // The wrapper already sanitised the event; forward name + props.
        // user_id_hash (already a non-reversible hash, never raw PII) maps
        // to Amplitude's user_id when the call carries one.
        const eventOptions = ctx?.user_id_hash ? { user_id: ctx.user_id_hash } : undefined;
        mod.track(event.name, event.props, eventOptions);
      } catch {
        // Analytics must never break UX: swallow vendor/network failures
        // and surface a non-PHI signal for the broken-emitter case. Reset
        // the cached promise so a transient init/load failure self-heals on
        // the next event rather than poisoning the adapter for the process.
        sdkPromise = null;
        logger.warn('analytics:emit_failed', { event_name: event.name });
      }
    },
  };
}
