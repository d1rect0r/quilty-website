import { describe, expect, it, vi } from 'vitest';
import { makeTurnstileCaptchaVerifier } from '../adapters/turnstile';

const CTX = { action: 'contact_form', remoteIp: '203.0.113.42' } as const;

/**
 * Test fakes use `vi.fn().mockResolvedValue(...)` rather than an
 * `as unknown as typeof fetch` cast — Vitest's mock function type is
 * structurally compatible with `typeof fetch`, so we avoid the
 * double-cast escape hatch that hides a contract break if the
 * adapter ever starts passing arguments the fake doesn't model.
 */

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('makeTurnstileCaptchaVerifier', () => {
  it('throws on construction when secretKey is empty', () => {
    expect(() => makeTurnstileCaptchaVerifier({ secretKey: '' })).toThrow(/secret/i);
  });

  it('returns { ok: true } when siteverify reports success', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ success: true, hostname: 'my-quilty.com', action: 'contact_form' }),
      );
    const verifier = makeTurnstileCaptchaVerifier({ secretKey: 'k', fetchImpl });
    const out = await verifier.verify('client-token', CTX);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.hostname).toBe('my-quilty.com');
      expect(out.action).toBe('contact_form');
    }
  });

  it('returns { ok: false, reason: <first-error-code> } when Cloudflare rejects', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: false,
        'error-codes': ['invalid-input-response', 'timeout-or-duplicate'],
      }),
    );
    const verifier = makeTurnstileCaptchaVerifier({ secretKey: 'k', fetchImpl });
    const out = await verifier.verify('bad-token', CTX);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('invalid-input-response');
  });

  it('returns { ok: false, reason: http_<status> } when siteverify returns non-2xx', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
    const verifier = makeTurnstileCaptchaVerifier({ secretKey: 'k', fetchImpl });
    const out = await verifier.verify('t', CTX);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('http_503');
  });

  it('returns { ok: false, reason: timeout } when the fetch aborts', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          (init as { signal?: AbortSignal } | undefined)?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const verifier = makeTurnstileCaptchaVerifier({
      secretKey: 'k',
      fetchImpl,
      timeoutMs: 5,
    });
    const out = await verifier.verify('t', CTX);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('timeout');
  });

  it('returns { ok: false, reason: fetch_failed } on a generic network error', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('econnreset'));
    const verifier = makeTurnstileCaptchaVerifier({ secretKey: 'k', fetchImpl });
    const out = await verifier.verify('t', CTX);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('fetch_failed');
  });

  it('sends secret + response + remoteip in the form-encoded body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ success: true }));
    const verifier = makeTurnstileCaptchaVerifier({ secretKey: 'sek', fetchImpl });
    await verifier.verify('tok', CTX);
    const init = fetchImpl.mock.calls[0]?.[1];
    // Instance check BEFORE the cast — if the adapter ever switches
    // to JSON / FormData, the cast would silently still pass and the
    // .get() assertions would produce `undefined` rather than a
    // shape-shift failure. The instanceof check forces a clean test
    // failure if the body shape changes.
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    const params = init?.body as URLSearchParams;
    expect(params.get('secret')).toBe('sek');
    expect(params.get('response')).toBe('tok');
    expect(params.get('remoteip')).toBe('203.0.113.42');
  });
});
