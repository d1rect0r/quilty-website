#!/usr/bin/env node
/**
 * Mint a maintenance-mode ops-bypass cookie token.
 *
 * The token is `<payload>.<base64url(HMAC-SHA-256(payload, secret))>` — the
 * exact shape `verifyHmacEdge` (packages/security) checks in proxy.ts. node's
 * `digest('base64url')` is byte-identical to the edge `base64urlEncode`, so a
 * token minted here verifies in the Edge runtime.
 *
 * Usage:
 *   QUILTY_MAINTENANCE_BYPASS_SECRET=<secret> \
 *     node scripts/mint-maintenance-bypass.mjs [payload]
 *
 * Then set the printed value as the `qty_ops_bypass` cookie in the browser
 * to view the site while MAINTENANCE_MODE=true. Forging a token requires the
 * secret; rotate QUILTY_MAINTENANCE_BYPASS_SECRET to invalidate all tokens.
 */
import { createHmac } from 'node:crypto';

const secret = process.env.QUILTY_MAINTENANCE_BYPASS_SECRET;
if (!secret) {
  console.error('QUILTY_MAINTENANCE_BYPASS_SECRET must be set in the environment.');
  process.exit(1);
}

const payload = process.argv[2] ?? 'ops-bypass';
const sig = createHmac('sha256', secret).update(payload).digest('base64url');
console.log(`${payload}.${sig}`);
