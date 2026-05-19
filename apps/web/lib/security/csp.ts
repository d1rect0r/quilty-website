/**
 * Content-Security-Policy builders — two-tier per ADR-0005 + D59.
 *
 *   - Marketing tier: static + hash-pinned CSP (no nonce). Preserves
 *     CloudFront caching. Used for /, /[locale]/(marketing)/*.
 *   - Portal tier: nonce + strict-dynamic. Used for /[locale]/(account)/*,
 *     /api/auth/*.
 *
 * Both tiers: report-only at M1, flipped to enforce at M8 launch gate
 * after 2-4 clean weeks of report-only data (D32 + D60).
 *
 * Report sink: Sentry's `/api/<project>/security/` endpoint (D61). The
 * Sentry ingest host must be allowlisted in `connect-src` or CSP itself
 * blocks the reports — classic bootstrap failure.
 *
 * Trusted Types per D57: `require-trusted-types-for 'script'` shipped
 * report-only at M1. Hit MDN Baseline Feb 2026.
 */

/**
 * Server-only env reads (no NEXT_PUBLIC_ prefix — proxy.ts is Edge/Node
 * server, no browser exposure needed). The wildcard fallback is intentional
 * at M1 (Sentry project DSN ID not yet baked into infra); tighten to the
 * specific o<id>.ingest.us.sentry.io subdomain at M8 launch gate to
 * prevent any-Sentry-project exfiltration vector.
 */
const SENTRY_INGEST_HOST_RAW = process.env.SENTRY_INGEST_HOST ?? 'https://*.ingest.us.sentry.io';
const SENTRY_REPORT_URI_RAW = process.env.SENTRY_CSP_REPORT_URI ?? '';

/**
 * Sanitize env-var values that get interpolated directly into CSP header.
 * Prevents CSP injection if env vars contain `;`, newlines, or whitespace
 * (Round-5 TypeScript reviewer: misconfigured CI could otherwise corrupt
 * the header).
 */
function sanitizeCspValue(raw: string): string {
  if (!raw) return '';
  // Reject anything that isn't a single URL token.
  if (!/^https?:\/\/[^\s;]+$/.test(raw)) {
    return '';
  }
  return raw;
}

const SENTRY_INGEST_HOST =
  sanitizeCspValue(SENTRY_INGEST_HOST_RAW) || 'https://*.ingest.us.sentry.io';
const SENTRY_REPORT_URI = sanitizeCspValue(SENTRY_REPORT_URI_RAW);

export interface CspOptions {
  isDevelopment?: boolean;
}

/**
 * Marketing-tier CSP — static, no nonce, suitable for CDN caching.
 *
 * Inline scripts forbidden (no `unsafe-inline`); only first-party scripts
 * + Sentry browser SDK loaded from `connect-src`. JSON-LD inline scripts
 * rely on the static-CSP path being permissive enough for `<script
 * type="application/ld+json">` — these are exempt from CSP `script-src`
 * because they're not executable JavaScript per CSP spec.
 */
export function buildMarketingCsp(opts: CspOptions = {}): string {
  const dev = opts.isDevelopment ?? false;
  const directives: string[] = [
    `default-src 'self'`,
    `script-src 'self'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${SENTRY_INGEST_HOST}`,
    `media-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
    // Trusted Types report-only at M1 (D57). At M8 enforce flip, the
    // header itself moves from Report-Only to enforcing.
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
  const directives: string[] = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${SENTRY_INGEST_HOST}`,
    `media-src 'self'`,
    `object-src 'none'`,
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
 * Round-5 HIPAA/CSP reviewer flagged the original `/api/webhooks` and
 * `/api/auth` prefix matches as over-broad (e.g. `/api/webhooks-internal`
 * would silently classify as portal). Trailing-slash discipline applied.
 *
 * Webhook endpoints are JSON-only — a nonce-based portal CSP serves no
 * purpose there. But classifying them as portal is safer than marketing
 * (stricter is fine on a JSON route), and we keep them in the portal
 * branch to avoid accidentally cache-key-sharing with marketing pages.
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
 * append loop — single call into V8 instead of 16 string concatenations
 * (Round-5 final-QA perf-bundle MEDIUM). At 16 bytes this is the spread
 * limit's sweet spot; do not extend beyond ~125 bytes without switching
 * back to a loop or using `Buffer.from(bytes).toString('base64url')`
 * on the Node runtime.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
