/**
 * DynamoDB RateLimiter adapter — distributed sliding-window log.
 *
 * One item per key: `pk` (S), `timestamps` (L of N, chronological),
 * `version` (N, optimistic-concurrency counter), `ttl` (N, epoch seconds one
 * window past the newest hit so idle keys self-delete). Lifts the in-memory
 * adapter's per-Lambda boundary to per-account — the correct multi-instance
 * concurrency model.
 *
 * Write-amplification bound (the table's contract): the stored list never
 * exceeds `policy.limit` entries, because the DENY path is READ-ONLY — an
 * abusive key generates zero writes once its window is full, so the 400KB
 * item cap and the single-key partition write ceiling cannot be weaponized.
 * DynamoDB UpdateExpressions cannot prune list elements by value, so expiry
 * is read-compute-conditional-write: read the item (consistent), prune
 * expired entries locally, and write back the bounded list guarded by a
 * `version` equality condition. A lost race retries once with a fresh read;
 * a second loss means genuinely concurrent traffic on one key — deny with a
 * short retry (the honest read: the key is hot).
 *
 * Failure posture: fails OPEN on infrastructure errors (throttle, 5xx,
 * network) — availability over strictness for the abuse-control tier; the
 * CloudFront WAF rate rules remain the hard backstop, and the TF-owned
 * table alarms surface the degradation. One structured warn per instance
 * (CloudWatch-metric-filter friendly), never per request.
 *
 * Naming discipline (META-1): "DynamoDB" appears only in this file path +
 * adapter-internal identifiers. The port + factory are vendor-agnostic.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  type AttributeValue,
  type GetItemCommandInput,
  type GetItemCommandOutput,
  type UpdateItemCommandInput,
  type UpdateItemCommandOutput,
} from '@aws-sdk/client-dynamodb';
import type { RateLimitDecision, RateLimitPolicy, RateLimiter } from '../ports';

/**
 * Minimal client surface, injectable for tests (a hand-rolled fake beats
 * mocking the SDK transport). The default wraps the real SDK client.
 */
export interface RateLimitTableClient {
  readonly getItem: (input: GetItemCommandInput) => Promise<GetItemCommandOutput>;
  readonly updateItem: (input: UpdateItemCommandInput) => Promise<UpdateItemCommandOutput>;
}

export interface DynamoDbAdapterOptions {
  /** AWS region. */
  readonly region: string;
  /** DynamoDB table name (SSM `/quilty/website/rate-limit-table`). */
  readonly tableName: string;
  /** Clock source. Defaults to `() => Date.now()`. */
  readonly now?: () => number;
  /** Test seam / custom transport. Defaults to the real SDK client. */
  readonly client?: RateLimitTableClient;
  /**
   * Called once per instance on the first fail-open so the composition root
   * can route the degradation into the sanitized logger (the adapter itself
   * stays logger-agnostic). Optional — a console.warn fallback applies.
   */
  readonly onFailOpen?: (reason: string) => void;
}

/** Keep a departed key inspectable briefly past its window, then let TTL reap it. */
const TTL_GRACE_SECONDS = 60;
/** Both optimistic-write attempts lost — the key is hot; ask for a short backoff. */
const CONTENTION_RETRY_MS = 1_000;

function makeDefaultClient(region: string): RateLimitTableClient {
  const sdk = new DynamoDBClient({ region });
  return {
    getItem: (input) => sdk.send(new GetItemCommand(input)),
    updateItem: (input) => sdk.send(new UpdateItemCommand(input)),
  };
}

function parseStoredTimestamps(item: Record<string, AttributeValue> | undefined): number[] {
  const list = item?.['timestamps']?.L;
  if (!list) return [];
  const parsed: number[] = [];
  for (const entry of list) {
    const n = entry.N !== undefined ? Number(entry.N) : Number.NaN;
    if (Number.isFinite(n)) parsed.push(n);
  }
  return parsed;
}

