/**
 * Idempotency-key store (D113 — 8th piece of the canonical form pattern).
 *
 * Stripe / Discord / Linear convention: clients mint a `crypto.randomUUID()`
 * idempotency key at form mount, send it with every retry, the server claims
 * the key before running the handler. Duplicate submissions (network retry,
 * double-click, page-reload-after-submit) return the cached envelope without
 * re-running the handler.
 *
 * TWO-PHASE claim (the Powertools/Stripe shape, NOT check-then-store): the
 * claim atomically writes an in-progress marker — the loser of a concurrent
 * race sees `inflight` instead of both racers passing a pre-check and both
 * sending email. `storeIdempotent` then upgrades the marker to the result
 * envelope. Claim states:
 *
 *   - `fresh`    — this request owns the key; run the handler, then store.
 *   - `cached`   — a completed envelope exists; return it verbatim.
 *   - `inflight` — a concurrent request holds the key; tell the client to
 *                  retry shortly (it will then hit `cached`).
 *
 * CACHE-ONLY-EXECUTED-OUTCOMES (the Stripe rule): callers store a result only
 * when the handler's side-effect phase actually began (success, silent
 * honeypot ok, send_failed). PRE-execution guard rejections (validation,
 * csrf, time-trap, captcha, rate-limit) must `releaseIdempotent` instead —
 * the client mints its key once per form mount and re-sends it on retry, so
 * caching a guard failure would brick every legitimate correct-and-resubmit
 * for the full TTL.
 *
 * Backends: DynamoDB when `QUILTY_IDEMPOTENCY_TABLE` is set (distributed —
 * survives cold starts and spans concurrent instances; SSM
 * `/quilty/website/idempotency-table`), else the per-Lambda in-memory Map
 * (dev/test, and the documented interim). Failure posture: the CLAIM fails
 * CLOSED (a duplicate email send is the exact harm the store exists to
 * prevent — the caller maps `IdempotencyUnavailableError` to a retryable
 * 5xx); the STORE is best-effort (the send already happened; refusing the
 * response over a bookkeeping write would hurt the user more than the
 * one-duplicate-window it risks) with a structured warn.
 *
 * Type design: generic over the cached Result shape so the same store serves
 * any Server Action without leaking details. The non-PHI invariant lives at
 * the call site (the cached Result must be a non-PHI envelope per D31 — the
 * sanitizer scrub at EmailSender is the chokepoint that enforces this).
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  type GetItemCommandInput,
  type GetItemCommandOutput,
  type PutItemCommandInput,
  type PutItemCommandOutput,
  type UpdateItemCommandInput,
  type UpdateItemCommandOutput,
} from '@aws-sdk/client-dynamodb';

/** Completed-envelope retention — the canonical 10-min retry-coverage floor. */
const TTL_MS = 10 * 60 * 1000;
/** In-progress claim expiry — generous vs the Lambda's 15s timeout, so a
 * crashed handler can't wedge a key for the full envelope TTL. */
const INFLIGHT_TTL_MS = 30 * 1000;

export type IdempotencyClaim<T> =
  | { readonly state: 'fresh' }
  | { readonly state: 'cached'; readonly value: T }
  | { readonly state: 'inflight' };

/** Claim-path infrastructure failure — the caller must NOT run the handler. */
export class IdempotencyUnavailableError extends Error {
  constructor(cause: string) {
    super(`Idempotency store unavailable (${cause}); failing closed.`);
    this.name = 'IdempotencyUnavailableError';
  }
}

// ---------------------------------------------------------------------------
// In-memory backend (dev/test + documented interim)
// ---------------------------------------------------------------------------

interface MemoryEntry {
  readonly state: 'inflight' | 'done';
  readonly value?: unknown;
  readonly expiresAtMs: number;
}

const memoryStore = new Map<string, MemoryEntry>();

function memoryClaim<T>(key: string): IdempotencyClaim<T> {
  const now = Date.now();
  // Opportunistic prune — sweep at most 16 entries per call to bound
  // worst-case latency.
  let sweepCount = 0;
  for (const [k, entry] of memoryStore) {
    if (entry.expiresAtMs <= now) {
      memoryStore.delete(k);
    }
    if (++sweepCount >= 16) break;
  }
  const existing = memoryStore.get(key);
  if (existing && existing.expiresAtMs > now) {
    return existing.state === 'done'
      ? { state: 'cached', value: existing.value as T }
      : { state: 'inflight' };
  }
  memoryStore.set(key, { state: 'inflight', expiresAtMs: now + INFLIGHT_TTL_MS });
  return { state: 'fresh' };
}

