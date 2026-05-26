# @quilty/api-client

Typed HTTP client + retry + circuit-breaker + RFC 9457 Problem Details parser + W3C `traceparent` injection. Composed at the website BFF composition roots (server + edge) for every outbound Rust-backend call.

**ADR:** [ADR-0017](../../docs/adr/0017-http-client-and-resilience.md). **Data model:** [ADR-0016](../../docs/adr/0016-dynamodb-data-model-policy.md) for the Idempotency-Key cache shape.

## Public API

| Surface                     | Adapters                                      | Notes                                                                                                                                             |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiClient`                 | `fetch` + `in-memory`                         | Generic request/response port. Vendor-agnostic. Native `fetch()` under the hood; openapi-fetch optional at call sites for typed-route ergonomics. |
| `CircuitBreaker`            | `no-op` + `opossum` _(skeleton)_              | No-op is the M1.6 default (zero runtime cost). Opossum activates at M4 trigger per ADR-0017 Decision D.                                           |
| `RetryPolicy`               | `default` (exp backoff + jitter) + `no-retry` | Stripe-canon: idempotent-only retries; POST + Idempotency-Key gates retry; transient HTTP 408/429/5xx + network errors retried.                   |
| `ProblemDetails` parser     | Pure functions                                | RFC 9457 canonical + Rust-backend wrapper shape both supported. Pre-cache type registry as build-time JSON.                                       |
| `Idempotency-Key` generator | UUIDv7 via `uuid`                             | IETF RFC 9562. Header name `Idempotency-Key` per IETF draft + Stripe canon.                                                                       |
| `traceparent` injection     | `@opentelemetry/api`                          | W3C Trace Context format `00-{traceId}-{spanId}-{flags}`. Auto-injected when an active span is in scope.                                          |

## Typed-error union

Every adapter translates vendor errors into ONE of:

- `ApiNetworkError` — DNS / TCP / fetch-level failure
- `ApiTimeoutError` — per-attempt timeout fired
- `ApiAbortedError` — caller AbortSignal
- `ApiHttpError` — 4xx/5xx without problem+json
- `ApiProblemError` — 4xx/5xx with RFC 9457 body
- `ApiParseError` — malformed JSON body
- `ApiCircuitOpenError` — circuit-breaker fast-fail (M4+)
- `ApiRetryBudgetExhaustedError` — retry budget exhausted

All extend `ApiClientError`; consumers narrow via `error.code` literal union or `instanceof`.

## Composition (server + edge)

```ts
import { makeFetchApiClient, makeNoOpCircuitBreaker } from '@quilty/api-client';

const apiClient = makeFetchApiClient({
  baseUrl: process.env.API_BASE_URL!, // NO trailing slash
  circuitBreaker: makeNoOpCircuitBreaker(),
  onRetry: (attempt) => {
    if (attempt >= 2) toast.info('Reconnecting…');
  },
});
```

## Testing

```ts
import { makeInMemoryApiClient } from '@quilty/api-client/testing';

const client = makeInMemoryApiClient({
  handler: async (req) => {
    if (req.path === '/v1/health') return { status: 200, body: { ok: true } };
    throw new ApiHttpError({ status: 404, message: 'Not Found' });
  },
});
```

Contract test (`__tests__/api-client.contract.test.ts`) parameterizes over both `makeFetchApiClient` (stubbed) and `makeInMemoryApiClient` — adapter swap is verified behaviour-preserving.
