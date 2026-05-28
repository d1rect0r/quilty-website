/**
 * Content-Security-Policy builders — two-tier per ADR-0005 + D59.
 *
 *   - Marketing tier: static + hash-pinned CSP (no nonce). Preserves
 *     CloudFront caching. Used for /, /[locale]/(marketing)/*.
 *   - Portal tier: nonce + strict-dynamic. Used for /[locale]/(account)/*,
 *     /api/auth/*.
 *
 * Both tiers: report-only until the launch gate flips them to enforce
 * after 2-4 clean weeks of report-only data (D32 + D60).
 *
 * Report sink: Sentry's `/api/<project>/security/` endpoint (D61). The
 * Sentry ingest host must be allowlisted in `connect-src` or CSP itself
 * blocks the reports — classic bootstrap failure.
 *
 * Trusted Types per D57: `require-trusted-types-for 'script'` shipped
 * report-only at scaffold time. Hit MDN Baseline Feb 2026.
 */

import type { CspOptions } from '../ports';

/**
 * Server-only env reads (no NEXT_PUBLIC_ prefix — proxy.ts is Edge/Node
 * server, no browser exposure needed). The wildcard fallback is intentional
 * pre-launch (Sentry project DSN ID not yet baked into infra); tighten to
 * the specific o<id>.ingest.us.sentry.io subdomain at the launch gate to
 * prevent any-Sentry-project exfiltration vector.
 */
const SENTRY_INGEST_HOST_RAW = process.env.SENTRY_INGEST_HOST ?? 'https://*.ingest.us.sentry.io';
const SENTRY_REPORT_URI_RAW = process.env.SENTRY_CSP_REPORT_URI ?? '';

/**
 * Sanitize env-var values that get interpolated directly into the CSP
 * header. Prevents CSP injection if env vars contain `;`, newlines, or
 * whitespace (misconfigured CI could otherwise corrupt the header).
 */
function sanitizeCspValue(raw: string): string {
  if (!raw) return '';
  if (!/^https?:\/\/[^\s;]+$/.test(raw)) {
    return '';
  }
  return raw;
}

const SENTRY_INGEST_HOST =
  sanitizeCspValue(SENTRY_INGEST_HOST_RAW) || 'https://*.ingest.us.sentry.io';
const SENTRY_REPORT_URI = sanitizeCspValue(SENTRY_REPORT_URI_RAW);

/**
 * Strict-only Sentry host for portal `connect-src` — must be a
 * pinned project DSN subdomain (e.g. `https://o12345.ingest.us.sentry.io`),
 * NEVER a wildcard. the HIPAA/CSP sweep finding on portal exfiltration vectors finding: a wildcard portal
 * connect-src allows any Sentry project's ingest endpoint to
 * receive POST data, so a misconfigured DSN silently forwards
 * portal error payloads (which may include user IDs, session
 * fragments) to a different org's project.
 *
 * Resolution: returns the env-var value ONLY when it matches a
 * literal `https://<subdomain>.ingest.us.sentry.io` pattern with
 * no `*`. Returns `null` when no acceptable pin is configured;
 * the portal-tier builder then omits the Sentry origin entirely
 * (Sentry reporting from portal pages is OFF until a project DSN
 * lands in infra).
 */
function pinnedSentryHostOrNull(raw: string): string | null {
  const sanitized = sanitizeCspValue(raw);
  if (!sanitized) return null;
  // Reject wildcards + require a literal subdomain.
  if (sanitized.includes('*')) return null;
  if (!/^https:\/\/[a-z0-9-]+\.ingest\.us\.sentry\.io$/.test(sanitized)) return null;
  return sanitized;
}

const SENTRY_INGEST_HOST_PINNED = pinnedSentryHostOrNull(SENTRY_INGEST_HOST_RAW);

/**
 * Per-route additional-origin sanitizer. Each entry MUST match an
 * absolute https/http origin; any value with `;`, whitespace, or
 * malformed scheme is silently dropped to prevent CSP injection.
 * Returns a space-joined string ready for directive concatenation.
 */
function sanitizeAdditionalOrigins(origins: readonly string[] | undefined): string {
  if (!origins || origins.length === 0) return '';
  const cleaned = origins.map(sanitizeCspValue).filter((o) => o.length > 0);
  return cleaned.length > 0 ? ` ${cleaned.join(' ')}` : '';
}

