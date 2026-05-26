import { describe, expect, it, vi } from 'vitest';
import { makeFetchApiClient } from '../src/adapters/fetch';
import { makeInMemoryApiClient } from '../src/adapters/in-memory';
import { makeNoOpCircuitBreaker } from '../src/adapters/circuit-breaker-noop';
import {
  ApiAbortedError,
  ApiHttpError,
  ApiNetworkError,
  ApiProblemError,
  ApiRetryBudgetExhaustedError,
  isApiClientError,
} from '../src/errors';
import { makeNoRetryPolicy } from '../src/domain/retry';
import { PROBLEM_TYPES } from '../src/domain/problem-types';
import type { ApiClient, ApiRequest } from '../src/ports';

const ADAPTERS: { name: string; make: () => { client: ApiClient; recorder?: ApiRequest[] } }[] = [
  {
    name: 'makeInMemoryApiClient',
    make: () => {
      const recorder: ApiRequest[] = [];
      const client = makeInMemoryApiClient({
        handler: async (req) => {
          recorder.push(req);
          if (req.path === '/v1/ok') return { status: 200, body: { hello: 'world' } };
          if (req.path === '/v1/empty') return { status: 204, body: undefined };
          throw new ApiHttpError({ status: 404, message: 'Not Found' });
        },
        recordedRequests: recorder,
      });
      return { client, recorder };
    },
  },
  {
    name: 'makeFetchApiClient (stubbed fetch)',
    make: () => {
      const fetchStub: typeof globalThis.fetch = vi.fn(async (url) => {
        const path = new URL(url as string).pathname;
        if (path === '/v1/ok') {
          return new Response(JSON.stringify({ hello: 'world' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (path === '/v1/empty') {
          return new Response(null, { status: 204 });
        }
        return new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        });
      });
      const client = makeFetchApiClient({
        baseUrl: 'https://api.test',
        circuitBreaker: makeNoOpCircuitBreaker(),
        fetchImpl: fetchStub,
      });
      return { client };
    },
  },
];

describe.each(ADAPTERS)('ApiClient contract — $name', ({ make }) => {
  it('returns 200 body on happy path', async () => {
    const { client } = make();
    const response = await client.request<{ hello: string }>({ method: 'GET', path: '/v1/ok' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ hello: 'world' });
  });

  it('returns 204 with undefined body', async () => {
    const { client } = make();
    const response = await client.request({ method: 'GET', path: '/v1/empty' });
    expect(response.status).toBe(204);
    expect(response.body).toBeUndefined();
  });

  it('throws ApiHttpError on 4xx without problem+json', async () => {
    const { client } = make();
    await expect(
      client.request({ method: 'GET', path: '/v1/missing', retryPolicy: makeNoRetryPolicy() }),
    ).rejects.toThrow(ApiHttpError);
  });
});

describe('makeFetchApiClient — adapter-specific behavior', () => {
  it('throws on baseUrl ending with /', () => {
    expect(() =>
      makeFetchApiClient({
        baseUrl: 'https://api.test/',
        circuitBreaker: makeNoOpCircuitBreaker(),
      }),
    ).toThrow(/baseUrl/);
  });

  it('injects Idempotency-Key header when supplied', async () => {
    const captured: Headers[] = [];
    const fetchStub: typeof globalThis.fetch = vi.fn(async (_url, init) => {
      captured.push(new Headers(init?.headers));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = makeFetchApiClient({
      baseUrl: 'https://api.test',
      circuitBreaker: makeNoOpCircuitBreaker(),
      fetchImpl: fetchStub,
    });
    await client.request({
      method: 'POST',
      path: '/v1/anything',
      idempotencyKey: '01904c8a-3a7b-7c34-8e6c-5e2a1d3b4f8e',
      body: { foo: 'bar' },
    });
    expect(captured[0]?.get('Idempotency-Key')).toBe('01904c8a-3a7b-7c34-8e6c-5e2a1d3b4f8e');
  });

  it('parses RFC 9457 problem+json responses into ApiProblemError', async () => {
    const fetchStub: typeof globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          type: PROBLEM_TYPES.validation,
          title: 'Validation Failed',
          status: 400,
          detail: 'Email field is invalid',
          field_errors: { email: 'invalid' },
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/problem+json' },
        },
      );
    });
    const client = makeFetchApiClient({
      baseUrl: 'https://api.test',
      circuitBreaker: makeNoOpCircuitBreaker(),
      fetchImpl: fetchStub,
    });
    try {
      await client.request({ method: 'GET', path: '/v1/x', retryPolicy: makeNoRetryPolicy() });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiProblemError);
      expect(isApiClientError(err)).toBe(true);
      const e = err as ApiProblemError;
      expect(e.problem.slug).toBe('validation');
      expect(e.problem.status).toBe(400);
      expect(e.problem.extensions.field_errors).toEqual({ email: 'invalid' });
    }
  });

  it('retries idempotent GET on transient 503 with full-jitter backoff', async () => {
    let attempts = 0;
    const fetchStub: typeof globalThis.fetch = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response('busy', { status: 503 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = makeFetchApiClient({
      baseUrl: 'https://api.test',
      circuitBreaker: makeNoOpCircuitBreaker(),
      fetchImpl: fetchStub,
    });
    const response = await client.request<{ ok: boolean }>({ method: 'GET', path: '/v1/flaky' });
    expect(response.status).toBe(200);
    expect(attempts).toBe(3);
  });

  it('does NOT retry POST without Idempotency-Key', async () => {
    let attempts = 0;
    const fetchStub: typeof globalThis.fetch = vi.fn(async () => {
      attempts += 1;
      return new Response('busy', { status: 503 });
    });
    const client = makeFetchApiClient({
      baseUrl: 'https://api.test',
      circuitBreaker: makeNoOpCircuitBreaker(),
      fetchImpl: fetchStub,
    });
    await expect(
      client.request({ method: 'POST', path: '/v1/mutate', body: { x: 1 } }),
    ).rejects.toThrow(ApiHttpError);
    expect(attempts).toBe(1);
  });

  it('retries POST with Idempotency-Key', async () => {
    let attempts = 0;
    const fetchStub: typeof globalThis.fetch = vi.fn(async () => {
      attempts += 1;
      if (attempts < 2) return new Response('busy', { status: 503 });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = makeFetchApiClient({
      baseUrl: 'https://api.test',
      circuitBreaker: makeNoOpCircuitBreaker(),
      fetchImpl: fetchStub,
    });
    const response = await client.request({
      method: 'POST',
      path: '/v1/mutate',
      idempotencyKey: '01904c8a-3a7b-7c34-8e6c-5e2a1d3b4f8e',
      body: { x: 1 },
    });
    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it('translates TypeError into ApiNetworkError', async () => {
    const fetchStub: typeof globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const client = makeFetchApiClient({
      baseUrl: 'https://api.test',
      circuitBreaker: makeNoOpCircuitBreaker(),
      fetchImpl: fetchStub,
    });
    await expect(
      client.request({ method: 'GET', path: '/v1/anything', retryPolicy: makeNoRetryPolicy() }),
    ).rejects.toThrow(ApiNetworkError);
  });

  it('translates caller AbortSignal into ApiAbortedError', async () => {
    const controller = new AbortController();
    const fetchStub: typeof globalThis.fetch = vi.fn(async (_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new DOMException('aborted', 'AbortError');
          reject(err);
        });
      });
    });
    const client = makeFetchApiClient({
      baseUrl: 'https://api.test',
      circuitBreaker: makeNoOpCircuitBreaker(),
      fetchImpl: fetchStub,
    });
    const promise = client.request({
      method: 'GET',
      path: '/v1/slow',
      signal: controller.signal,
      retryPolicy: makeNoRetryPolicy(),
    });
    controller.abort();
    await expect(promise).rejects.toThrow(ApiAbortedError);
  });

  it('exhausts retry budget on persistent 503 and throws ApiRetryBudgetExhaustedError', async () => {
    const fetchStub: typeof globalThis.fetch = vi.fn(
      async () => new Response('busy', { status: 503 }),
    );
    const client = makeFetchApiClient({
      baseUrl: 'https://api.test',
      circuitBreaker: makeNoOpCircuitBreaker(),
      fetchImpl: fetchStub,
    });
    await expect(client.request({ method: 'GET', path: '/v1/always-busy' })).rejects.toThrow(
      ApiRetryBudgetExhaustedError,
    );
  });

  it('fires onRetry callback at attempt ≥ 1', async () => {
    let calls = 0;
    const fetchStub: typeof globalThis.fetch = vi.fn(
      async () => new Response('x', { status: 503 }),
    );
    const client = makeFetchApiClient({
      baseUrl: 'https://api.test',
      circuitBreaker: makeNoOpCircuitBreaker(),
      fetchImpl: fetchStub,
      onRetry: () => {
        calls += 1;
      },
    });
    try {
      await client.request({ method: 'GET', path: '/v1/flaky' });
    } catch {
      /* expected */
    }
    // 3 attempts: attempt 0 fires no callback; attempts 1 + 2 do.
    expect(calls).toBe(2);
  });
});

describe('makeNoOpCircuitBreaker', () => {
  it('passes through every call', async () => {
    const breaker = makeNoOpCircuitBreaker();
    const result = await breaker.protect(async () => 42);
    expect(result).toBe(42);
  });

  it('forwards inner errors unchanged', async () => {
    const breaker = makeNoOpCircuitBreaker();
    const err = new Error('inner');
    await expect(breaker.protect(async () => Promise.reject(err))).rejects.toBe(err);
  });
});
