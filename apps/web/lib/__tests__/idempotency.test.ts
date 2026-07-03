import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetIdempotencyForTesting,
  claimIdempotent,
  storeIdempotent,
  IdempotencyUnavailableError,
  type IdempotencyTableClient,
} from '../idempotency';
import type {
  AttributeValue,
  GetItemCommandInput,
  GetItemCommandOutput,
  PutItemCommandInput,
  PutItemCommandOutput,
  UpdateItemCommandInput,
  UpdateItemCommandOutput,
} from '@aws-sdk/client-dynamodb';

afterEach(() => {
  vi.unstubAllEnvs();
  __resetIdempotencyForTesting();
});

describe('lib/idempotency — in-memory backend (two-phase)', () => {
  it('grants a fresh claim once, then reports inflight until stored', async () => {
    expect(await claimIdempotent('k')).toEqual({ state: 'fresh' });
    expect(await claimIdempotent('k')).toEqual({ state: 'inflight' });
  });

  it('returns the stored envelope on a claim after store', async () => {
    const envelope = { ok: true, digest: 'q1m_abc' } as const;
    await claimIdempotent('contact:uuid-1');
    await storeIdempotent('contact:uuid-1', envelope);
    const claimed = await claimIdempotent<typeof envelope>('contact:uuid-1');
    expect(claimed).toEqual({ state: 'cached', value: envelope });
  });

  it('isolates keys (different IDs do not collide)', async () => {
    await storeIdempotent('contact:a', { ok: true, digest: 'a' });
    await storeIdempotent('contact:b', { ok: false, reason: 'csrf' });
    const a = await claimIdempotent<{ ok: true; digest: string }>('contact:a');
    const b = await claimIdempotent<{ ok: false; reason: string }>('contact:b');
    expect(a).toEqual({ state: 'cached', value: { ok: true, digest: 'a' } });
    expect(b).toEqual({ state: 'cached', value: { ok: false, reason: 'csrf' } });
  });

  it('reset clears every claim', async () => {
    await storeIdempotent('contact:x', 'value');
    expect(await claimIdempotent('contact:x')).toEqual({ state: 'cached', value: 'value' });
    __resetIdempotencyForTesting();
    expect(await claimIdempotent('contact:x')).toEqual({ state: 'fresh' });
  });
});

describe('lib/idempotency — DynamoDB backend (QUILTY_IDEMPOTENCY_TABLE set)', () => {
  interface FakeTable {
    readonly client: IdempotencyTableClient;
    readonly items: Map<string, Record<string, AttributeValue>>;
    outage: Error | null;
  }

  function conditionalCheckFailed(): Error {
    const err = new Error('The conditional request failed');
    err.name = 'ConditionalCheckFailedException';
    return err;
  }

  function makeFakeTable(): FakeTable {
    const items = new Map<string, Record<string, AttributeValue>>();
    const table: FakeTable = {
      items,
      outage: null,
      client: {
        putItem: (input: PutItemCommandInput): Promise<PutItemCommandOutput> => {
          if (table.outage) return Promise.reject(table.outage);
          const pk = input.Item?.['pk']?.S ?? '';
          const existing = items.get(pk);
          const nowSec = Number(input.ExpressionAttributeValues?.[':nowSec']?.N ?? '0');
          const existingTtl = Number(existing?.['ttl']?.N ?? '0');
          // Enforce: attribute_not_exists(pk) OR #ttl < :nowSec
          if (existing !== undefined && existingTtl >= nowSec) {
            return Promise.reject(conditionalCheckFailed());
          }
          items.set(pk, input.Item as Record<string, AttributeValue>);
          return Promise.resolve({ $metadata: {} });
        },
        getItem: (input: GetItemCommandInput): Promise<GetItemCommandOutput> => {
          if (table.outage) return Promise.reject(table.outage);
          const pk = input.Key?.['pk']?.S ?? '';
          const item = items.get(pk);
          return Promise.resolve({
            $metadata: {},
            ...(item !== undefined ? { Item: item } : {}),
          });
        },
        updateItem: (input: UpdateItemCommandInput): Promise<UpdateItemCommandOutput> => {
          if (table.outage) return Promise.reject(table.outage);
          const pk = input.Key?.['pk']?.S ?? '';
          items.set(pk, {
            pk: { S: pk },
            state: input.ExpressionAttributeValues?.[':done'] ?? { S: 'done' },
            value: input.ExpressionAttributeValues?.[':value'] ?? { S: 'null' },
            ttl: input.ExpressionAttributeValues?.[':ttl'] ?? { N: '0' },
          });
          return Promise.resolve({ $metadata: {} });
        },
      },
    };
    return table;
  }

  function activate(table: FakeTable): void {
    vi.stubEnv('QUILTY_IDEMPOTENCY_TABLE', 'quilty-marketing-prod-web-idempotency');
    __resetIdempotencyForTesting(table.client);
  }

  it('two-phase: fresh once, inflight while unstored, cached after store', async () => {
    const table = makeFakeTable();
    activate(table);
    expect(await claimIdempotent('k')).toEqual({ state: 'fresh' });
    expect(await claimIdempotent('k')).toEqual({ state: 'inflight' });
    await storeIdempotent('k', { ok: true, digest: 'd' });
    expect(await claimIdempotent('k')).toEqual({
      state: 'cached',
      value: { ok: true, digest: 'd' },
    });
  });

  it('a concurrent duplicate race yields exactly one fresh claim', async () => {
    const table = makeFakeTable();
    activate(table);
    const [a, b] = await Promise.all([claimIdempotent('race'), claimIdempotent('race')]);
    const states = [a.state, b.state].sort();
    expect(states).toEqual(['fresh', 'inflight']);
  });

  it('reclaims an expired-but-unreaped inflight marker (TTL lag)', async () => {
    const table = makeFakeTable();
    activate(table);
    table.items.set('k', {
      pk: { S: 'k' },
      state: { S: 'inflight' },
      // Expired 100s ago but the TTL reaper has not deleted it yet.
      ttl: { N: String(Math.floor(Date.now() / 1000) - 100) },
    });
    expect(await claimIdempotent('k')).toEqual({ state: 'fresh' });
  });

  it('the CLAIM fails CLOSED on infrastructure errors', async () => {
    const table = makeFakeTable();
    activate(table);
    const outage = new Error('down');
    outage.name = 'InternalServerError';
    table.outage = outage;
    await expect(claimIdempotent('k')).rejects.toBeInstanceOf(IdempotencyUnavailableError);
  });

  it('the STORE is best-effort on infrastructure errors (warn, no throw)', async () => {
    const table = makeFakeTable();
    activate(table);
    await claimIdempotent('k');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const outage = new Error('down');
    outage.name = 'InternalServerError';
    table.outage = outage;
    await expect(storeIdempotent('k', { ok: true })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
