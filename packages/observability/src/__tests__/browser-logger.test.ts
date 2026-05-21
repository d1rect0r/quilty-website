import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBrowserLogger } from '../adapters/browser-logger.js';

describe('makeBrowserLogger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('emits every level to the console in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const logger = makeBrowserLogger();
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(consoleSpy).toHaveBeenCalledTimes(4);
  });

  it('suppresses ALL levels (including warn + error) under NODE_ENV=production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const logger = makeBrowserLogger();
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    // Browser console is visible to the user, every installed
    // extension, and any injected analytics script — D31/D42d leak
    // surface. Silence in production is the safety property.
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('emits a JSON-shaped record with timestamp + level + msg in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const logger = makeBrowserLogger();
    logger.info('hello', { route: '/en' });
    const payload = consoleSpy.mock.calls[0]?.[0];
    expect(typeof payload).toBe('string');
    const parsed = JSON.parse(payload as string);
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('hello');
    expect(parsed.route).toBe('/en');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('captures level on each call (debug vs info vs warn vs error)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const logger = makeBrowserLogger();
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    const levels = consoleSpy.mock.calls.map((c) => JSON.parse(c[0] as string).level);
    expect(levels).toEqual(['debug', 'info', 'warn', 'error']);
  });
});