function memoryStoreResult<T>(key: string, value: T): void {
  memoryStore.set(key, { state: 'done', value, expiresAtMs: Date.now() + TTL_MS });
}

// ---------------------------------------------------------------------------
// DynamoDB backend (QUILTY_IDEMPOTENCY_TABLE)
// ---------------------------------------------------------------------------

/** Minimal client surface, injectable for tests. */
export interface IdempotencyTableClient {
  readonly getItem: (input: GetItemCommandInput) => Promise<GetItemCommandOutput>;
  readonly putItem: (input: PutItemCommandInput) => Promise<PutItemCommandOutput>;
  readonly updateItem: (input: UpdateItemCommandInput) => Promise<UpdateItemCommandOutput>;
}

let defaultClient: IdempotencyTableClient | null = null;
let injectedClient: IdempotencyTableClient | null = null;

function tableClient(): IdempotencyTableClient {
  if (injectedClient) return injectedClient;
  if (!defaultClient) {
    const sdk = new DynamoDBClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });
    defaultClient = {
      getItem: (input) => sdk.send(new GetItemCommand(input)),
      putItem: (input) => sdk.send(new PutItemCommand(input)),
      updateItem: (input) => sdk.send(new UpdateItemCommand(input)),
    };
  }
  return defaultClient;
}

/** Read at call time (matching the fail-closed guard convention) so the
 * backend selection is stubable in tests and consistent per request. */
function activeTableName(): string | undefined {
  const name = process.env['QUILTY_IDEMPOTENCY_TABLE'];
  return name && name.length > 0 ? name : undefined;
}

// ADR-0030 fail-closed symmetry with the composition-root adapters: a
// production runtime must not SILENTLY run the per-instance memory backend
// (cross-instance duplicate-send windows) — it requires the explicit
// QUILTY_ALLOW_INMEMORY_ADAPTERS opt-in. The OUTCOME is memoized (not just
// "checked once"): a violating instance must throw on EVERY claim, or the
// first-request-only throw degrades into exactly the silent fallback the
// guard forbids. Envs are fixed for a Lambda's lifetime, so memoizing is safe.
let memoryBackendVerdict: Error | 'allowed' | null = null;
function assertMemoryBackendAllowed(): void {
  if (memoryBackendVerdict === null) {
    const isProductionRuntime =
      process.env.NODE_ENV === 'production' &&
      process.env['NEXT_PHASE'] !== 'phase-production-build';
    const allowInMemory = process.env['QUILTY_ALLOW_INMEMORY_ADAPTERS'] === 'true';
    memoryBackendVerdict =
      isProductionRuntime && !allowInMemory
        ? new Error(
            'Refusing the in-memory idempotency store in a production runtime without the ' +
              'explicit QUILTY_ALLOW_INMEMORY_ADAPTERS opt-in (ADR-0030) — set ' +
              'QUILTY_IDEMPOTENCY_TABLE (SSM /quilty/website/idempotency-table) instead.',
          )
        : 'allowed';
  }
  if (memoryBackendVerdict !== 'allowed') throw memoryBackendVerdict;
}

function isConditionalCheckFailed(err: unknown): boolean {
  return err instanceof Error && err.name === 'ConditionalCheckFailedException';
}

let storeWarned = false;
function warnStoreBestEffort(reason: string): void {
  if (storeWarned) return;
  storeWarned = true;
  // Direct console.warn (not container.logger): module-scope store functions
  // have no container access, the message carries no user data, and the
  // structured `[idempotency]` prefix is the CloudWatch metric-filter hook —
  // same floor as the security package's [pepper]/[csrf-keys] warns.
  // eslint-disable-next-line no-console
  console.warn(
    `[idempotency] result store failed (${reason}); duplicate protection degrades ` +
      `for this key until its inflight marker expires.`,
  );
}

