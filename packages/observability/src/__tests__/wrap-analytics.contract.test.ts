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
 */

import { makeSanitizer } from '@quilty/security';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeAnalyticsFake,
  makeConsentReaderFake,
  makeGrantingConsentReaderFake,
} from '../testing/index';
import { wrapAnalytics } from '../domain/wrap-analytics';

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
      adapter,
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
      adapter,
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
      adapter,
      consentReader: rejectingReader,
      sanitizer: makeSanitizer(),
    });

    await wrapped.track({ name: 'page_view', props: { route: '/en', locale: 'en' } });

    expect(adapter.emitted).toHaveLength(0);
  });

  it('emits when ConsentReader grants analytics: true', async () => {
    const adapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      adapter,
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
    // analytics wrapper.
    const adapter = makeAnalyticsFake();
    const marketingOnlyReader = {
      read: () => ({
        analytics: false,
        marketing: true,
        preferences: true,
        gpc_detected: false,
      }),
    };
    const wrapped = wrapAnalytics({
      adapter,
      consentReader: marketingOnlyReader,
      sanitizer: makeSanitizer(),
    });

    await wrapped.track({ name: 'page_view', props: { route: '/en', locale: 'en' } });

    expect(adapter.emitted).toHaveLength(0);
  });

  it('hashes UUID-shaped values before the adapter sees them', async () => {
    const adapter = makeAnalyticsFake();
    const wrapped = wrapAnalytics({
      adapter,
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
      adapter,
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
