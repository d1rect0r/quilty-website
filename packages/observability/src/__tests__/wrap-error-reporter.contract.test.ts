/**
 * Contract test for `wrapErrorReporter` — verifies the PHI sanitizer
 * composes around every captureException call.
 */

import { makeSanitizer } from '@quilty/security';
import { describe, expect, it } from 'vitest';
import { makeErrorReporterFake } from '../testing/index.js';
import { wrapErrorReporter } from '../domain/wrap-error-reporter.js';

describe('wrapErrorReporter — PHI sanitizer chokepoint', () => {
  it('scrubs PHI keys in context before reaching the adapter', () => {
    const adapter = makeErrorReporterFake();
    const wrapped = wrapErrorReporter({ adapter, sanitizer: makeSanitizer() });

    wrapped.captureException(new Error('boom'), {
      route: '/en/account',
      email: 'leak@example.com',
      user_id_hash: 'abc',
    });

    expect(adapter.emitted).toHaveLength(1);
    const [record] = adapter.emitted;
    if (!record || !record.context) {
      throw new Error('expected an error record with context');
    }
    expect(record.context.route).toBe('/en/account');
    expect(record.context.email).toBe('[REDACTED]');
    expect(record.context.user_id_hash).toBe('abc');
  });

  it('forwards the error reference unchanged', () => {
    const adapter = makeErrorReporterFake();
    const wrapped = wrapErrorReporter({ adapter, sanitizer: makeSanitizer() });
    const err = new Error('test');

    wrapped.captureException(err);

    expect(adapter.emitted[0]?.error).toBe(err);
    expect(adapter.emitted[0]?.context).toBeUndefined();
  });
});
