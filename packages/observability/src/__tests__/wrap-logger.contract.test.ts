/**
 * Contract test for `wrapLogger` — verifies the PHI sanitizer chokepoint
 * composes around every emission and that the wrapper delegates the
 * correct level to the underlying adapter.
 */

import { makeSanitizer } from '@quilty/security';
import { describe, expect, it } from 'vitest';
import { makeLoggerFake } from '../__fakes__/index.js';
import { wrapLogger } from '../domain/wrap-logger.js';

describe('wrapLogger — PHI sanitizer chokepoint', () => {
  it('scrubs PHI keys in log fields before they reach the adapter', () => {
    const adapter = makeLoggerFake();
    const wrapped = wrapLogger({ adapter, sanitizer: makeSanitizer() });

    wrapped.info('user_action', {
      route: '/en/account',
      email: 'user@example.com',
      diagnosis: 'gad',
      duration_ms: 142,
    });

    expect(adapter.emitted).toHaveLength(1);
    const [record] = adapter.emitted;
    if (!record) throw new Error('expected a log record');
    expect(record.level).toBe('info');
    expect(record.msg).toBe('user_action');
    expect(record.fields).toMatchObject({
      route: '/en/account',
      email: '[REDACTED]',
      diagnosis: '[REDACTED]',
      duration_ms: 142,
    });
  });

  it('delegates each level to the matching adapter method', () => {
    const adapter = makeLoggerFake();
    const wrapped = wrapLogger({ adapter, sanitizer: makeSanitizer() });

    wrapped.debug('d');
    wrapped.info('i');
    wrapped.warn('w');
    wrapped.error('e');

    expect(adapter.emitted.map((r) => r.level)).toEqual(['debug', 'info', 'warn', 'error']);
    expect(adapter.emitted.map((r) => r.msg)).toEqual(['d', 'i', 'w', 'e']);
  });

  it('handles calls with no fields (empty object default)', () => {
    const adapter = makeLoggerFake();
    const wrapped = wrapLogger({ adapter, sanitizer: makeSanitizer() });

    wrapped.info('no fields');

    expect(adapter.emitted).toHaveLength(1);
    expect(adapter.emitted[0]?.fields).toEqual({});
  });

  it('scrubs nested PHI keys recursively (depth >= 3)', () => {
    const adapter = makeLoggerFake();
    const wrapped = wrapLogger({ adapter, sanitizer: makeSanitizer() });

    wrapped.error('boundary', {
      ctx: {
        user: {
          profile: { email: 'leak@example.com', userId: '550e8400-e29b-41d4-a716-446655440000' },
        },
      },
    });

    const [record] = adapter.emitted;
    if (!record) throw new Error('expected a log record');
    const fields = record.fields as {
      ctx: { user: { profile: { email: string; userId: string } } };
    };
    expect(fields.ctx.user.profile.email).toBe('[REDACTED]');
    // camelCase userId (Cerebral failure mode) caught by the normalizer.
    expect(fields.ctx.user.profile.userId).toBe('[REDACTED]');
  });
});
