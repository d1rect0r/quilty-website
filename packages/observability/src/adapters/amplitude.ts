/**
 * Amplitude Analytics adapter (D42b revised — Amplitude all-in for web +
 * mobile under one vendor).
 *
 * Pre-BAA posture: the adapter logs to CloudWatch via the Logger port
 * instead of emitting to Amplitude's network. This lets the team observe
 * what WOULD be tracked without sending to a vendor before the Amplitude
 * BAA upgrade activates. The function signature stays — when the SDK
 * init flips on, only the body changes, not the consumer call sites.
 *
 * Amplitude Session Replay is REJECTED outright per D68 (HTML-attribute
 * leak structurally unsafe on a clinical surface even with Enterprise
 * BAA). Sentry Replay is the only replay vendor; this adapter never
 * touches the Amplitude Replay API.
 */

import type { Analytics, AnalyticsCallContext, AnalyticsEvent, Logger } from '../ports.js';

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
