/**
 * Amplitude Node SDK analytics adapter (server tier).
 *
 * Consent + GPC are enforced UPSTREAM by `wrapAnalytics` (D35/D67) — this
 * adapter only emits server-side events for an already-consented user. It is
 * used by the Node composition root only; the Node SDK is not Edge-runtime
 * safe, so the Edge tier keeps the no-network log adapter.
 *
 * Serverless delivery: the Node SDK batches and auto-flushes on an interval,
 * which loses events when a Lambda freezes after returning. The adapter
 * therefore `await`s `flush()` after every `track()` to deliver the event
 * before the handler returns (the documented serverless pattern) — this is
 * best-effort: a transient flush failure still drops that single event, it
 * just no longer poisons the cached SDK init. `init()` runs once per process
 * (cold start) and is cached.
 *
 * Dormant by default: unless `enabled` is true AND an `apiKey` is present,
 * the adapter logs the event NAME only (never props/ctx, per D67) and makes
 * no network call. Server events also require an identified user — the Node
 * SDK rejects events without a `user_id`/`device_id` — so an event with no
 * `user_id_hash` is logged + skipped rather than emitted.
 */

import type { Analytics, AnalyticsCallContext, AnalyticsEvent, Logger } from '../ports';

export interface AmplitudeNodeAnalyticsOptions {
  readonly logger: Logger;
  /** `AMPLITUDE_SERVER_API_KEY`. Absent => dormant (log-only). */
  readonly apiKey?: string | undefined;
  /** Activation gate. False => dormant (log-only). */
  readonly enabled?: boolean | undefined;
}

export function makeAmplitudeNodeAnalytics(options: AmplitudeNodeAnalyticsOptions): Analytics {
  const { logger, apiKey, enabled } = options;
  const active = Boolean(enabled) && typeof apiKey === 'string' && apiKey.length > 0;

  // Dynamically import + initialise the SDK once per process. The module
  // type is inferred from this loader (no top-level SDK import).
  async function loadSdk(key: string) {
    const mod = await import('@amplitude/analytics-node');
    await mod.init(key).promise;
    return mod;
  }

  // Cached init promise (typed by inference from loadSdk).
  let sdkPromise: ReturnType<typeof loadSdk> | null = null;

  return {
    track: async <E extends AnalyticsEvent>(
      event: E,
      ctx?: AnalyticsCallContext,
    ): Promise<void> => {
      if (!active) {
        logger.debug('analytics:event', { event_name: event.name });
        return;
      }
      if (!ctx?.user_id_hash) {
        // The Node SDK requires an identified user; a server event with no
        // hashed user id cannot be attributed. Surface (non-PHI) + skip.
        logger.debug('analytics:event_skipped_no_user', { event_name: event.name });
        return;
      }
      if (typeof apiKey !== 'string') {
        // Unreachable when `active` is true (active already requires a
        // string key), but the guard removes the cast at the loadSdk call
        // site and keeps the type narrowed.
        return;
      }

      // OUTER: SDK load + init. A failure here resets the cached promise so
      // the next event retries init from scratch rather than awaiting a
      // permanently-rejected promise.
      let mod: Awaited<ReturnType<typeof loadSdk>>;
      try {
        sdkPromise ??= loadSdk(apiKey);
        mod = await sdkPromise;
      } catch {
        sdkPromise = null;
        logger.warn('analytics:init_failed', { event_name: event.name });
        return;
      }

      // INNER: emit + flush. A failure here is per-event (a transient
      // network/flush hiccup) — it must NOT reset the cached init, so the
      // next event reuses the already-initialised SDK. Best-effort: the
      // event that failed to flush is dropped.
      try {
        mod.track(event.name, event.props, { user_id: ctx.user_id_hash });
        // Best-effort delivery before the Lambda freezes.
        await mod.flush().promise;
      } catch {
        logger.warn('analytics:flush_failed', { event_name: event.name });
      }
    },
  };
}
