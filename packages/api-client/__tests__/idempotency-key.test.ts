import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_KEY_HEADER,
  generateIdempotencyKey,
  isValidIdempotencyKey,
} from '../src/domain/idempotency-key';

describe('generateIdempotencyKey', () => {
  it('produces a 36-character UUIDv7 string', () => {
    const key = generateIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('produces unique keys across consecutive calls', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      keys.add(generateIdempotencyKey());
    }
    expect(keys.size).toBe(1000);
  });

  it('produces monotonically sortable keys (UUIDv7 timestamp prefix)', async () => {
    const k1 = generateIdempotencyKey();
    // Sleep so the millisecond-precision timestamp prefix advances.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const k2 = generateIdempotencyKey();
    expect(k1 < k2).toBe(true);
  });
});

describe('isValidIdempotencyKey', () => {
  it('accepts UUIDs', () => {
    expect(isValidIdempotencyKey('01904c8a-3a7b-7c34-8e6c-5e2a1d3b4f8e')).toBe(true);
  });

  it('accepts other 16-256 char token-shaped strings', () => {
    expect(isValidIdempotencyKey('abcdef1234567890')).toBe(true);
    expect(isValidIdempotencyKey('a'.repeat(256))).toBe(true);
  });

  it('rejects too-short or too-long strings', () => {
    expect(isValidIdempotencyKey('short')).toBe(false);
    expect(isValidIdempotencyKey('a'.repeat(257))).toBe(false);
  });

  it('rejects strings with CR/LF (header-injection guard)', () => {
    expect(isValidIdempotencyKey('valid-prefix\r\nX-Injected: 1' + 'a'.repeat(20))).toBe(false);
    expect(isValidIdempotencyKey('valid\nprefix' + 'a'.repeat(20))).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidIdempotencyKey(null as unknown as string)).toBe(false);
    expect(isValidIdempotencyKey(undefined as unknown as string)).toBe(false);
    expect(isValidIdempotencyKey(123 as unknown as string)).toBe(false);
  });
});

describe('IDEMPOTENCY_KEY_HEADER', () => {
  it('is the canonical Stripe / IETF-draft header name', () => {
    expect(IDEMPOTENCY_KEY_HEADER).toBe('Idempotency-Key');
  });
});
