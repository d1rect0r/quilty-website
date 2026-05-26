/**
 * Contract test for `wrapAnalytics` — the architectural seal that
 * ADR-0010 made invariant. Verifies the Cerebral-lesson chokepoint
 * composition against the actual adapter surface.
 *
 * Required assertions:
 *   1. No emission when ConsentReader returns analytics: false (denial).
 *   2. No emission when ConsentReader throws (fail-closed).
 *   3. Emission when ConsentReader grants analytics: true.
 *   4. PHI keys in event.props are scrubbed before reaching the adapter
 *      (the wrapper composes the Sanitizer per D67).
 *   5. The runtime PHI assertion fires in development on PHI-shaped keys.
 *   6. UUID-shaped values are hashed before reaching the adapter.
 *   7. Per-destination consent gating — a `marketing: false` snapshot
 *      does NOT block the `product-analytics` destination.
 *   8. Promise.allSettled fan-out — one destination throwing does not
 *      starve the others.
 *   9. Caller-supplied `ctx.destinations` overrides the wrapper default.
 */

import { makeSanitizer } from '@quilty/security';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeAnalyticsFake,
  makeConsentReaderFake,
  makeGrantingConsentReaderFake,
  makeLoggerFake,
  type InMemoryAnalytics,
} from '../testing/index';
import { wrapAnalytics } from '../domain/wrap-analytics';
import type { Analytics, AnalyticsDestination } from '../ports';

function singleDestination(adapter: InMemoryAnalytics): Map<AnalyticsDestination, Analytics> {
  return new Map<AnalyticsDestination, Analytics>([['product-analytics', adapter]]);
}

describe('wrapAnalytics — Cerebral-lesson chokepoint', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does NOT emit when ConsentReader returns analytics: false', async () => {
    const adapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      destinations: singleDestination(adapter),
      consentReader: makeConsentReaderFake(), // default-deny
      sanitizer: makeSanitizer(),
    });

    await wrapped.track({ name: 'page_view', props: { route: '/en', locale: 'en' } });

    expect(adapter.emitted).toHaveLength(0);
  });

  it('fails closed when ConsentReader throws', async () => {
    const adapter = makeAnalyticsFake();
    const throwingReader = {
      read: () => {
        throw new Error('consent store unavailable');
      },
    };
    const wrapped = wrapAnalytics({
      destinations: singleDestination(adapter),
      consentReader: throwingReader,
      sanitizer: makeSanitizer(),
    });

    await wrapped.track({ name: 'page_view', props: { route: '/en', locale: 'en' } });

    expect(adapter.emitted).toHaveLength(0);
  });

  it('fails closed when ConsentReader rejects (async error)', async () => {
    const adapter = makeAnalyticsFake();
    const rejectingReader = {
      read: () => Promise.reject(new Error('async failure')),
    };
    const wrapped = wrapAnalytics({
      destinations: singleDestination(adapter),
      consentReader: rejectingReader,
      sanitizer: makeSanitizer(),
    });

    await wrapped.track({ name: 'page_view', props: { route: '/en', locale: 'en' } });

    expect(adapter.emitted).toHaveLength(0);
  });

  it('emits when ConsentReader grants analytics: true', async () => {
    const adapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      destinations: singleDestination(adapter),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
    });

    await wrapped.track({ name: 'page_view', props: { route: '/en', locale: 'en' } });

    expect(adapter.emitted).toHaveLength(1);
    expect(adapter.emitted[0]?.event.name).toBe('page_view');
  });

  it('does NOT emit even when granted if analytics is the marketing-only category', async () => {
    // Defense-in-depth: a hypothetical Marketing-only ConsentReader that
    // grants marketing: true but analytics: false must still no-op the
    // analytics wrapper for the `product-analytics` destination.
    const adapter = makeAnalyticsFake();
    const marketingOnlyReader = {
      read: () => ({
        essential: true as const,
        functional: true,
        analytics: false,
        marketing: true,
        personalization: true,
        gpc_detected: false,
        gpc_honored: false,
        version: 'v1' as const,
        updated_at: null,
      }),
    };
    const wrapped = wrapAnalytics({
      destinations: singleDestination(adapter),
      consentReader: marketingOnlyReader,
      sanitizer: makeSanitizer(),
    });

    await wrapped.track({ name: 'page_view', props: { route: '/en', locale: 'en' } });

    expect(adapter.emitted).toHaveLength(0);
  });

  it('hashes UUID-shaped values before the adapter sees them', async () => {
    const adapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      destinations: singleDestination(adapter),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
    });

    await wrapped.track({
      name: 'cta_click',
      props: {
        cta_id: '550e8400-e29b-41d4-a716-446655440000',
        location: 'header',
      },
    });

    expect(adapter.emitted).toHaveLength(1);
    const emittedProps = adapter.emitted[0]?.event.props as {
      cta_id: string;
      location: string;
    };
    expect(emittedProps.cta_id).toMatch(/^id:[0-9a-f]{8}$/);
    expect(emittedProps.location).toBe('header');
  });

  it('throws in development if a payload contains PHI keys (runtime assertion)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const adapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      destinations: singleDestination(adapter),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
    });

    // Cast bypasses TS structural narrowing — exercising the RUNTIME
    // guard, not the type-level guard.
    const phiEvent = {
      name: 'page_view' as const,
      props: { route: '/en', locale: 'en', email: 'leak@example.com' },
    } as unknown as Parameters<typeof wrapped.track>[0];

    await expect(wrapped.track(phiEvent)).rejects.toThrow(/PHI keys detected/);
  });
});

