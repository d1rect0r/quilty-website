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
