/**
 * Algolia adapter skeleton — activation-gate tests.
 *
 * The factory throws `AlgoliaAdapterNotActivatedError` at instantiation
 * by design (skeleton per ADR-0019 Decision C). These tests assert the
 * shape stays locked: the type surface exists in the public barrel,
 * instantiation surfaces a clear error pointing at the activation
 * ADR, and the error is `instanceof Error` for catch-block ergonomics.
 *
 * When the activation trigger fires (typo tolerance / facets / search
 * analytics demand), the skeleton body is replaced with a real
 * adapter; these tests then pivot to vendor-specific behaviour
 * assertions per the canonical algolia-skeleton → algolia-adapter
 * promotion.
 */

import { describe, expect, it } from 'vitest';
import { makeAlgoliaAdapter, AlgoliaAdapterNotActivatedError } from '../src/index';

describe('Algolia adapter skeleton — activation gate', () => {
  it('throws AlgoliaAdapterNotActivatedError on instantiation', () => {
    expect(() =>
      makeAlgoliaAdapter({
        applicationId: 'TEST',
        searchApiKey: 'stub',
        indexName: 'quilty',
      }),
    ).toThrow(AlgoliaAdapterNotActivatedError);
  });

  it('error is instanceof Error for generic catch blocks', () => {
    let caught: unknown;
    try {
      makeAlgoliaAdapter({
        applicationId: 'TEST',
        searchApiKey: 'stub',
        indexName: 'quilty',
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(AlgoliaAdapterNotActivatedError);
  });

  it('error message points at ADR-0019 activation gate', () => {
    expect(() =>
      makeAlgoliaAdapter({
        applicationId: 'TEST',
        searchApiKey: 'stub',
        indexName: 'quilty',
      }),
    ).toThrow(/ADR-0019/);
  });

  it('error name matches class name for log-grep ergonomics', () => {
    try {
      makeAlgoliaAdapter({
        applicationId: 'TEST',
        searchApiKey: 'stub',
        indexName: 'quilty',
      });
      expect.fail('expected makeAlgoliaAdapter to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      if (err instanceof Error) {
        expect(err.name).toBe('AlgoliaAdapterNotActivatedError');
      }
    }
  });
});
