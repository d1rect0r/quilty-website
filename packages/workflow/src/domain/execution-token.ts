/**
 * ExecutionToken — opaque, durable identifier for a running workflow.
 *
 * Tokens are intentionally opaque (consumers must NOT introspect the
 * internal shape) so the underlying engine swap (Step Functions ↔
 * Temporal Cloud ↔ Inngest) doesn't ripple to call sites. The
 * branded type prevents accidental string-juggling at the type level.
 *
 * The runtime shape is a JSON-serialisable object with a discriminator
 * (`kind: 'sfn' | 'temporal' | 'in-memory'`) and engine-specific
 * fields. Adapters parse + validate; consumers never touch the inside.
 */

declare const TOKEN_BRAND: unique symbol;

export type ExecutionToken = {
  readonly [TOKEN_BRAND]: 'execution-token';
} & ExecutionTokenPayload;

export type ExecutionTokenPayload =
  | { readonly kind: 'sfn'; readonly executionArn: string }
  | { readonly kind: 'temporal'; readonly workflowId: string; readonly runId: string }
  | { readonly kind: 'in-memory'; readonly id: string };

/**
 * Construct a branded ExecutionToken. Internal to the workflow
 * package; consumers receive tokens from `WorkflowEngine.start()`
 * and pass them back through subsequent calls.
 */
export function makeExecutionToken(payload: ExecutionTokenPayload): ExecutionToken {
  return payload as ExecutionToken;
}

/**
 * Convert a token to a short, log-safe string. Used in error
 * messages where the full token shape is unhelpful. Returns
 * engine-prefixed identifiers; never PHI.
 */
export function summarizeExecutionToken(token: ExecutionToken): string {
  switch (token.kind) {
    case 'sfn':
      return `sfn://${token.executionArn.split(':').pop() ?? 'unknown'}`;
    case 'temporal':
      return `temporal://${token.workflowId}/${token.runId}`;
    case 'in-memory':
      return `in-memory://${token.id}`;
  }
}

/**
 * Parse a JSON-deserialised token payload back into the branded
 * `ExecutionToken` type. The brand is compile-time only, so a token
 * round-tripped through JSON.stringify + JSON.parse needs this
 * validator to re-mint the brand AND assert the runtime shape is
 * coherent. When the Step Functions adapter activates per ADR-0021
 * (DynamoDB-backed token storage between Lambda invocations),
 * every read MUST go through this function — without it, the type
 * checker accepts any structurally-valid `ExecutionTokenPayload`
 * cast as `ExecutionToken` (including a malformed one a malicious
 * user could construct from a known schema).
 */
export function parseExecutionToken(raw: unknown): ExecutionToken {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('parseExecutionToken: token must be an object');
  }
  const candidate = raw as { kind?: unknown } & Record<string, unknown>;
  if (candidate.kind === 'sfn') {
    if (typeof candidate['executionArn'] !== 'string') {
      throw new Error('parseExecutionToken: sfn token missing executionArn');
    }
    return makeExecutionToken({
      kind: 'sfn',
      executionArn: candidate['executionArn'],
    });
  }
  if (candidate.kind === 'temporal') {
    if (typeof candidate['workflowId'] !== 'string' || typeof candidate['runId'] !== 'string') {
      throw new Error('parseExecutionToken: temporal token missing workflowId/runId');
    }
    return makeExecutionToken({
      kind: 'temporal',
      workflowId: candidate['workflowId'],
      runId: candidate['runId'],
    });
  }
  if (candidate.kind === 'in-memory') {
    if (typeof candidate['id'] !== 'string') {
      throw new Error('parseExecutionToken: in-memory token missing id');
    }
    return makeExecutionToken({ kind: 'in-memory', id: candidate['id'] });
  }
  throw new Error(`parseExecutionToken: unknown token kind ${String(candidate.kind)}`);
}