function parseVersion(item: Record<string, AttributeValue> | undefined): number {
  const raw = item?.['version']?.N;
  const n = raw !== undefined ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function isConditionalCheckFailed(err: unknown): boolean {
  return err instanceof Error && err.name === 'ConditionalCheckFailedException';
}

export function makeDynamoDbRateLimiter(options: DynamoDbAdapterOptions): RateLimiter {
  const now = options.now ?? ((): number => Date.now());
  const client = options.client ?? makeDefaultClient(options.region);

  // One structured warning per instance — enough for a metric-filter alarm
  // on limiter degradation without flooding the log group under an outage.
  let failOpenWarned = false;
  const warnFailOpen = (reason: string): void => {
    if (failOpenWarned) return;
    failOpenWarned = true;
    if (options.onFailOpen) {
      options.onFailOpen(reason);
    } else if (typeof console !== 'undefined') {
      // Deliberate observable-degradation signal for a CloudWatch metric
      // filter; the composition root normally injects onFailOpen (sanitized
      // logger) — this is the wiring-less floor.
      // eslint-disable-next-line no-console
      console.warn(
        `[rate-limit] table ${options.tableName} unavailable (${reason}); ` +
          `failing OPEN — WAF rate rules remain the backstop.`,
      );
    }
  };

  const failOpenDecision = (currentMs: number, policy: RateLimitPolicy): RateLimitDecision => ({
    // Fail-open admits the request but reports zero headroom — callers that
    // surface `remaining` to clients don't advertise capacity the limiter
    // cannot actually vouch for.
    allowed: true,
    remaining: 0,
    resetAtMs: currentMs + policy.windowMs,
  });

  return {
    consume: async (key: string, policy: RateLimitPolicy): Promise<RateLimitDecision> => {
      try {
        // Two attempts: a fresh consistent read each time, one optimistic
        // write. Losing both means real same-key concurrency (see below).
        for (let attempt = 0; attempt < 2; attempt++) {
          const currentMs = now();
          const windowStart = currentMs - policy.windowMs;

          const read = await client.getItem({
            TableName: options.tableName,
            Key: { pk: { S: key } },
            ConsistentRead: true,
          });
          const readVersion = parseVersion(read.Item);
          const valid = parseStoredTimestamps(read.Item).filter((ts) => ts > windowStart);

          if (valid.length >= policy.limit) {
            // READ-ONLY deny — the write-amplification bound. Chronological
            // list + non-empty branch invariant make [0] safe.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const oldest = valid[0]!;
            const resetAtMs = oldest + policy.windowMs;
            return {
              allowed: false,
              remaining: 0,
              resetAtMs,
              retryAfterMs: Math.max(0, resetAtMs - currentMs),
            };
          }

          const nextList = [...valid, currentMs];
          const ttlSeconds = Math.ceil((currentMs + policy.windowMs) / 1000) + TTL_GRACE_SECONDS;
          try {
            await client.updateItem({
              TableName: options.tableName,
              Key: { pk: { S: key } },
              // `attribute_not_exists` covers both the first-ever write and
              // a TTL reap between our read and write; otherwise the version
              // we read must still be current.
              ConditionExpression: 'attribute_not_exists(pk) OR version = :readVersion',
              UpdateExpression: 'SET #ts = :list, version = :nextVersion, #ttl = :ttl',
              ExpressionAttributeNames: { '#ts': 'timestamps', '#ttl': 'ttl' },
              ExpressionAttributeValues: {
                ':readVersion': { N: String(readVersion) },
                ':nextVersion': { N: String(readVersion + 1) },
                ':list': { L: nextList.map((ts) => ({ N: String(ts) })) },
                ':ttl': { N: String(ttlSeconds) },
              },
            });
          } catch (err) {
            if (isConditionalCheckFailed(err)) continue;
            throw err;
          }

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const oldest = nextList[0]!;
          return {
            allowed: true,
            remaining: policy.limit - nextList.length,
            resetAtMs: oldest + policy.windowMs,
          };
        }

        // Both optimistic writes lost: the key is receiving genuinely
        // concurrent traffic. Denying with a short retry is the safe read —
        // a legitimate double-submit is absorbed by the idempotency layer,
        // while a burst attack gains no admission from race-losing.
        const currentMs = now();
        return {
          allowed: false,
          remaining: 0,
          resetAtMs: currentMs + CONTENTION_RETRY_MS,
          retryAfterMs: CONTENTION_RETRY_MS,
        };
      } catch (err) {
        // Fail-open is for INFRASTRUCTURE errors. A programming bug
        // (TypeError from a refactor, etc.) must surface loudly, not be
        // silently converted into "limiter off" — those error classes can
        // never come from the AWS SDK's request path.
        if (err instanceof TypeError || err instanceof RangeError || err instanceof SyntaxError) {
          throw err;
        }
        warnFailOpen(err instanceof Error ? err.name : 'unknown error');
        return failOpenDecision(now(), policy);
      }
    },
  };
}
