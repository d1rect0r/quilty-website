/**
 * DynamoDB adapter tests against a hand-rolled in-memory table fake that
 * honors the exact contract the adapter depends on: consistent reads,
 * `attribute_not_exists(pk) OR version = :readVersion` conditional writes,
 * and ConditionalCheckFailedException on a lost race. Faking the table (not
 * the SDK transport) keeps the tests about the ALGORITHM — the bounded
 * sliding window, the read-only deny path, optimistic-retry, fail-open.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeDynamoDbRateLimiter, type RateLimitTableClient } from '../adapters/dynamodb';
import type {
  AttributeValue,
  GetItemCommandInput,
  GetItemCommandOutput,
  UpdateItemCommandInput,
  UpdateItemCommandOutput,
} from '@aws-sdk/client-dynamodb';

interface FakeTable {
  readonly client: RateLimitTableClient;
  readonly items: Map<string, Record<string, AttributeValue>>;
  readonly calls: { getItem: number; updateItem: number };
  /** When set, the next N updateItem calls throw ConditionalCheckFailed. */
  failNextUpdates: number;
  /** When set, every call throws this error (infra-outage simulation). */
  outage: Error | null;
}

function conditionalCheckFailed(): Error {
  const err = new Error('The conditional request failed');
  err.name = 'ConditionalCheckFailedException';
  return err;
}

function makeFakeTable(): FakeTable {
  const items = new Map<string, Record<string, AttributeValue>>();
  const calls = { getItem: 0, updateItem: 0 };
  const table: FakeTable = {
    items,
    calls,
    failNextUpdates: 0,
    outage: null,
    client: {
      getItem: (input: GetItemCommandInput): Promise<GetItemCommandOutput> => {
        if (table.outage) return Promise.reject(table.outage);
        calls.getItem += 1;
        const pk = input.Key?.['pk']?.S ?? '';
        const item = items.get(pk);
        return Promise.resolve({
          $metadata: {},
          ...(item !== undefined ? { Item: item } : {}),
        });
      },
      updateItem: (input: UpdateItemCommandInput): Promise<UpdateItemCommandOutput> => {
        if (table.outage) return Promise.reject(table.outage);
        calls.updateItem += 1;
        if (table.failNextUpdates > 0) {
          table.failNextUpdates -= 1;
          return Promise.reject(conditionalCheckFailed());
        }
        const pk = input.Key?.['pk']?.S ?? '';
        const existing = items.get(pk);
        const readVersion = Number(input.ExpressionAttributeValues?.[':readVersion']?.N ?? '0');
        const currentVersion = Number(existing?.['version']?.N ?? '0');
        // Enforce the adapter's own ConditionExpression semantics.
        if (existing !== undefined && currentVersion !== readVersion) {
          return Promise.reject(conditionalCheckFailed());
        }
        items.set(pk, {
          pk: { S: pk },
          timestamps: input.ExpressionAttributeValues?.[':list'] ?? { L: [] },
          version: input.ExpressionAttributeValues?.[':nextVersion'] ?? { N: '1' },
          ttl: input.ExpressionAttributeValues?.[':ttl'] ?? { N: '0' },
        });
        return Promise.resolve({ $metadata: {} });
      },
    },
  };
  return table;
}

function makeLimiter(table: FakeTable, nowRef: { value: number }) {
  return makeDynamoDbRateLimiter({
    region: 'us-east-1',
    tableName: 'quilty-marketing-prod-web-rate-limit',
    client: table.client,
    now: () => nowRef.value,
    onFailOpen: vi.fn(),
  });
}

const POLICY = { limit: 3, windowMs: 60_000 };

