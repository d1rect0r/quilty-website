/**
 * Sentry Replay adapter (D42a / D85).
 *
 * Per D68: the Replay integration is lazy-loaded via
 * `Sentry.lazyLoadIntegration('replayIntegration')` so the DOM
 * serializer chunk (~36 KB gzipped) is fetched only when an error
 * fires — `replaysSessionSampleRate` is 0 (no always-on replay) and
 * `replaysOnErrorSampleRate` is 1.0 (full replay on every error).
 *
 * If the lazy load fails (offline / CSP block / network error), the
 * adapter resolves silently. Losing replay on errors is acceptable;
 * losing the app to a Replay-init throw is not.
 */

import * as Sentry from '@sentry/nextjs';
import type { Replay, ReplayConfig } from '../ports.js';

export function makeSentryReplay(): Replay {
  return {
    initialize: async (config?: Partial<ReplayConfig>): Promise<void> => {
      // Server + edge runtimes do not support browser Replay; the
      // adapter resolves to a no-op there.
      if (typeof window === 'undefined') return;

      try {
        const replayIntegration = await Sentry.lazyLoadIntegration('replayIntegration');
        Sentry.addIntegration(
          replayIntegration({
            maskAllText: config?.maskAllText ?? true,
            blockAllMedia: config?.blockAllMedia ?? true,
            maskAllInputs: config?.maskAllInputs ?? true,
          }),
        );
      } catch {
        // Replay unavailable — Sentry continues to capture errors without it.
      }
    },
  };
}
