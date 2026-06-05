/**
 * Amplitude Analytics — no-network log adapter (D42b: Amplitude all-in for
 * web + mobile under one vendor).
 *
 * This is the tier-neutral, no-network variant: it logs the event name via
 * the Logger port instead of emitting to Amplitude. It is wired on the EDGE
 * composition root (the `@amplitude/analytics-node` SDK is not Edge-runtime
 * safe) and used as the default test fixture. The real network adapters live
 * alongside this file:
 *   - `amplitude-browser.ts` — Browser SDK 2 (client composition root).
 *   - `amplitude-node.ts`    — Node SDK (server composition root).
 *
 * Amplitude Session Replay is REJECTED outright per D68 (HTML-attribute
 * leak structurally unsafe on a clinical surface even with Enterprise
 * BAA). Sentry Replay is the only replay vendor; no adapter here touches
 * the Amplitude Replay API.
 */

import type { Analytics, AnalyticsCallContext, AnalyticsEvent, Logger } from '../ports';

export interface AmplitudeAnalyticsOptions {
  readonly logger: Logger;
  // Vendor activation knobs (wired when the BAA upgrade activates):
  // readonly apiKey?: string;
  // readonly serverUrl?: string;
  // readonly trackingOptions?: { ... };
}

export function makeAmplitudeAnalytics(options: AmplitudeAnalyticsOptions): Analytics {
  const { logger } = options;
  return {
    track: async <E extends AnalyticsEvent>(
      event: E,
      _ctx?: AnalyticsCallContext,
    ): Promise<void> => {
      // Pre-BAA stub: emit at `debug` level (production-suppressed)
      // with event_name only — never props or ctx. CloudWatch costs
      // + identifying-field retention are both reasons; activation
      // moves the per-event payload to the vendor's protected channel.
      logger.debug('analytics:event', { event_name: event.name });
    },
  };
}