describe('makeDynamoDbRateLimiter — sliding window', () => {
  it('allows up to the limit, then denies with retryAfterMs', async () => {
    const table = makeFakeTable();
    const now = { value: 1_000_000 };
    const limiter = makeLimiter(table, now);

    for (let i = 0; i < POLICY.limit; i++) {
      const d = await limiter.consume('contact:ip-1', POLICY);
      expect(d.allowed).toBe(true);
      now.value += 1_000;
    }
    const denied = await limiter.consume('contact:ip-1', POLICY);
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      // Oldest hit at 1_000_000 → window resets at 1_060_000; now is 1_003_000.
      expect(denied.resetAtMs).toBe(1_060_000);
      expect(denied.retryAfterMs).toBe(57_000);
    }
  });

  it('re-admits once the oldest entry exits the window', async () => {
    const table = makeFakeTable();
    const now = { value: 1_000_000 };
    const limiter = makeLimiter(table, now);

    for (let i = 0; i < POLICY.limit; i++) {
      await limiter.consume('k', POLICY);
      now.value += 1_000;
    }
    expect((await limiter.consume('k', POLICY)).allowed).toBe(false);
    now.value = 1_000_000 + POLICY.windowMs + 1;
    expect((await limiter.consume('k', POLICY)).allowed).toBe(true);
  });

  it('keys are independent', async () => {
    const table = makeFakeTable();
    const now = { value: 1_000_000 };
    const limiter = makeLimiter(table, now);
    for (let i = 0; i < POLICY.limit; i++) await limiter.consume('a', POLICY);
    expect((await limiter.consume('a', POLICY)).allowed).toBe(false);
    expect((await limiter.consume('b', POLICY)).allowed).toBe(true);
  });

  it('the deny path is READ-ONLY — an over-limit key generates zero writes', async () => {
    const table = makeFakeTable();
    const now = { value: 1_000_000 };
    const limiter = makeLimiter(table, now);
    for (let i = 0; i < POLICY.limit; i++) await limiter.consume('k', POLICY);
    const writesAtLimit = table.calls.updateItem;
    for (let i = 0; i < 25; i++) {
      expect((await limiter.consume('k', POLICY)).allowed).toBe(false);
    }
    expect(table.calls.updateItem).toBe(writesAtLimit);
  });

  it('the stored list never exceeds the policy limit (bounded item)', async () => {
    const table = makeFakeTable();
    const now = { value: 1_000_000 };
    const limiter = makeLimiter(table, now);
    // Fill, expire, refill repeatedly — the item must stay bounded.
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < POLICY.limit + 5; i++) {
        await limiter.consume('k', POLICY);
        now.value += 500;
      }
      now.value += POLICY.windowMs;
    }
    const stored = table.items.get('k')?.['timestamps']?.L ?? [];
    expect(stored.length).toBeLessThanOrEqual(POLICY.limit);
  });

  it('retries once on a lost optimistic race, then succeeds', async () => {
    const table = makeFakeTable();
    const now = { value: 1_000_000 };
    const limiter = makeLimiter(table, now);
    table.failNextUpdates = 1;
    const d = await limiter.consume('k', POLICY);
    expect(d.allowed).toBe(true);
    expect(table.calls.updateItem).toBe(2);
  });

  it('denies with a short retry when BOTH optimistic attempts lose (hot key)', async () => {
    const table = makeFakeTable();
    const now = { value: 1_000_000 };
    const limiter = makeLimiter(table, now);
    table.failNextUpdates = 2;
    const d = await limiter.consume('k', POLICY);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.retryAfterMs).toBe(1_000);
  });

  it('fails OPEN (allowed, zero advertised headroom) on infrastructure errors', async () => {
    const table = makeFakeTable();
    const now = { value: 1_000_000 };
    let warned = 0;
    const limiter = makeDynamoDbRateLimiter({
      region: 'us-east-1',
      tableName: 't',
      client: table.client,
      now: () => now.value,
      onFailOpen: () => {
        warned += 1;
      },
    });
    const outage = new Error('throttled');
    outage.name = 'ProvisionedThroughputExceededException';
    table.outage = outage;
    const d1 = await limiter.consume('k', POLICY);
    const d2 = await limiter.consume('k', POLICY);
    expect(d1.allowed).toBe(true);
    expect(d1.remaining).toBe(0);
    expect(d2.allowed).toBe(true);
    // One structured warning per instance, not per request.
    expect(warned).toBe(1);
  });

  it('a TTL-reaped item (absent at write time) is recreated cleanly', async () => {
    const table = makeFakeTable();
    const now = { value: 1_000_000 };
    const limiter = makeLimiter(table, now);
    await limiter.consume('k', POLICY);
    table.items.delete('k'); // simulate the TTL reaper between cycles
    const d = await limiter.consume('k', POLICY);
    expect(d.allowed).toBe(true);
    expect(Number(table.items.get('k')?.['version']?.N)).toBeGreaterThanOrEqual(1);
  });
});
