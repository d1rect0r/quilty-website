import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInMemoryRateLimiter } from '../adapters/in-memory';

/**
 * Fake clock: caller-controlled `now()` function that the limiter
 * reads on every consume call. Each test advances the clock
 * deterministically to verify window semantics.
 */
function makeFakeClock(startMs: number) {
  let current = startMs;
  return {
    now: (): number => current,
    advance: (ms: number): void => {
      current += ms;
    },
    set: (ms: number): void => {
      current = ms;
    },
  };
}

describe('makeInMemoryRateLimiter', () => {
  const policy = { limit: 3, windowMs: 60_000 };

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first call (empty window)', async () => {
    const clock = makeFakeClock(1_000);
    const limiter = makeInMemoryRateLimiter({ now: clock.now });
    const result = await limiter.consume('signup:1.2.3.4', policy);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.remaining).toBe(2);
    }
  });

  it('counts down remaining over consecutive calls within the window', async () => {
    const clock = makeFakeClock(1_000);
    const limiter = makeInMemoryRateLimiter({ now: clock.now });
    const first = await limiter.consume('k', policy);
    const second = await limiter.consume('k', policy);
    const third = await limiter.consume('k', policy);
    expect(first.allowed && first.remaining).toBe(2);
    expect(second.allowed && second.remaining).toBe(1);
    expect(third.allowed && third.remaining).toBe(0);
  });

  it('throttles the call that exceeds the limit', async () => {
    const clock = makeFakeClock(1_000);
    const limiter = makeInMemoryRateLimiter({ now: clock.now });
    await limiter.consume('k', policy);
    await limiter.consume('k', policy);
    await limiter.consume('k', policy);
    const fourth = await limiter.consume('k', policy);
    expect(fourth.allowed).toBe(false);
    if (!fourth.allowed) {
      expect(fourth.remaining).toBe(0);
      expect(fourth.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('reports a sensible retryAfterMs (full window if all entries are at the same instant)', async () => {
    const clock = makeFakeClock(10_000);
    const limiter = makeInMemoryRateLimiter({ now: clock.now });
    await limiter.consume('k', policy);
    await limiter.consume('k', policy);
    await limiter.consume('k', policy);
    const fourth = await limiter.consume('k', policy);
    if (!fourth.allowed) {
      expect(fourth.retryAfterMs).toBe(policy.windowMs);
    }
  });

  it('prunes entries older than the window and allows a fresh call after the oldest expires', async () => {
    const clock = makeFakeClock(1_000);
    const limiter = makeInMemoryRateLimiter({ now: clock.now });
    await limiter.consume('k', policy);
    clock.advance(30_000);
    await limiter.consume('k', policy);
    clock.advance(15_000);
    await limiter.consume('k', policy);
    // 3 entries: at t=1000, t=31_000, t=46_000. Advance past the first
    // window boundary (t=61_000) so the t=1000 entry is pruned. The
    // window then holds 2 entries; a 4th call should be allowed.
    clock.advance(16_000);
    const fourth = await limiter.consume('k', policy);
    expect(fourth.allowed).toBe(true);
    if (fourth.allowed) {
      expect(fourth.remaining).toBe(0);
    }
  });

  it('throttles separately per key (signup vs password_reset)', async () => {
    const clock = makeFakeClock(1_000);
    const limiter = makeInMemoryRateLimiter({ now: clock.now });
    await limiter.consume('signup:1.2.3.4', policy);
    await limiter.consume('signup:1.2.3.4', policy);
    await limiter.consume('signup:1.2.3.4', policy);
    const sameKey = await limiter.consume('signup:1.2.3.4', policy);
    const otherKey = await limiter.consume('password_reset:1.2.3.4', policy);
    expect(sameKey.allowed).toBe(false);
    expect(otherKey.allowed).toBe(true);
  });

  it('throttles separately per IP (signup:1.2.3.4 vs signup:5.6.7.8)', async () => {
    const clock = makeFakeClock(1_000);
    const limiter = makeInMemoryRateLimiter({ now: clock.now });
    await limiter.consume('signup:1.2.3.4', policy);
    await limiter.consume('signup:1.2.3.4', policy);
    await limiter.consume('signup:1.2.3.4', policy);
    const ipA = await limiter.consume('signup:1.2.3.4', policy);
    const ipB = await limiter.consume('signup:5.6.7.8', policy);
    expect(ipA.allowed).toBe(false);
    expect(ipB.allowed).toBe(true);
  });

  it('reset() clears all per-key counters', async () => {
    const clock = makeFakeClock(1_000);
    const limiter = makeInMemoryRateLimiter({ now: clock.now });
    await limiter.consume('k', policy);
    await limiter.consume('k', policy);
    await limiter.consume('k', policy);
    limiter.reset();
    const result = await limiter.consume('k', policy);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.remaining).toBe(2);
    }
  });

  it('respects different policies on the same key independently of state', async () => {
    // The same key called with a more permissive policy should not
    // be throttled by entries from a tighter policy (the limiter is
    // policy-agnostic — the limit field is read fresh on every call).
    const clock = makeFakeClock(1_000);
    const limiter = makeInMemoryRateLimiter({ now: clock.now });
    const tight = { limit: 1, windowMs: 60_000 };
    const loose = { limit: 10, windowMs: 60_000 };
    await limiter.consume('k', tight);
    const second = await limiter.consume('k', loose);
    expect(second.allowed).toBe(true);
  });

  it('defaults to Date.now() when no clock is injected', async () => {
    const limiter = makeInMemoryRateLimiter();
    const result = await limiter.consume('k', policy);
    expect(result.allowed).toBe(true);
  });

  it('produces a resetAtMs on allowed calls equal to oldest-entry + windowMs', async () => {
    const clock = makeFakeClock(50_000);
    const limiter = makeInMemoryRateLimiter({ now: clock.now });
    const first = await limiter.consume('k', policy);
    expect(first.allowed && first.resetAtMs).toBe(50_000 + policy.windowMs);
  });
});