/**
 * Marketing-tier CSP — static, no nonce, suitable for CDN caching.
 *
 * Inline scripts forbidden (no `unsafe-inline`); only first-party scripts
 * + Sentry browser SDK loaded from `connect-src`. JSON-LD inline scripts
 * rely on the static-CSP path being permissive enough for `<script
 * type="application/ld+json">` — these are exempt from CSP `script-src`
 * because they're not executable JavaScript per the CSP spec.
 *
 * Per-route extensions (D113): the /contact route extends `script-src`
 * + `connect-src` with `https://challenges.cloudflare.com` to load the
 * Turnstile challenge runtime. Pass via `additionalScriptSrc` /
 * `additionalConnectSrc` rather than mutating the base directive.
 */
export function buildMarketingCsp(opts: CspOptions = {}): string {
  const dev = opts.isDevelopment ?? false;
  const extraScripts = sanitizeAdditionalOrigins(opts.additionalScriptSrc);
  const extraConnects = sanitizeAdditionalOrigins(opts.additionalConnectSrc);
  const directives: string[] = [
    `default-src 'self'`,
    `script-src 'self'${dev ? " 'unsafe-eval'" : ''}${extraScripts}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${SENTRY_INGEST_HOST}${extraConnects}`,
    `media-src 'self'`,
    `object-src 'none'`,
    `worker-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
    // Trusted Types report-only pre-launch (D57). At the launch
    // enforce flip, the header itself moves from Report-Only to
    // enforcing.
    `require-trusted-types-for 'script'`,
  ];
  if (SENTRY_REPORT_URI) {
    directives.push(`report-uri ${SENTRY_REPORT_URI}`);
  }
  return directives.join('; ');
}

/**
 * Portal-tier CSP — nonce + strict-dynamic. Used for dynamic SSR routes
 * where each response is per-request (account portal, auth callbacks).
 *
 * `strict-dynamic` means: trust scripts the nonced script loads via DOM,
 * ignore allowlists in `script-src`. This is the OWASP-recommended modern
 * CSP shape (Web Almanac 2025 — only ~10% of CSP-using sites use strict-
 * dynamic, but it's the canonical pattern for nonce-based CSP).
 */
export function buildPortalCsp(nonce: string, opts: CspOptions = {}): string {
  const dev = opts.isDevelopment ?? false;
  const extraScripts = sanitizeAdditionalOrigins(opts.additionalScriptSrc);
  const extraConnects = sanitizeAdditionalOrigins(opts.additionalConnectSrc);
  // Portal connect-src REJECTS the wildcard Sentry ingest fallback
  // — a wildcard here is an any-Sentry-project exfiltration vector
  // per the HIPAA/CSP sweep finding on portal exfiltration vectors. Until SENTRY_INGEST_HOST is pinned to a
  // specific `https://o<id>.ingest.us.sentry.io` subdomain in
  // production env, portal pages don't forward to Sentry at all
  // (the Sentry browser SDK will fail-silent on the blocked POST).
  const portalSentryHost = SENTRY_INGEST_HOST_PINNED ? ` ${SENTRY_INGEST_HOST_PINNED}` : '';
  const directives: string[] = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}${extraScripts}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'${portalSentryHost}${extraConnects}`,
    `media-src 'self'`,
    `object-src 'none'`,
    `worker-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
    `require-trusted-types-for 'script'`,
  ];
  if (SENTRY_REPORT_URI) {
    directives.push(`report-uri ${SENTRY_REPORT_URI}`);
  }
  return directives.join('; ');
}

/**
 * Decide which tier applies for a given request path. Portal includes
 * authenticated routes + auth-flow handlers. Anything else is marketing.
 *
 * `/api/webhooks` is JSON-only — a nonce-based portal CSP serves no
 * purpose there. But classifying it as portal is safer than marketing
 * (stricter is fine on a JSON route), and keeps it from accidentally
 * cache-key-sharing with marketing pages.
 */
export function isPortalRoute(pathname: string): boolean {
  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) return true;
  if (pathname === '/api/webhooks' || pathname.startsWith('/api/webhooks/')) return true;
  if (/\/account(\/|$)/.test(pathname)) return true;
  return false;
}

/**
 * Crypto-strong nonce generator (Edge + Node runtime compatible). Uses
 * `crypto.getRandomValues` per the Web Crypto API which is available
 * in Lambda + Vercel Edge + Node 24 runtimes.
 *
 * The spread-form `String.fromCharCode(...bytes)` skips the per-byte
 * append loop — single call into V8 instead of 16 string concatenations.
 * At 16 bytes this is the spread limit's sweet spot; do not extend beyond
 * ~125 bytes without switching back to a loop or using
 * `Buffer.from(bytes).toString('base64url')` on the Node runtime.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
