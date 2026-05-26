/**
 * `wrapAnalytics` — the Cerebral-lesson chokepoint composition.
 *
 * Composes four guards in front of every raw Analytics adapter:
 *
 *   1. Default-deny consent gate (D35), evaluated PER DESTINATION. Each
 *      destination has its own consent category (analytics vs marketing
 *      vs personalization); a single `marketing: false` does not block
 *      `product-analytics` emission. The reader is invoked once per call
 *      and the snapshot is reused across destination evaluations so the
 *      gate is consistent within a single track() invocation. If the
 *      reader throws / rejects, the wrapper no-ops silently for ALL
 *      destinations (fail-closed posture).
 *   2. Runtime PHI assertion (D67): in development + test, the payload
 *      is checked for PHI-shaped keys before sanitization. Production
 *      relies on the sanitizer; the runtime assertion is the developer-
 *      feedback layer.
 *   3. PHI sanitizer (D67): the payload passes through `sanitizer.scrub()`
 *      recursively before delegation. The 65-key denylist + JWT pattern
 *      + UUID hash applies.
 *   4. Fan-out via `Promise.allSettled` — each destination ships
 *      independently of the others. A network failure at the product-
 *      analytics adapter does NOT starve the lifecycle-marketing
 *      adapter, and vice versa. Per-destination failures are surfaced
 *      via the Logger when present so they're queryable in CloudWatch.
 *
 * The composition root MUST consume the wrapper, never the raw adapter.
 * ESLint + dep-cruiser enforce the import-graph chokepoint; the contract
 * test enforces the runtime composition order.
 */

import type { ConsentReader, ConsentSnapshot } from '@quilty/consent';
import type { Sanitizer } from '@quilty/security';
import type {
  Analytics,
  AnalyticsCallContext,
  AnalyticsDestination,
  AnalyticsEvent,
  Logger,
} from '../ports';

/**
 * Consent categories that gate analytics destinations. `essential` is
 * intentionally excluded — it is always-true on every ConsentSnapshot, so
 * a destination mapped to `essential` would silently bypass the consent
 * gate for all users. Restricting the map's value type at the TYPE level
 * prevents a future maintainer from making that mistake.
 */
export type ConsentCategoryForDestination =
  | 'analytics'
  | 'marketing'
  | 'personalization'
  | 'functional';

/**
 * Default destination → consent category map. Centralized so a new
 * destination is a 3-step change (port union + this map + composition
 * wiring). Warehouse loads gate under `analytics` because they support
 * analytical workloads.
 *
 * Composition root MAY override via `consentCategoryByDestination` on
 * `WrappedAnalyticsOptions` (e.g., re-classify lifecycle-marketing
 * to `personalization` post-counsel review without a code deploy).
 * mParticle + RudderStack + Segment all expose this mapping as runtime
 * configuration for the same reason.
 */
export const DEFAULT_CONSENT_CATEGORY_BY_DESTINATION: Readonly<
  Record<AnalyticsDestination, ConsentCategoryForDestination>
> = {
  'product-analytics': 'analytics',
  'lifecycle-marketing': 'marketing',
  warehouse: 'analytics',
};

const DEFAULT_DESTINATIONS: readonly AnalyticsDestination[] = ['product-analytics'];

