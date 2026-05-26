import { describe, expect, it } from 'vitest';
import { formatTraceparent, parseTraceparent } from '../src/domain/traceparent';

describe('formatTraceparent', () => {
  it('produces the W3C-canonical format', () => {
    const tp = formatTraceparent({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: 0x01,
    });
    expect(tp).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  });

  it('zero-pads flags to 2 hex chars', () => {
    const tp = formatTraceparent({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: 0,
    });
    expect(tp.endsWith('-00')).toBe(true);
  });

  it('masks flags to the low byte', () => {
    const tp = formatTraceparent({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      // 0x1ff has high bits set; the formatter should only take the low 8 bits → 0xff
      traceFlags: 0x1ff,
    });
    expect(tp.endsWith('-ff')).toBe(true);
  });
});

describe('parseTraceparent', () => {
  it('parses a canonical W3C value', () => {
    const result = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    expect(result).toEqual({
      version: '00',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      parentId: '00f067aa0ba902b7',
      traceFlags: 1,
    });
  });

  it('lowercases input before parsing', () => {
    const result = parseTraceparent('00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01');
    expect(result?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('rejects malformed inputs', () => {
    expect(parseTraceparent('')).toBeUndefined();
    expect(parseTraceparent(null)).toBeUndefined();
    expect(parseTraceparent(undefined)).toBeUndefined();
    // Wrong field count
    expect(parseTraceparent('00-4bf-00f-01-extra')).toBeUndefined();
    // Wrong version
    expect(
      parseTraceparent('01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'),
    ).toBeUndefined();
    // Wrong trace-id length
    expect(parseTraceparent('00-shorttraceid-00f067aa0ba902b7-01')).toBeUndefined();
    // Non-hex chars
    expect(
      parseTraceparent('00-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-00f067aa0ba902b7-01'),
    ).toBeUndefined();
  });

  it('rejects the all-zero trace-id / span-id (W3C reserved)', () => {
    expect(
      parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01'),
    ).toBeUndefined();
    expect(
      parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01'),
    ).toBeUndefined();
  });
});
