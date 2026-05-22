import {
  buildMarketingCsp,
  buildPortalCsp,
  buildSecurityHeaders,
  generateNonce,
  isPortalRoute,
} from '@quilty/security';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js 16 `proxy.ts` (renamed from `middleware.ts` per S4 + ADR-0005).
 *
 * Owns:
 *   1. CSP per-route branching (D59) — marketing static / portal nonce
 *   2. Trusted Types report-only header (D57)
 *   3. Security headers baseline (D33 + D58 + D60)
 *   4. Sec-GPC header pass-through stub (D63 full implementation lands with the consent-banner activation)
 *   5. Nonce propagation via `x-nonce` request header so Server Components
 *      can read it via `(await headers()).get('x-nonce')`
 *
 * Critical security invariant (Next.js CVE-2025-29927): authorization
 * decisions MUST NOT live in this file alone. Every Server Component +
 * Route Handler must re-validate via the session store (ADR-0002).
 * proxy.ts is for headers and nonce propagation, not auth gating.
 */

const isDev = process.env.NODE_ENV === 'development';
const DEFAULT_LOCALE = 'en';

// RFC 8615 well-known path; credential managers (Chrome, Safari,
// 1Password, Bitwarden, Apple Passwords) discover it to surface
// "change password" UX. Destination + Cache-Control live HERE rather
// than in next.config.ts because Next.js evaluates `redirects` BEFORE
// `headers`, so a redirect entry would short-circuit the header rule
// and leave `Cache-Control: no-store` unreachable. Routing through
// proxy.ts gives the redirect response a header — which password
// managers MUST receive so they never cache a stale pointer.
const CHANGE_PASSWORD_WELL_KNOWN = '/.well-known/change-password';
const CHANGE_PASSWORD_DESTINATION = `/${DEFAULT_LOCALE}/account/security`;

// Defense-in-depth: any crawler that ignores robots.txt + page
// metadata still gets a response-level `X-Robots-Tag: noindex,
// nofollow` on every path that should never appear in a SERP. The
// patterns cover `/api/*` (Route Handlers — webhook callbacks,
// auth, csp-report), `/account/*` + `/{locale}/account/*` (the
// portal), and `/dev/*` (the dev-only diagnostic surface). The
// page-metadata layer + the per-account-layout cascade remain in
// place; this is the response-header tier.
const NOINDEX_PATH_PATTERNS: readonly RegExp[] = [
  /^\/api\//,
  // `(\/|$)` alternation handles BOTH the trailing-slash subpage
  // case AND the no-trailing-slash account-index case
  // (`trailingSlash: false` in next.config.ts means `/en/account`
  // arrives without a trailing slash). Mirrors `isPortalRoute` in
  // `packages/security/src/domain/csp-builder.ts` exactly.
  /^\/account(\/|$)/,
  // `{2,}` (not `{2}`) mirrors `isPortalRoute`'s open-ended locale
  // pattern — a future 3-letter ISO 639-2 prefix (`zho`, `hin`,
  // `ara`) must receive the response-header noindex tier alongside
  // its stricter portal CSP.
  /^\/[a-z]{2,}\/account(\/|$)/,
  /^\/dev(\/|$)/,
];

