# @quilty/rate-limit

Rate limiter — sliding-window `RateLimiter` port + in-memory adapter (production wiring at M1.5; load-bearing for auth-adjacent paths) + DynamoDB adapter skeleton (typed-throwing until table provisioning + Lambda IAM grant).

## Architecture

Single hexagonal port: `RateLimiter.consume(key, policy) → Promise<RateLimitDecision>`. The limiter is invoked from the BFF (Route Handler / Server Action) before any auth-adjacent or abuse-prone path — login attempt, password reset request, signup, contact form, account-deletion confirmation.

Counting strategy is a **sliding-window log**: each consume call appends a timestamp; the window is pruned to entries within `[now - windowMs, now]` before counting. This avoids the traffic-doubling near a fixed-window flip and is simpler than token-bucket for the burst patterns of auth-adjacent endpoints. The DynamoDB adapter at activation uses conditional writes against a per-key item with a `timestamps` list attribute + a TTL attribute for automatic cleanup.

## Key composition discipline

The limiter does NOT classify keys. The call site composes the key from values the limiter MUST NOT see directly — typically `${action}:${remoteIp}` or `${action}:${user_id_hash}`. PHI must never be embedded in the key per D67; consumer Route Handlers compose keys from non-PHI identifiers (remote IP is fine; a raw email is not).

## Public API

```ts
import {
  // Port + types
  type RateLimiter,
  type RateLimitPolicy,
  type RateLimitDecision,
  // Adapters
  makeInMemoryRateLimiter,
  makeDynamoDbRateLimiter,
} from '@quilty/rate-limit';
```

## In-memory adapter (M1.5 production wiring)

`makeInMemoryRateLimiter({ now? })` is the production wiring at M1.5 — load-bearing for the auth-adjacent paths that will land in Wave 2. The per-key sliding-window log lives in module-scope state; cold-starts reset the counters (this is a safety property for auth flows, not a bug). The DynamoDB adapter at activation lifts the per-Lambda boundary to per-account.

Tests inject a fake clock via the `now` option to advance the window deterministically.

## DynamoDB adapter (skeleton)

`makeDynamoDbRateLimiter({ region, tableName })` constructs without error but `consume()` rejects on every call until two gates are green:

1. The `quilty_rate_limit` table is provisioned (with a TTL attribute for per-key auto-cleanup)
2. The Lambda execution role is granted `dynamodb:GetItem` + `PutItem` + `UpdateItem` against ONLY the rate-limit table (scope-of-least-privilege; no wildcard DynamoDB access)

## META-3 coverage target

The in-memory adapter is load-bearing for auth-adjacent paths. Coverage threshold is ≥95% / ≥90% (above the utility-package floor) per META-3.

## Tests

Run with `pnpm --filter @quilty/rate-limit test`.