describe('wrapAnalytics — destination fan-out', () => {
  it('fans out to multiple destinations when caller passes ctx.destinations', async () => {
    const productAdapter = makeAnalyticsFake();
    const marketingAdapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      destinations: new Map<AnalyticsDestination, Analytics>([
        ['product-analytics', productAdapter],
        ['lifecycle-marketing', marketingAdapter],
      ]),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
    });

    await wrapped.track(
      { name: 'signup_completed', props: { method: 'password' } },
      { destinations: ['product-analytics', 'lifecycle-marketing'] },
    );

    expect(productAdapter.emitted).toHaveLength(1);
    expect(marketingAdapter.emitted).toHaveLength(1);
  });

  it('per-destination consent: marketing: false blocks lifecycle-marketing but not product-analytics', async () => {
    const productAdapter = makeAnalyticsFake();
    const marketingAdapter = makeAnalyticsFake();
    const reader = makeGrantingConsentReaderFake({ marketing: false });
    const wrapped = wrapAnalytics({
      destinations: new Map<AnalyticsDestination, Analytics>([
        ['product-analytics', productAdapter],
        ['lifecycle-marketing', marketingAdapter],
      ]),
      consentReader: reader,
      sanitizer: makeSanitizer(),
    });

    await wrapped.track(
      { name: 'signup_completed', props: { method: 'password' } },
      { destinations: ['product-analytics', 'lifecycle-marketing'] },
    );

    expect(productAdapter.emitted).toHaveLength(1);
    expect(marketingAdapter.emitted).toHaveLength(0);
  });

  it('per-destination consent: analytics: false blocks product-analytics + warehouse but not lifecycle-marketing', async () => {
    const productAdapter = makeAnalyticsFake();
    const marketingAdapter = makeAnalyticsFake();
    const warehouseAdapter = makeAnalyticsFake();
    const reader = makeGrantingConsentReaderFake({ analytics: false });
    const wrapped = wrapAnalytics({
      destinations: new Map<AnalyticsDestination, Analytics>([
        ['product-analytics', productAdapter],
        ['lifecycle-marketing', marketingAdapter],
        ['warehouse', warehouseAdapter],
      ]),
      consentReader: reader,
      sanitizer: makeSanitizer(),
    });

    await wrapped.track(
      { name: 'signup_completed', props: { method: 'password' } },
      { destinations: ['product-analytics', 'lifecycle-marketing', 'warehouse'] },
    );

    expect(productAdapter.emitted).toHaveLength(0);
    expect(warehouseAdapter.emitted).toHaveLength(0);
    expect(marketingAdapter.emitted).toHaveLength(1);
  });

  it('Promise.allSettled isolation: one destination throwing does not starve the others', async () => {
    const productAdapter = makeAnalyticsFake();
    const throwingMarketingAdapter: Analytics = {
      track: () => Promise.reject(new Error('lifecycle vendor 503')),
    };
    const logger = makeLoggerFake();
    const wrapped = wrapAnalytics({
      destinations: new Map<AnalyticsDestination, Analytics>([
        ['product-analytics', productAdapter],
        ['lifecycle-marketing', throwingMarketingAdapter],
      ]),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
      logger,
    });

    await wrapped.track(
      { name: 'signup_started', props: { source: 'hero' } },
      { destinations: ['product-analytics', 'lifecycle-marketing'] },
    );

    // The product destination shipped despite the marketing failure.
    expect(productAdapter.emitted).toHaveLength(1);
    // The failure surfaced through the logger rather than re-throwing.
    const failureLogs = logger.emitted.filter((r) => r.msg === 'analytics_destination_failed');
    expect(failureLogs).toHaveLength(1);
    expect(failureLogs[0]?.fields.destination).toBe('lifecycle-marketing');
  });

  it('defaultDestinations applies when caller omits ctx.destinations', async () => {
    const productAdapter = makeAnalyticsFake();
    const marketingAdapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      destinations: new Map<AnalyticsDestination, Analytics>([
        ['product-analytics', productAdapter],
        ['lifecycle-marketing', marketingAdapter],
      ]),
      // Default fans out to both — caller-omitted destinations means "use this policy".
      defaultDestinations: ['product-analytics', 'lifecycle-marketing'],
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
    });

    await wrapped.track({ name: 'page_view', props: { route: '/en', locale: 'en' } });

    expect(productAdapter.emitted).toHaveLength(1);
    expect(marketingAdapter.emitted).toHaveLength(1);
  });

  it('caller-supplied empty destinations array opts out + surfaces a warn log', async () => {
    const productAdapter = makeAnalyticsFake();
    const logger = makeLoggerFake();
    const wrapped = wrapAnalytics({
      destinations: singleDestination(productAdapter),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
      logger,
    });

    await wrapped.track(
      { name: 'page_view', props: { route: '/en', locale: 'en' } },
      { destinations: [] },
    );

    expect(productAdapter.emitted).toHaveLength(0);
    const emptyLogs = logger.emitted.filter(
      (r) => r.msg === 'analytics_explicit_empty_destinations',
    );
    expect(emptyLogs).toHaveLength(1);
  });

  it('zero-adapter destinations Map: no-op without emission', async () => {
    const logger = makeLoggerFake();
    const wrapped = wrapAnalytics({
      destinations: new Map<AnalyticsDestination, Analytics>(),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
      logger,
    });

    await wrapped.track({ name: 'page_view', props: { route: '/en', locale: 'en' } });

    // The default destination (`product-analytics`) is not wired; the
    // wrapper surfaces a not-wired warn and short-circuits.
    const missLogs = logger.emitted.filter((r) => r.msg === 'analytics_destination_not_wired');
    expect(missLogs).toHaveLength(1);
    expect(missLogs[0]?.fields.destination).toBe('product-analytics');
  });

  it('construction-time guard: empty defaultDestinations throws', () => {
    const productAdapter = makeAnalyticsFake();
    expect(() =>
      wrapAnalytics({
        destinations: singleDestination(productAdapter),
        defaultDestinations: [],
        consentReader: makeGrantingConsentReaderFake(),
        sanitizer: makeSanitizer(),
      }),
    ).toThrow(/defaultDestinations was provided but is empty/);
  });

  it('consentCategoryByDestination override re-classifies a destination', async () => {
    // Legal-counsel pivot: lifecycle-marketing reclassified to
    // `personalization`. A snapshot with marketing: false but
    // personalization: true now passes the gate.
    const marketingAdapter = makeAnalyticsFake();
    const reader = makeGrantingConsentReaderFake({ marketing: false, personalization: true });
    const wrapped = wrapAnalytics({
      destinations: new Map<AnalyticsDestination, Analytics>([
        ['lifecycle-marketing', marketingAdapter],
      ]),
      consentCategoryByDestination: { 'lifecycle-marketing': 'personalization' },
      defaultDestinations: ['lifecycle-marketing'],
      consentReader: reader,
      sanitizer: makeSanitizer(),
    });

    await wrapped.track({ name: 'signup_started', props: { source: 'hero' } });

    expect(marketingAdapter.emitted).toHaveLength(1);
  });

  it('frozen payload isolates the fan-out: an upstream mutator does not corrupt downstream destinations', async () => {
    let mutationAttempted = false;
    const mutatingAdapter: Analytics = {
      track: async (event) => {
        try {
          (event.props as Record<string, unknown>)['injected'] = 'mutated';
        } catch {
          mutationAttempted = true;
        }
      },
    };
    const downstreamAdapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      destinations: new Map<AnalyticsDestination, Analytics>([
        ['product-analytics', mutatingAdapter],
        ['lifecycle-marketing', downstreamAdapter],
      ]),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
    });

    await wrapped.track(
      { name: 'page_view', props: { route: '/en', locale: 'en' } },
      { destinations: ['product-analytics', 'lifecycle-marketing'] },
    );

    // Strict-mode write to a frozen object throws TypeError; the
    // mutator observed the failure rather than silently corrupting
    // the payload.
    expect(mutationAttempted).toBe(true);
    // Downstream destination still received the un-mutated payload.
    expect(downstreamAdapter.emitted).toHaveLength(1);
    const downstreamProps = downstreamAdapter.emitted[0]?.event.props as Record<string, unknown>;
    expect(downstreamProps['injected']).toBeUndefined();
  });

  it('wrapper-internal ctx.destinations is stripped from the vendor-facing context', async () => {
    const adapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      destinations: singleDestination(adapter),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
    });

    await wrapped.track(
      { name: 'page_view', props: { route: '/en', locale: 'en' } },
      { user_id_hash: 'sub-abc', destinations: ['product-analytics'] },
    );

    expect(adapter.emitted).toHaveLength(1);
    const seenCtx = adapter.emitted[0]?.ctx as
      | (Record<string, unknown> & { destinations?: readonly string[] })
      | undefined;
    // user_id_hash is preserved (vendor-facing field).
    expect(seenCtx?.['user_id_hash']).toBe('sub-abc');
    // destinations was a wrapper-internal routing instruction; it must
    // never reach an adapter (Phase C finding — vendor SDKs would
    // otherwise echo our routing list into outbound network calls).
    expect(seenCtx?.destinations).toBeUndefined();
  });

  it('ctx with only the destinations routing field collapses to undefined for the adapter', async () => {
    const adapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      destinations: singleDestination(adapter),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
    });

    await wrapped.track(
      { name: 'page_view', props: { route: '/en', locale: 'en' } },
      { destinations: ['product-analytics'] },
    );

    expect(adapter.emitted).toHaveLength(1);
    expect(adapter.emitted[0]?.ctx).toBeUndefined();
  });

  it('ctx fields are scrubbed before reaching the adapter (UUID hashing)', async () => {
    const adapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      destinations: singleDestination(adapter),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
    });

    await wrapped.track(
      { name: 'page_view', props: { route: '/en', locale: 'en' } },
      { session_id: '550e8400-e29b-41d4-a716-446655440000' },
    );

    expect(adapter.emitted).toHaveLength(1);
    const seenCtx = adapter.emitted[0]?.ctx as { session_id: string } | undefined;
    // UUID-shaped session_id is djb2-hashed by the sanitizer before the
    // adapter sees it.
    expect(seenCtx?.session_id).toMatch(/^id:[0-9a-f]{8}$/);
  });

  it('caller-supplied destination not wired in the map logs + skips (soft miss)', async () => {
    const productAdapter = makeAnalyticsFake();
    const logger = makeLoggerFake();
    const wrapped = wrapAnalytics({
      destinations: singleDestination(productAdapter),
      consentReader: makeGrantingConsentReaderFake(),
      sanitizer: makeSanitizer(),
      logger,
    });

    await wrapped.track(
      { name: 'page_view', props: { route: '/en', locale: 'en' } },
      // `warehouse` is requested but not wired into the destinations map.
      { destinations: ['product-analytics', 'warehouse'] },
    );

    // product-analytics still ships.
    expect(productAdapter.emitted).toHaveLength(1);
    // Missing destination surfaced via the logger.
    const missLogs = logger.emitted.filter((r) => r.msg === 'analytics_destination_not_wired');
    expect(missLogs).toHaveLength(1);
    expect(missLogs[0]?.fields.destination).toBe('warehouse');
  });
});
