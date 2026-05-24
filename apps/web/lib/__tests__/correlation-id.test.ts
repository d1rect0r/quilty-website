import { describe, expect, it } from 'vitest';
import { isCorrelationId, mintCorrelationId } from '../correlation-id';

describe('correlation-id', () => {
  it('mints a 14-char string starting with q1m_', () => {
    const id = mintCorrelationId();
    expect(id).toMatch(/^q1m_[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(id.length).toBe(14);
  });

  it('mints unique IDs (collision probability negligible at 48 bits)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1_000; i += 1) {
      ids.add(mintCorrelationId());
    }
    expect(ids.size).toBe(1_000);
  });

  it('isCorrelationId accepts ids minted by mintCorrelationId', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isCorrelationId(mintCorrelationId())).toBe(true);
    }
  });

  it('isCorrelationId rejects ids with the wrong prefix', () => {
    expect(isCorrelationId('m2_ABCDEFGHJK')).toBe(false);
    expect(isCorrelationId('abc_ABCDEFGHJK')).toBe(false);
    expect(isCorrelationId('q1mABCDEFGHJK')).toBe(false);
  });

  it('isCorrelationId rejects ids with the wrong suffix length', () => {
    expect(isCorrelationId('q1m_ABC')).toBe(false);
    expect(isCorrelationId('q1m_ABCDEFGHJKM')).toBe(false);
  });

  it('isCorrelationId rejects suffixes with non-Crockford characters', () => {
    // I, L, O, U excluded from Crockford base32 (visually unambiguous
    // for support staff reading IDs off screenshots / phone calls).
    expect(isCorrelationId('q1m_ABCDEFGHIJ')).toBe(false); // contains I
    expect(isCorrelationId('q1m_ABCDEFGHJL')).toBe(false); // contains L
    expect(isCorrelationId('q1m_ABCDEFGHJO')).toBe(false); // contains O
    expect(isCorrelationId('q1m_ABCDEFGHJU')).toBe(false); // contains U
  });
});