export interface WrappedAnalyticsOptions {
  /**
   * Destination → adapter map. The composition root builds this from
   * one or more vendor-bound adapters at startup. Each adapter is the
   * single sink for its destination role; the wrapper picks the adapter
   * by destination key, never iterates over values.
   *
   * An adapter mapped here MUST be the raw vendor-bound `Analytics`
   * factory (`makeAmplitudeAnalytics`, etc.) — NOT another wrapped
   * instance. Double-wrapping would compose the consent gate twice +
   * scrub the payload twice, neither of which is incorrect but both of
   * which obscure the composition seam.
   */
  readonly destinations: ReadonlyMap<AnalyticsDestination, Analytics>;
  /**
   * Destinations to fan out to when the caller passes no `destinations`
   * in the call context. Defaults to `['product-analytics']` — matches
   * the single-destination policy locked in W2.A5 (research wave).
   *
   * Setting this to a multi-destination list switches the wrapper into
   * always-fan-out mode (every track() call hits every destination
   * subject to per-destination consent). The lifecycle-marketing
   * activation gate lives in ADR-0017's deferral table.
   */
  readonly defaultDestinations?: readonly AnalyticsDestination[];
  /**
   * Optional override of the destination → consent category map. When
   * absent, `DEFAULT_CONSENT_CATEGORY_BY_DESTINATION` applies. Composition
   * root passes a partial override to re-classify a destination's consent
   * category without redeploying the wrapper (legal-counsel-driven shifts
   * — e.g., promoting `lifecycle-marketing` to `personalization`). The
   * override is MERGED with the default; unspecified destinations fall
   * through to the default.
   */
  readonly consentCategoryByDestination?: Partial<
    Record<AnalyticsDestination, ConsentCategoryForDestination>
  >;
  readonly consentReader: ConsentReader;
  readonly sanitizer: Sanitizer;
  /**
   * Optional Logger for observability on consent-read failures + per-
   * destination adapter failures. Without the logger, both failure
   * modes drop silently — passing the wrapped logger surfaces them
   * via the structured-log channel for CloudWatch / Sentry breadcrumb
   * traces. The reference is optional so existing call sites compose
   * without change; new call sites should always pass it.
   */
  readonly logger?: Logger;
}

export function wrapAnalytics(options: WrappedAnalyticsOptions): Analytics {
  const {
    destinations,
    defaultDestinations,
    consentCategoryByDestination,
    consentReader,
    sanitizer,
    logger,
  } = options;
  const fallbackDestinations = defaultDestinations ?? DEFAULT_DESTINATIONS;
  // Merge override on top of the default map — composition root only
  // specifies the destinations it wants to re-classify.
  const consentCategoryMap: Readonly<Record<AnalyticsDestination, ConsentCategoryForDestination>> =
    consentCategoryByDestination
      ? { ...DEFAULT_CONSENT_CATEGORY_BY_DESTINATION, ...consentCategoryByDestination }
      : DEFAULT_CONSENT_CATEGORY_BY_DESTINATION;
  // Construction-time fail-loud guard: an empty `defaultDestinations`
  // would silently drop every track() call that omits ctx.destinations.
  // Surfacing this at startup converts a runtime silent no-op into a
  // misconfiguration error (HIGH finding bug-hunter Phase A B.4).
  if (defaultDestinations !== undefined && defaultDestinations.length === 0) {
    throw new Error(
      'wrapAnalytics: defaultDestinations was provided but is empty. ' +
        'Either omit the option to use the canonical default ' +
        "(['product-analytics']) or list at least one destination role.",
    );
  }

  return {
    track: async <E extends AnalyticsEvent>(
      event: E,
      ctx?: AnalyticsCallContext,
    ): Promise<void> => {
      // Scrub the event name before it reaches any log emission. D67
      // requires every value that touches a log to pass the sanitizer;
      // relying on the logger being itself wrapped is fragile — explicit
      // scrub here makes the safety property local to this function.
      const safeEventName = sanitizer.scrub(event.name);

      // Step 1 — consent gate. Fail-closed (D35 Cerebral-lesson posture).
      let consent: ConsentSnapshot;
      try {
        consent = await consentReader.read();
      } catch (err) {
        logger?.warn('analytics_consent_read_failed', {
          event_name: safeEventName,
          error_name: err instanceof Error ? err.name : 'unknown',
        });
        return;
      }

      // Step 2 — runtime PHI assertion (silent in production).
      sanitizer.assertNoPHI(event.props, `analytics:${event.name}`);

      // Step 3 — sanitize once and freeze. Same sanitized payload feeds
      // every destination (scrub is content-deterministic). Shallow
      // freeze at the top level catches an adapter mutating the root
      // props object; nested-object event props would need a deepFreeze
      // helper (no AnalyticsEvent has nested props today).
      const sanitizedProps = Object.freeze(sanitizer.scrub(event.props));
      const vendorCtx = projectVendorCtx(ctx, sanitizer);
      const wrappedEvent = Object.freeze({
        name: event.name,
        props: sanitizedProps,
      }) as E;

      // Step 4 — destination selection + per-destination consent gate.
      // Caller-supplied destinations override the wrapper's default
      // policy; an empty array explicitly opts out of all destinations
      // (sentinel kept as "do not emit" rather than "use defaults" so
      // a typo cannot accidentally fan out). The explicit-empty case
      // is logged so accidental misuse surfaces in CloudWatch rather
      // than dropping silently.
      const callerSuppliedEmpty = ctx?.destinations !== undefined && ctx.destinations.length === 0;
      if (callerSuppliedEmpty) {
        logger?.warn('analytics_explicit_empty_destinations', { event_name: safeEventName });
        return;
      }
      const requested = ctx?.destinations ?? fallbackDestinations;
      const eligible = filterEligibleDestinations(
        requested,
        consent,
        destinations,
        consentCategoryMap,
        safeEventName,
        logger,
      );
      if (eligible.length === 0) return;

      // Step 5 — Promise.allSettled fan-out. One adapter throwing must
      // NOT prevent the others from shipping. Surfaced failures land
      // in the Logger if present; the wrapper itself never re-throws
      // a per-destination failure because the caller is upstream of
      // the fan-out and cannot meaningfully recover from a single sink
      // outage (the other sinks still received the event).
      const settled = await Promise.allSettled(
        eligible.map(async (destination) => {
          // filterEligibleDestinations proved destinations.has(destination).
          // The runtime check is an invariant guard for the lint floor
          // (no-non-null-assertion is forbidden).
          const adapter = destinations.get(destination);
          if (!adapter) {
            throw new Error(
              `wrapAnalytics invariant: destination ${destination} was filtered as eligible but has no wired adapter`,
            );
          }
          await adapter.track(wrappedEvent, vendorCtx);
        }),
      );

      for (let i = 0; i < settled.length; i += 1) {
        const outcome = settled[i];
        if (outcome?.status === 'rejected') {
          const destination = eligible[i];
          logger?.warn('analytics_destination_failed', {
            event_name: safeEventName,
            destination,
            error_name: outcome.reason instanceof Error ? outcome.reason.name : 'unknown',
          });
        }
      }
    },
  };
}