async function dynamoClaim<T>(table: string, key: string): Promise<IdempotencyClaim<T>> {
  const client = tableClient();
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    await client.putItem({
      TableName: table,
      Item: {
        pk: { S: key },
        state: { S: 'inflight' },
        ttl: { N: String(nowSec + Math.ceil(INFLIGHT_TTL_MS / 1000)) },
      },
      // TTL reaping lags expiry by up to ~48h, so an expired-but-unreaped
      // item must be reclaimable — hence the ttl comparison, not just
      // attribute_not_exists.
      ConditionExpression: 'attribute_not_exists(pk) OR #ttl < :nowSec',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':nowSec': { N: String(nowSec) } },
    });
    return { state: 'fresh' };
  } catch (err) {
    if (!isConditionalCheckFailed(err)) {
      throw new IdempotencyUnavailableError(err instanceof Error ? err.name : 'unknown error');
    }
  }

  // Lost the claim — read what the owner left.
  try {
    const read = await tableClient().getItem({
      TableName: table,
      Key: { pk: { S: key } },
      ConsistentRead: true,
    });
    const state = read.Item?.['state']?.S;
    const raw = read.Item?.['value']?.S;
    if (state === 'done' && raw !== undefined) {
      return { state: 'cached', value: JSON.parse(raw) as T };
    }
    // Owner still running (or the item vanished under us) — conservative.
    return { state: 'inflight' };
  } catch (err) {
    throw new IdempotencyUnavailableError(err instanceof Error ? err.name : 'unknown error');
  }
}

async function dynamoRelease(table: string, key: string): Promise<void> {
  try {
    await tableClient().updateItem({
      TableName: table,
      Key: { pk: { S: key } },
      // Only an INFLIGHT marker may be released — a concurrent request that
      // already stored a done envelope must not have it yanked away.
      ConditionExpression: '#state = :inflight',
      // Expire immediately rather than DeleteItem: keeps this function on
      // the same UpdateItem permission the adapter already holds.
      UpdateExpression: 'SET #ttl = :epoch',
      ExpressionAttributeNames: { '#state': 'state', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':inflight': { S: 'inflight' },
        ':epoch': { N: '0' },
      },
    });
  } catch (err) {
    if (isConditionalCheckFailed(err)) return; // already done/absent — fine
    warnStoreBestEffort(err instanceof Error ? err.name : 'unknown error');
  }
}

async function dynamoStoreResult<T>(table: string, key: string, value: T): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    await tableClient().updateItem({
      TableName: table,
      Key: { pk: { S: key } },
      UpdateExpression: 'SET #state = :done, #value = :value, #ttl = :ttl',
      ExpressionAttributeNames: { '#state': 'state', '#value': 'value', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':done': { S: 'done' },
        ':value': { S: JSON.stringify(value) },
        ':ttl': { N: String(nowSec + Math.ceil(TTL_MS / 1000)) },
      },
    });
  } catch (err) {
    warnStoreBestEffort(err instanceof Error ? err.name : 'unknown error');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Atomically claim an idempotency key. Throws `IdempotencyUnavailableError`
 * (DynamoDB backend only) when the claim cannot be made safely — the caller
 * must fail the request rather than risk a duplicate side effect.
 */
export function claimIdempotent<T>(key: string): Promise<IdempotencyClaim<T>> {
  const table = activeTableName();
  if (table !== undefined) return dynamoClaim<T>(table, key);
  assertMemoryBackendAllowed();
  return Promise.resolve(memoryClaim<T>(key));
}

/**
 * Upgrade a claimed key to its result envelope. Best-effort — a failed
 * bookkeeping write must not fail a request whose side effect already
 * happened (see the module doc for the degradation window).
 */
export function storeIdempotent<T>(key: string, value: T): Promise<void> {
  const table = activeTableName();
  if (table !== undefined) return dynamoStoreResult(table, key, value);
  memoryStoreResult(key, value);
  return Promise.resolve();
}

/**
 * Release a fresh claim whose request was rejected by a PRE-execution guard
 * (see the cache-only-executed-outcomes rule in the module doc) so the
 * client's retry with the same per-mount key is not wedged behind the
 * inflight marker. Best-effort: a failed release self-heals when the
 * 30s inflight TTL lapses.
 */
export function releaseIdempotent(key: string): Promise<void> {
  const table = activeTableName();
  if (table !== undefined) return dynamoRelease(table, key);
  const entry = memoryStore.get(key);
  if (entry && entry.state === 'inflight') memoryStore.delete(key);
  return Promise.resolve();
}

/** Reset the store + seams. Test-only utility. */
export function __resetIdempotencyForTesting(client?: IdempotencyTableClient): void {
  memoryStore.clear();
  injectedClient = client ?? null;
  storeWarned = false;
  memoryBackendVerdict = null;
}
