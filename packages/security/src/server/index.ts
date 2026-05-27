/**
 * Server-only barrel for @quilty/security.
 *
 * Surfaces that depend on `node:crypto` (timingSafeEqual / createHmac /
 * randomBytes) live HERE so the default barrel (`@quilty/security`)
 * stays client-bundle-safe under webpack. Server Components, Route
 * Handlers, and edge-runtime code that mints / verifies CSRF tokens
 * import from this subpath.
 *
 * Client-tier code MUST NOT import from `/server` — webpack's tree-
 * shaker cannot erase a `node:crypto` import that's reachable through
 * any imported symbol, and the bundler refuses to compile `node:` URIs
 * for the browser target without a fallback plugin we deliberately
 * don't ship (Node modules in the browser are a footgun, not a feature).
 *
 * The split is mechanical, not semantic: csrf.ts is functionally a
 * forms-canonical helper alongside honeypot.ts + time-trap.ts (which
 * stay in the default barrel because they use only Web-API + JS
 * primitives). The mechanical separation buys per-route bundle
 * budgeting under webpack-built measurements (D.5 / ADR-0018).
 */

export { generateCsrfToken, verifyCsrf, type CsrfVerifyInput } from '../domain/csrf';