function shouldNoindexPath(pathname: string): boolean {
  return NOINDEX_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

/**
 * Apply the response-side security header stack (CSP-Report-Only +
 * HSTS + COOP + CORP + nosniff + frame-options + referrer + permissions).
 * Extracted so the apex-locale redirect path AND the
 * NextResponse.next() path both flow through the same header build,
 * preventing the apex 307 from being served bare.
 */
function applySecurityHeaders(
  response: NextResponse,
  options: {
    readonly portal: boolean;
    readonly nonce: string | undefined;
    readonly omitCsp?: boolean;
  },
): void {
  // omitCsp is set on redirect responses targeting a different CSP
  // tier than the redirect itself. A 302/307 body is never rendered,
  // so the CSP on the hop is inert — but applying a tier-mismatched
  // policy mis-buckets any header-inspecting observer (bots, password
  // managers reading the report-only header). The destination URL
  // gets its own CSP on its own response, which is what actually
  // matters for browser execution.
  if (options.omitCsp !== true) {
    const cspValue =
      options.portal && options.nonce !== undefined
        ? buildPortalCsp(options.nonce, { isDevelopment: isDev })
        : buildMarketingCsp({ isDevelopment: isDev });
    response.headers.set('Content-Security-Policy-Report-Only', cspValue);
  }
  for (const { key, value } of buildSecurityHeaders()) {
    response.headers.set(key, value);
  }
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Apex → default locale redirect lives HERE (not in next.config.ts
  // `redirects()`) so the response carries the full security-header
  // stack. The prior wiring redirected via next.config which fires
  // before proxy, leaving the apex 307 bare of CSP + HSTS. Bots
  // scraping the apex now receive the same posture as locale routes.
  if (pathname === '/') {
    const target = request.nextUrl.clone();
    target.pathname = `/${DEFAULT_LOCALE}`;
    const redirect = NextResponse.redirect(target, 307);
    applySecurityHeaders(redirect, { portal: false, nonce: undefined });
    return redirect;
  }

  // RFC 8615 + W3C webappsec-change-password-url. 302 per spec — 301
  // is explicitly prohibited (the destination must remain mutable as
  // auth flows evolve). Cache-Control: no-store ensures password
  // managers always re-evaluate the current pointer; a cached
  // redirect would send users to a stale URL the moment the portal
  // security page moves. Locale is hard-coded — credential managers
  // do not negotiate locale; the portal handles locale on landing.
  if (pathname === CHANGE_PASSWORD_WELL_KNOWN) {
    const target = request.nextUrl.clone();
    target.pathname = CHANGE_PASSWORD_DESTINATION;
    const redirect = NextResponse.redirect(target, 302);
    redirect.headers.set('Cache-Control', 'no-store');
    // Defense-in-depth noindex on the redirect hop itself — a
    // non-follow crawler indexing the intermediate /.well-known URL
    // would otherwise see no crawl-suppression signal. The
    // destination (portal) carries its own noindex on its own
    // response, but the redirect hop must say so explicitly too.
    redirect.headers.set('X-Robots-Tag', 'noindex, nofollow');
    // omitCsp: the destination (portal) carries the portal CSP on its
    // own response. Applying marketing CSP to this 302 (whose body is
    // never rendered) would mis-bucket header-inspecting observers.
    applySecurityHeaders(redirect, { portal: false, nonce: undefined, omitCsp: true });
    return redirect;
  }

  const portal = isPortalRoute(pathname);
  const nonce = portal ? generateNonce() : undefined;

  // Propagate nonce to Server Components via request header. Server Components
  // read it via `(await headers()).get('x-nonce')` and pass to <JsonLd nonce>
  // (and any other nonce-aware inline-script consumer).
  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    requestHeaders.set('x-nonce', nonce);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  applySecurityHeaders(response, { portal, nonce });

  if (shouldNoindexPath(pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // Sec-GPC is a REQUEST-only signal per the spec (browser → server). We
  // do NOT echo it on responses — server consumers read it from the
  // request directly. The CloudFront Function edge layer (D63) sets a
  // persistent opt-out cookie when Sec-GPC: 1 is detected; downstream
  // Server Components + Route Handlers (e.g. GpcHonoredIndicator) read
  // the header from the request, not from any response echo.

  return response;
}

/**
 * Matcher excludes static assets + the .well-known prefix.
 *
 * `/api/*` is INCLUDED in CSP coverage — auth Route Handlers (OAuth
 * callbacks, sign-in flows) can return HTML responses that need the
 * portal-tier CSP, and security-test discipline (csp.spec.ts) asserts
 * the nonce on `/api/auth/*`. The per-request CPU cost of computing 7
 * headers is microseconds — not worth the security boundary erosion.
 *
 * `/.well-known/change-password` is the lone .well-known path that
 * MUST flow through the proxy — it returns a 302 redirect, not a
 * static deeplink-manifest file. Every other .well-known path
 * (apple-app-site-association, assetlinks.json, security.txt,
 * traffic-advice, …) is a static file served via next.config.ts
 * `headers()` and stays excluded.
 */
export const config = {
  matcher: [
    // Negative-lookahead excludes static assets + favicon + .well-known
    // (deeplink files served with their own Content-Type via
    // next.config.ts headers()).
    '/((?!_next/static|_next/image|favicon\\.ico|\\.well-known).*)',
    '/.well-known/change-password',
  ],
};
