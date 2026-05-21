import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCloudWatchLogger } from '../adapters/cloudwatch-logger';

describe('CloudWatch Logger adapter', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('emits structured JSON with timestamp + level + msg', () => {
    const logger = makeCloudWatchLogger();
    logger.info('user_action', { route: '/en' });

    expect(logSpy).toHaveBeenCalledOnce();
    const raw = logSpy.mock.calls[0]?.[0] as string;
    const record = JSON.parse(raw) as Record<string, unknown>;
    expect(record['level']).toBe('info');
    expect(record['msg']).toBe('user_action');
    expect(record['route']).toBe('/en');
    expect(typeof record['timestamp']).toBe('string');
  });

  it('suppresses debug logs in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const logger = makeCloudWatchLogger();
    logger.debug('verbose stuff');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits debug logs in non-production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const logger = makeCloudWatchLogger();
    logger.debug('verbose stuff');
    expect(logSpy).toHaveBeenCalledOnce();
  });

  it('emits warn + error always', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const logger = makeCloudWatchLogger();
    logger.warn('uh oh');
    logger.error('boom');
    expect(logSpy).toHaveBeenCalledTimes(2);
  });
});
