import { makeInMemoryApiClient } from '@quilty/api-client/testing';
import { makeInMemoryCaptchaVerifier } from '@quilty/captcha';
import { makeDefaultDenyConsentReader } from '@quilty/consent';
import { makeInMemoryConsentStore } from '@quilty/consent/server';
import { makeInMemoryEmailSender, wrapEmailSender } from '@quilty/email';
import {
  makeAmplitudeAnalytics,
  makeBrowserLogger,
  makeCloudWatchLogger,
  makeEnvFlagEvaluator,
  makePhiScrubber,
  makeSentryErrorReporter,
  wrapAnalytics,
  wrapErrorReporter,
  wrapLogger,
} from '@quilty/observability';
import { makeInMemoryRateLimiter } from '@quilty/rate-limit';
import { makeSanitizer } from '@quilty/security';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetContainerForTesting,
  getClientContainer,
  getEdgeContainer,
  getServerContainer,
  type ClientContainer,
  type EdgeContainer,
  type ServerContainer,
} from '../get-container';

function makeTestServerContainer(): ServerContainer {
  const sanitizer = makeSanitizer();
  const logger = wrapLogger({ adapter: makeCloudWatchLogger(), sanitizer });
  return {
    runtime: 'server',
    sanitizer,
    logger,
    analytics: wrapAnalytics({
      adapter: makeAmplitudeAnalytics({ logger }),
      consentReader: makeDefaultDenyConsentReader(),
      sanitizer,
    }),
    errorReporter: wrapErrorReporter({ adapter: makeSentryErrorReporter(), sanitizer }),
    featureFlags: makeEnvFlagEvaluator(),
    phiScrubber: makePhiScrubber(),
    emailSender: wrapEmailSender({ adapter: makeInMemoryEmailSender(), sanitizer }),
    captchaVerifier: makeInMemoryCaptchaVerifier(),
    rateLimiter: makeInMemoryRateLimiter(),
    consentStore: makeInMemoryConsentStore(),
    apiClient: makeInMemoryApiClient({
      handler: async <TBody = unknown>() => ({ status: 200, body: undefined as TBody }),
    }),
  };
}

function makeTestClientContainer(): ClientContainer {
  const sanitizer = makeSanitizer();
  const logger = wrapLogger({ adapter: makeBrowserLogger(), sanitizer });
  return {
    runtime: 'client',
    sanitizer,
    logger,
    analytics: wrapAnalytics({
      adapter: makeAmplitudeAnalytics({ logger }),
      consentReader: makeDefaultDenyConsentReader(),
      sanitizer,
    }),
    errorReporter: wrapErrorReporter({ adapter: makeSentryErrorReporter(), sanitizer }),
    featureFlags: makeEnvFlagEvaluator(),
    phiScrubber: makePhiScrubber(),
  };
}

function makeTestEdgeContainer(): EdgeContainer {
  const sanitizer = makeSanitizer();
  const logger = wrapLogger({ adapter: makeCloudWatchLogger(), sanitizer });
  return {
    runtime: 'edge',
    sanitizer,
    logger,
    analytics: wrapAnalytics({
      adapter: makeAmplitudeAnalytics({ logger }),
      consentReader: makeDefaultDenyConsentReader(),
      sanitizer,
    }),
    errorReporter: wrapErrorReporter({ adapter: makeSentryErrorReporter(), sanitizer }),
    featureFlags: makeEnvFlagEvaluator(),
    phiScrubber: makePhiScrubber(),
    consentStore: makeInMemoryConsentStore(),
    apiClient: makeInMemoryApiClient({
      handler: async <TBody = unknown>() => ({ status: 200, body: undefined as TBody }),
    }),
  };
}

describe('per-runtime container accessors', () => {
  afterEach(() => {
    __resetContainerForTesting();
  });

  describe('getServerContainer', () => {
    it('returns the factory result on first call', () => {
      const expected = makeTestServerContainer();
      const factory = vi.fn<() => ServerContainer>(() => expected);
      const result = getServerContainer(factory);
      expect(result).toBe(expected);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('returns the same identity across successive calls (globalThis singleton)', () => {
      const factory = vi.fn<() => ServerContainer>(makeTestServerContainer);
      const first = getServerContainer(factory);
      const second = getServerContainer(factory);
      const third = getServerContainer(factory);
      expect(first).toBe(second);
      expect(second).toBe(third);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('first caller wins — a different factory passed later does not re-compose', () => {
      const initial = makeTestServerContainer();
      const initialFactory = vi.fn<() => ServerContainer>(() => initial);
      const replacementFactory = vi.fn<() => ServerContainer>(makeTestServerContainer);
      const first = getServerContainer(initialFactory);
      const second = getServerContainer(replacementFactory);
      expect(first).toBe(initial);
      expect(second).toBe(initial);
      expect(replacementFactory).not.toHaveBeenCalled();
    });

    it('returns a ServerContainer (discriminant present)', () => {
      const container = getServerContainer(makeTestServerContainer);
      expect(container.runtime).toBe('server');
    });
  });

  describe('getClientContainer', () => {
    it('returns the same identity across calls', () => {
      const factory = vi.fn<() => ClientContainer>(makeTestClientContainer);
      const first = getClientContainer(factory);
      const second = getClientContainer(factory);
      expect(first).toBe(second);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('returns a ClientContainer (discriminant present)', () => {
      const container = getClientContainer(makeTestClientContainer);
      expect(container.runtime).toBe('client');
    });
  });

  describe('getEdgeContainer', () => {
    it('returns the same identity across calls', () => {
      const factory = vi.fn<() => EdgeContainer>(makeTestEdgeContainer);
      const first = getEdgeContainer(factory);
      const second = getEdgeContainer(factory);
      expect(first).toBe(second);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('returns an EdgeContainer (discriminant present)', () => {
      const container = getEdgeContainer(makeTestEdgeContainer);
      expect(container.runtime).toBe('edge');
    });
  });

  describe('per-runtime slot isolation', () => {
    it('server + client containers are independent (different identities)', () => {
      const server = getServerContainer(makeTestServerContainer);
      const client = getClientContainer(makeTestClientContainer);
      expect(server).not.toBe(client);
      expect(server.runtime).toBe('server');
      expect(client.runtime).toBe('client');
    });

    it('client + edge containers are independent (different identities)', () => {
      const client = getClientContainer(makeTestClientContainer);
      const edge = getEdgeContainer(makeTestEdgeContainer);
      expect(client).not.toBe(edge);
      expect(client.runtime).toBe('client');
      expect(edge.runtime).toBe('edge');
    });
  });

  describe('__resetContainerForTesting', () => {
    it('rebuilds all three runtime containers after reset', () => {
      const s1 = getServerContainer(makeTestServerContainer);
      const c1 = getClientContainer(makeTestClientContainer);
      const e1 = getEdgeContainer(makeTestEdgeContainer);
      __resetContainerForTesting();
      const s2 = getServerContainer(makeTestServerContainer);
      const c2 = getClientContainer(makeTestClientContainer);
      const e2 = getEdgeContainer(makeTestEdgeContainer);
      expect(s1).not.toBe(s2);
      expect(c1).not.toBe(c2);
      expect(e1).not.toBe(e2);
    });
  });
});