/**
 * Strip wrapper-internal routing fields from the caller's context and
 * scrub the remainder. `destinations` is the only such field today —
 * a routing instruction for the fan-out, never a vendor-facing payload.
 * Without this projection, an adapter wired to a live vendor SDK would
 * echo our internal routing list into the outbound network call.
 */
function projectVendorCtx(
  ctx: AnalyticsCallContext | undefined,
  sanitizer: Sanitizer,
): Readonly<AnalyticsCallContext> | undefined {
  if (!ctx) return undefined;
  const { destinations: _routing, ...vendorFacing } = ctx;
  if (Object.keys(vendorFacing).length === 0) return undefined;
  return Object.freeze(sanitizer.scrub(vendorFacing));
}

function filterEligibleDestinations(
  requested: readonly AnalyticsDestination[],
  consent: ConsentSnapshot,
  destinations: ReadonlyMap<AnalyticsDestination, Analytics>,
  consentCategoryMap: Readonly<Record<AnalyticsDestination, ConsentCategoryForDestination>>,
  safeEventName: string,
  logger: Logger | undefined,
): readonly AnalyticsDestination[] {
  const eligible: AnalyticsDestination[] = [];
  for (const destination of requested) {
    if (!destinations.has(destination)) {
      // Caller asked for a destination the composition root never
      // wired. Treat as a soft miss — log + skip rather than throw —
      // because the destination map is composition-root configuration
      // and a missing destination is operationally identical to a
      // disabled feature flag.
      logger?.warn('analytics_destination_not_wired', {
        event_name: safeEventName,
        destination,
      });
      continue;
    }
    const category = consentCategoryMap[destination];
    if (consent[category] !== true) continue;
    eligible.push(destination);
  }
  return eligible;
}
