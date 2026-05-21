import { makeDefaultDenyConsentReader } from '@quilty/consent';
import {
  makeAmplitudeAnalytics,
  makeCloudWatchLogger,
  makeEnvFlagEvaluator,
  makeSentryErrorReporter,
  wrapAnalytics,
  wrapErrorReporter,
  wrapLogger,
} from '@quilty/observability';
import { makeCspBuilder, makeHeadersBuilder, makeSanitizer } from '@quilty/security';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetContainerForTesting, getContainer, type Container } from '../get-container';

function makeTestContainer(): Container {
  // Real factories from the workspace packages so the Container has the
  // shape it ships with. The identity-stability tests don't care about
  // contents; what matters is that the *same* object identity is returned
  // across calls.
  const sanitizer = makeSanitizer();
  const logger = wrapLogger({ adapter: makeCloudWatchLogger(), sanitizer });
  return {
    sanitizer,
    cspBuilder: makeCspBuilder(),
    headersBuilder: makeHeadersBuilder(),
    logger,
    analytics: wrapAnalytics({
      adapter: makeAmplitudeAnalytics({ logger }),
      consentReader: makeDefaultDenyConsentReader(),
      sanitizer,
    }),
    errorReporter: wrapErrorReporter({ adapter: makeSentryErrorReporter(), sanitizer }),
    featureFlags: makeEnvFlagEvaluator(),
  };
}

describe('getContainer', () => {
  afterEach(() => {
    __resetContainerForTesting();
  });

  it('returns the factory result on first call', () => {
    const expected = makeTestContainer();
    const factory = vi.fn<() => Container>(() => expected);

    const result = getContainer(factory);

    expect(result).toBe(expected);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('returns the same Container identity across successive calls', () => {
    // Defense-in-depth assertion: validates the globalThis singleton anchor
    // documented in ADR-0010 against the Next.js 16 webpack chunk-duplication
    // scenario. If this test fails, vendor SDKs may be initialized twice
    // and the PHI sanitizer chokepoint discipline is at risk.
    const factory = vi.fn<() => Container>(makeTestContainer);

    const first = getContainer(factory);
    const second = getContainer(factory);
    const third = getContainer(factory);

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('ignores a second factory once the singleton is anchored', () => {
    // First caller wins. Subsequent callers that pass a different factory
    // still get the originally-anchored instance — preventing accidental
    // re-composition mid-process.
    const initialContainer = makeTestContainer();
    const initialFactory = vi.fn<() => Container>(() => initialContainer);
    const replacementFactory = vi.fn<() => Container>(makeTestContainer);

    const first = getContainer(initialFactory);
    const second = getContainer(replacementFactory);

    expect(first).toBe(initialContainer);
    expect(second).toBe(initialContainer);
    expect(initialFactory).toHaveBeenCalledTimes(1);
    expect(replacementFactory).not.toHaveBeenCalled();
  });

  it('rebuilds after __resetContainerForTesting', () => {
    const firstContainer = makeTestContainer();
    const secondContainer = makeTestContainer();
    const firstFactory = vi.fn<() => Container>(() => firstContainer);
    const secondFactory = vi.fn<() => Container>(() => secondContainer);

    const first = getContainer(firstFactory);
    __resetContainerForTesting();
    const second = getContainer(secondFactory);

    expect(first).toBe(firstContainer);
    expect(second).toBe(secondContainer);
    expect(first).not.toBe(second);
  });
});
