import { describe, expect, it } from 'vitest';
import { makeRenderTimestamp, verifyTimeTrap } from '../domain/time-trap';

describe('makeRenderTimestamp', () => {
  it('returns a base64url string that decodes to JSON with a numeric `t`', () => {
    const token = makeRenderTimestamp();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded) as { t: number };
    expect(typeof parsed.t).toBe('number');
    expect(parsed.t).toBeGreaterThan(0);
  });

  it('encodes the current time (within a 5s tolerance)', () => {
    const before = Date.now();
    const token = makeRenderTimestamp();
    const after = Date.now();
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8')) as { t: number };
    expect(decoded.t).toBeGreaterThanOrEqual(before);
    expect(decoded.t).toBeLessThanOrEqual(after + 5000);
  });
});

describe('verifyTimeTrap', () => {
  function tokenFor(tMs: number): string {
    return Buffer.from(JSON.stringify({ t: tMs }), 'utf-8').toString('base64url');
  }

  it('accepts a submission ≥ minimumMs after render (default 1500 ms)', () => {
    const rendered = 1_000_000_000;
    const submitted = rendered + 1500;
    const result = verifyTimeTrap({ token: tokenFor(rendered), submittedAtMs: submitted });
    expect(result.ok).toBe(true);
  });

  it('rejects with time_too_fast when elapsed < minimumMs', () => {
    const rendered = 1_000_000_000;
    const submitted = rendered + 100;
    const result = verifyTimeTrap({ token: tokenFor(rendered), submittedAtMs: submitted });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'time_too_fast') {
      expect(result.error.elapsedMs).toBe(100);
    } else {
      expect.fail('expected time_too_fast kind');
    }
  });

  it('rejects with time_too_slow when elapsed > maximumMs (30min default)', () => {
    const rendered = 1_000_000_000;
    const submitted = rendered + 31 * 60 * 1000;
    const result = verifyTimeTrap({ token: tokenFor(rendered), submittedAtMs: submitted });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('time_too_slow');
      if (result.error.kind === 'time_too_slow') {
        expect(result.error.maximumMs).toBe(30 * 60 * 1000);
      }
    }
  });

  it('rejects malformed tokens with kind=malformed_token (distinct from time_too_fast)', () => {
    const result = verifyTimeTrap({
      token: 'not-a-valid-token',
      submittedAtMs: Date.now(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('malformed_token');
  });

  it('rejects tokens whose JSON lacks a numeric `t` field as malformed_token', () => {
    const malformed = Buffer.from(JSON.stringify({ x: 1 }), 'utf-8').toString('base64url');
    const result = verifyTimeTrap({ token: malformed, submittedAtMs: Date.now() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('malformed_token');
  });

  it('respects custom minimumMs override', () => {
    const rendered = 1_000_000_000;
    const submitted = rendered + 500;
    const result = verifyTimeTrap({
      token: tokenFor(rendered),
      submittedAtMs: submitted,
      minimumMs: 300,
    });
    expect(result.ok).toBe(true);
  });
});
