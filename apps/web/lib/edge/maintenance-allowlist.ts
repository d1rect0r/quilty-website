/**
 * Single source of truth for the maintenance-mode bypass allowlist.
 *
 * `proxy.ts` reads this list to decide which paths bypass the 503
 * gate when `MAINTENANCE_MODE=true`. The ops runbook for incident
 * declarations + status-page incidents reads the same list so the
 * "what stays up during maintenance" set never drifts between code
 * and ops-procedure.
 *
 * Edge-runtime safe — no Node-only imports.
 *
 * The set covers the three classes of paths that MUST remain reachable
 * during a maintenance window:
 *   1. Health probes — Sentry Cron + CloudWatch synthetic monitors
 *      poll these to track uptime even when the rest of the site is
 *      503-ing intentionally. Returning 503 here would re-fire the
 *      same alert that triggered the maintenance window.
 *   2. RFC well-known files — `security.txt` (RFC 9116) + AASA +
 *      assetlinks.json + gpc.json + change-password. These must NEVER
 *      return 503 because they're contract surfaces consumed by
 *      regulators + credential managers + iOS/Android attestation.
 *   3. Webhook callbacks — Stripe + Cognito + future external
 *      callers retry on 5xx with exponential backoff but giving up
 *      after a small budget. A maintenance 503 burned on a webhook
 *      retry budget is operational data loss.
 *   4. Static asset paths — `/_next/static/*`, favicons. The 503
 *      page itself loads from `/_next/static/*` and would brick
 *      itself if those were 503-ed.
 *   5. The 503 page itself — `/503` must serve 200 so users see the
 *      branded maintenance page, not a 503-on-503 fallback.
 *
 * Bypass cookie: `qty_ops_bypass` — an HMAC `<payload>.<sig>` token
 * signed with `QUILTY_MAINTENANCE_BYPASS_SECRET` (verified by
 * verifyHmacEdge in proxy.ts). Forging one requires the secret, so the
 * public cookie name alone grants nothing. Mint via
 * `pnpm mint:maintenance-bypass`; ops set it locally to view the site
 * during a maintenance window without flipping the env var off.
 */

export const MAINTENANCE_BYPASS_PATH_PREFIXES: readonly string[] = [
  // Health + ready endpoints — must always serve 200 so on-call's
  // own monitoring isn't blinded by the maintenance window.
  '/api/health',
  '/api/ready',
  '/api/live',

  // Webhook callbacks — Stripe + auth providers retry on 5xx with a
  // small budget; 503 here is real operational risk.
  '/api/webhooks/',

  // RFC + W3C well-known surfaces. The .well-known prefix already
  // routes through next.config.ts headers() rather than proxy.ts
  // (the proxy matcher excludes it), but the prefix is listed here
  // for documentation symmetry + for any future migration that
  // routes these via proxy.
  '/.well-known/',

  // Status page redirect target. The actual status surface lives at
  // `status.my-quilty.com` (Instatus Pro reserved subdomain); the
  // path stays bypassed so the future redirect-to-status link works
  // even during a maintenance window.
  '/status',

  // 503 surface itself — serves 200 with the maintenance body.
  '/503',

  // Static + Next.js internal assets. Without these, the 503 page
  // can't load its own CSS + fonts.
  '/_next/',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
];

/**
 * Cookie name signed-ops bypass uses. The cookie value is HMAC-signed
 * against `QUILTY_MAINTENANCE_BYPASS_SECRET`; proxy.ts verifies the
 * signature before granting bypass.
 */
export const MAINTENANCE_BYPASS_COOKIE_NAME = 'qty_ops_bypass';

/**
 * Default Retry-After in seconds. `MAINTENANCE_RETRY_AFTER_SECONDS`
 * env var overrides per incident. Googlebot uses Retry-After as a
 * crawl-throttle hint; >7 days risks deindexing per Google's docs,
 * so the default sits at 1h — short enough that long maintenance
 * windows force ops to surface an explicit expected duration.
 */
export const DEFAULT_RETRY_AFTER_SECONDS = 3600;

/**
 * Returns true iff the given pathname matches any allowlist prefix.
 * Used by proxy.ts before the maintenance-mode 503 rewrite.
 */
export function isMaintenanceBypassPath(pathname: string): boolean {
  return MAINTENANCE_BYPASS_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
