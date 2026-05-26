/**
 * In-memory ApiClient adapter — the test fake.
 *
 * Per META-1 / ADR-0014: every port ships an in-memory adapter for
 * unit + contract testing. The shape mirrors `makeFetchApiClient()`
 * but routes requests through a caller-supplied `handler` function
 * instead of a network round trip.
 *
 * Tests use it like:
 *
 *   const client = makeInMemoryApiClient({
 *     handler: async (req) => {
 *       if (req.path === '/v1/health') return { status: 200, body: { ok: true } };
 *       throw new ApiHttpError({ status: 404, message: 'Not Found' });
 *     },
 *   });
 */

import type { ApiClient, ApiRequest, ApiResponse } from '../ports';

export interface InMemoryHandlerResult<TBody> {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: TBody;
  readonly correlationId?: string;
}

export type InMemoryHandler = <TBody = unknown>(
  request: ApiRequest,
) => Promise<InMemoryHandlerResult<TBody>>;

export interface InMemoryApiClientOptions {
  readonly handler: InMemoryHandler;
  /**
   * Optional recorder — every request that flows through the handler
   * is appended. Tests assert against this to verify retry attempts,
   * traceparent injection, and idempotency-key forwarding.
   */
  readonly recordedRequests?: ApiRequest[];
}

export function makeInMemoryApiClient(options: InMemoryApiClientOptions): ApiClient {
  return {
    async request<TBody = unknown>(input: ApiRequest): Promise<ApiResponse<TBody>> {
      options.recordedRequests?.push(input);
      const result = await options.handler<TBody>(input);
      return {
        status: result.status,
        headers: result.headers ?? {},
        body: result.body,
        correlationId: result.correlationId,
      };
    },
  };
}
