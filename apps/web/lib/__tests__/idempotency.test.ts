import { afterEach, describe, expect, it } from 'vitest';
import { __resetIdempotencyForTesting, claimIdempotent, storeIdempotent } from '../idempotency';

describe('lib/idempotency', () => {
  afterEach(() => {
    __resetIdempotencyForTesting();
  });

  it('returns null on first claim of a fresh key', () => {
    expect(claimIdempotent('unseen')).toBeNull();
  });

  it('returns the stored value on a subsequent claim within TTL', () => {
    const envelope = { ok: true, digest: 'q1m_abc' } as const;
    storeIdempotent('contact:uuid-1', envelope);
    const claimed = claimIdempotent<typeof envelope>('contact:uuid-1');
    expect(claimed).toEqual(envelope);
  });

  it('isolates keys (different IDs do not collide)', () => {
    storeIdempotent('contact:a', { ok: true, digest: 'a' });
    storeIdempotent('contact:b', { ok: false, reason: 'csrf' });
    const a = claimIdempotent<{ ok: true; digest: string }>('contact:a');
    const b = claimIdempotent<{ ok: false; reason: string }>('contact:b');
    expect(a?.digest).toBe('a');
    expect(b?.reason).toBe('csrf');
  });

  it('reset clears every claim', () => {
    storeIdempotent('contact:x', 'value');
    expect(claimIdempotent('contact:x')).toBe('value');
    __resetIdempotencyForTesting();
    expect(claimIdempotent('contact:x')).toBeNull();
  });
});
