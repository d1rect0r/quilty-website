import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAmplitudeNodeAnalytics } from '../adapters/amplitude-node';
import type { Logger } from '../ports';

const initMock = vi.fn((..._args: unknown[]) => ({ promise: Promise.resolve() }));
const trackMock = vi.fn();
const flushMock = vi.fn(() => ({ promise: Promise.resolve() }));

vi.mock('@amplitude/analytics-node', () => ({
  init: (...args: unknown[]) => initMock(...args),
  track: (...args: unknown[]) => trackMock(...args),
  flush: () => flushMock(),
}));

function fakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const SUB_STARTED = {
  name: 'subscription_started',
  props: { plan: 'annual' },
} as const;

describe('makeAmplitudeNodeAnalytics', () => {
  beforeEach(() => {
    initMock.mockClear();
    trackMock.mockReset();
    flushMock.mockClear();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('dormant', () => {
    it('logs event name only when disabled', async () => {
      const logger = fakeLogger();
      const analytics = makeAmplitudeNodeAnalytics({ logger, apiKey: 'k', enabled: false });
      await analytics.track(SUB_STARTED, { user_id_hash: 'h' });
      expect(logger.debug).toHaveBeenCalledWith('analytics:event', {
        event_name: 'subscription_started',
      });
      expect(initMock).not.toHaveBeenCalled();
    });

    it('stays dormant when enabled but no API key is present', async () => {
      const logger = fakeLogger();
      const analytics = makeAmplitudeNodeAnalytics({ logger, apiKey: undefined, enabled: true });
      await analytics.track(SUB_STARTED, { user_id_hash: 'h' });
      expect(initMock).not.toHaveBeenCalled();
    });
  });

  describe('active', () => {
    it('skips (and logs) an event with no user_id_hash — the Node SDK requires a user', async () => {
      const logger = fakeLogger();
      const analytics = makeAmplitudeNodeAnalytics({ logger, apiKey: 'k', enabled: true });
      await analytics.track(SUB_STARTED);
      expect(logger.debug).toHaveBeenCalledWith('analytics:event_skipped_no_user', {
        event_name: 'subscription_started',
      });
      expect(initMock).not.toHaveBeenCalled();
      expect(trackMock).not.toHaveBeenCalled();
    });

    it('inits once, tracks with user_id, and awaits flush for delivery', async () => {
      const logger = fakeLogger();
      const analytics = makeAmplitudeNodeAnalytics({ logger, apiKey: 'srv-key', enabled: true });
      await analytics.track(SUB_STARTED, { user_id_hash: 'hash-9' });

      expect(initMock).toHaveBeenCalledWith('srv-key');
      expect(trackMock).toHaveBeenCalledWith('subscription_started', SUB_STARTED.props, {
        user_id: 'hash-9',
      });
      expect(flushMock).toHaveBeenCalledTimes(1);
    });

    it('inits only once across events', async () => {
      const logger = fakeLogger();
      const analytics = makeAmplitudeNodeAnalytics({ logger, apiKey: 'k', enabled: true });
      await analytics.track(SUB_STARTED, { user_id_hash: 'u' });
      await analytics.track(SUB_STARTED, { user_id_hash: 'u' });
      expect(initMock).toHaveBeenCalledTimes(1);
      expect(trackMock).toHaveBeenCalledTimes(2);
      expect(flushMock).toHaveBeenCalledTimes(2);
    });

    it('never throws and warns when the SDK throws', async () => {
      const logger = fakeLogger();
      trackMock.mockImplementation(() => {
        throw new Error('vendor down');
      });
      const analytics = makeAmplitudeNodeAnalytics({ logger, apiKey: 'k', enabled: true });
      await expect(analytics.track(SUB_STARTED, { user_id_hash: 'u' })).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith('analytics:emit_failed', {
        event_name: 'subscription_started',
      });
    });
  });
});
