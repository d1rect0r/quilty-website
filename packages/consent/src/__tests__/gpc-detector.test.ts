import { describe, expect, it } from 'vitest';
import { detectGpcFromHeaders } from '../domain/gpc-detector';

describe('detectGpcFromHeaders', () => {
  function makeHeaders(value: string | null) {
    return {
      get: (name: string) => (name.toLowerCase() === 'sec-gpc' ? value : null),
    };
  }

  it('returns true for Sec-GPC: 1', () => {
    expect(detectGpcFromHeaders(makeHeaders('1'))).toBe(true);
  });

  it('returns false for Sec-GPC: 0 (opt-in is the absence of a signal, not a 0)', () => {
    expect(detectGpcFromHeaders(makeHeaders('0'))).toBe(false);
  });

  it('returns false when the header is absent', () => {
    expect(detectGpcFromHeaders(makeHeaders(null))).toBe(false);
  });

  it('returns false for any non-"1" string (spec defines only "1" as the opt-out signal)', () => {
    expect(detectGpcFromHeaders(makeHeaders('true'))).toBe(false);
    expect(detectGpcFromHeaders(makeHeaders('yes'))).toBe(false);
    expect(detectGpcFromHeaders(makeHeaders(''))).toBe(false);
    expect(detectGpcFromHeaders(makeHeaders(' 1 '))).toBe(false);
  });
});
