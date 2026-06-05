import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAmplitudeBrowserAnalytics } from '../adapters/amplitude-browser';
import type { Logger } from '../ports';

const initMock = vi.fn();
const trackMock = vi.fn();

vi.mock('@amplitude/analytics-browser', () => ({
  init: (...args: unknown[]) => initMock(...args),
  track: (...args: unknown[]) => trackMock(...args),
}));

function fakeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const PAGE_VIEW = { name: 'page_view', props: { route: '/', locale: 'en' } } as const;

describe('makeAmplitudeBrowserAnalytics', () => {
  beforeEach(() => {
    initMock.mockReset();
    trackMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('dormant (no network beacon)', () => {
    it('logs event name only and never calls SDK init/track when disabled', async () => {
      const logger = fakeLogger();
      const analytics = makeAmplitudeBrowserAnalytics({ logger, apiKey: 'key', enabled: false });
      await analytics.track(PAGE_VIEW);
      expect(logger.debug).toHaveBeenCalledWith('analytics:event', { event_name: 'page_view' });
      expect(initMock).not.toHaveBeenCalled();
      expect(trackMock).not.toHaveBeenCalled();
    });

    it('stays dormant when enabled but no API key is present', async () => {
      const logger = fakeLogger();
      const analytics = makeAmplitudeBrowserAnalytics({ logger, apiKey: undefined, enabled: true });
      await analytics.track(PAGE_VIEW);
      expect(initMock).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('analytics:event', { event_name: 'page_view' });
    });

    it('never forwards props/ctx in the dormant log (D67)', async () => {
      const logger = fakeLogger();
      const analytics = makeAmplitudeBrowserAnalytics({ logger, enabled: false });
      await analytics.track(PAGE_VIEW, { user_id_hash: 'h' });
      expect(logger.debug).toHaveBeenCalledWith('analytics:event', { event_name: 'page_view' });
      expect(logger.debug).not.toHaveBeenCalledWith(
        'analytics:event',
        expect.objectContaining({ props: expect.anything() }),
      );
    });
  });

  describe('active (flag on + key present)', () => {
    it('initialises once with privacy-hardened options and forwards name + props', async () => {
      const logger = fakeLogger();
      const analytics = makeAmplitudeBrowserAnalytics({
        logger,
        apiKey: 'pub-key',
        enabled: true,
      });
      await analytics.track(PAGE_VIEW, { user_id_hash: 'hash-123' });

      expect(initMock).toHaveBeenCalledTimes(1);
      expect(initMock).toHaveBeenCalledWith('pub-key', undefined, {
        autocapture: false,
        fetchRemoteConfig: false,
        trackingOptions: { ipAddress: false },
      });
      expect(trackMock).toHaveBeenCalledWith('page_view', PAGE_VIEW.props, {
        user_id: 'hash-123',
      });
    });

    it('initialises only once across multiple events', async () => {
      const logger = fakeLogger();
      const analytics = makeAmplitudeBrowserAnalytics({ logger, apiKey: 'k', enabled: true });
      await analytics.track(PAGE_VIEW);
      await analytics.track(PAGE_VIEW);
      await analytics.track(PAGE_VIEW);
      expect(initMock).toHaveBeenCalledTimes(1);
      expect(trackMock).toHaveBeenCalledTimes(3);
    });

    it('omits user_id when the call carries no user_id_hash', async () => {
      const logger = fakeLogger();
      const analytics = makeAmplitudeBrowserAnalytics({ logger, apiKey: 'k', enabled: true });
      await analytics.track(PAGE_VIEW);
      expect(trackMock).toHaveBeenCalledWith('page_view', PAGE_VIEW.props, undefined);
    });

    it('never throws and logs analytics:emit_failed when the SDK track throws', async () => {
      const logger = fakeLogger();
      trackMock.mockImplementation(() => {
        throw new Error('vendor down');
      });
      const analytics = makeAmplitudeBrowserAnalytics({ logger, apiKey: 'k', enabled: true });
      await expect(analytics.track(PAGE_VIEW)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith('analytics:emit_failed', {
        event_name: 'page_view',
      });
    });

    it('a post-init track failure does NOT reset init (re-uses the SDK)', async () => {
      const logger = fakeLogger();
      trackMock.mockImplementationOnce(() => {
        throw new Error('transient');
      });
      const analytics = makeAmplitudeBrowserAnalytics({ logger, apiKey: 'k', enabled: true });
      await analytics.track(PAGE_VIEW); // init succeeds, track throws → emit_failed (no reset)
      await analytics.track(PAGE_VIEW); // re-uses cached init
      expect(initMock).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith('analytics:emit_failed', {
        event_name: 'page_view',
      });
    });

    it('self-heals: re-initialises after a transient INIT failure', async () => {
      const logger = fakeLogger();
      initMock.mockImplementationOnce(() => {
        throw new Error('init transient');
      });
      const analytics = makeAmplitudeBrowserAnalytics({ logger, apiKey: 'k', enabled: true });
      await analytics.track(PAGE_VIEW); // init throws → init_failed + reset cached promise
      await analytics.track(PAGE_VIEW); // re-inits + succeeds
      expect(initMock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith('analytics:init_failed', {
        event_name: 'page_view',
      });
    });
  });
});
