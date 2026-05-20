/**
 * `wrapAnalytics` — the Cerebral-lesson chokepoint composition.
 *
 * Composes three guards in front of every raw Analytics adapter:
 *
 *   1. Default-deny consent gate (D35): `consentReader.read()` is invoked
 *      at every `track()` call. If the snapshot has `analytics !== true`,
 *      or if the reader throws / rejects, the wrapper no-ops silently.
 *      Per-request consent semantics — cookies + GPC header can change
 *      between requests, so we cannot cache the snapshot at construction.
 *   2. Runtime PHI assertion (D67): in development + test, the payload
 *      is checked for PHI-shaped keys before sanitization. Production
 *      relies on the sanitizer; the runtime assertion is the developer-
 *      feedback layer.
 *   3. PHI sanitizer (D67): the payload passes through `sanitizer.scrub()`
 *      recursively before delegation. The 65-key denylist + JWT pattern
 *      + UUID hash applies.
 *
 * The composition root MUST consume the wrapper, never the raw adapter.
 * ESLint + dep-cruiser enforce the import-graph chokepoint; the contract
 * test enforces the runtime composition order.
 */

import type { Sanitizer } from '@quilty/security';
import type { Analytics, AnalyticsCallContext, AnalyticsEvent, ConsentReader } from '../ports.js';

export interface WrappedAnalyticsOptions {
  readonly adapter: Analytics;
  readonly consentReader: ConsentReader;
  readonly sanitizer: Sanitizer;
}

export function wrapAnalytics(options: WrappedAnalyticsOptions): Analytics {
  const { adapter, consentReader, sanitizer } = options;

  return {
    track: async <E extends AnalyticsEvent>(
      event: E,
      ctx?: AnalyticsCallContext,
    ): Promise<void> => {
      // Step 1 — consent gate. Fail-closed: any throw / rejection is a
      // deny. Cerebral-lesson posture (D35).
      let consent;
      try {
        consent = await consentReader.read();
      } catch {
        return;
      }
      if (!consent.analytics) return;

      // Step 2 — runtime PHI assertion (silent in production).
      sanitizer.assertNoPHI(event.props, `analytics:${event.name}`);

      // Step 3 — sanitize the payload (recursive scrub against the
      // 65-key denylist, plus the camelCase normalization that catches
      // analytics-SDK property conventions).
      const sanitizedProps = sanitizer.scrub(event.props);
      const sanitizedCtx = ctx ? sanitizer.scrub(ctx) : undefined;

      const wrappedEvent = {
        name: event.name,
        props: sanitizedProps,
      } as E;

      await adapter.track(wrappedEvent, sanitizedCtx);
    },
  };
}
