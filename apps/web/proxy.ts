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

/**
 * Apply the response-side security header stack (CSP-Report-Only +
 * HSTS + COOP + CORP + nosniff + frame-options + referrer + permissions).
 * Extracted so the apex-locale redirect path AND the
 * NextResponse.next() path both flow through the same header build,
 * preventing the apex 307 from being served bare.
 */
function applySecurityHeaders(
  response: NextResponse,
  options: { readonly portal: boolean; readonly nonce: string | undefined },
): void {
  const cspValue =
    options.portal && options.nonce !== undefined
      ? buildPortalCsp(options.nonce, { isDevelopment: isDev })
      : buildMarketingCsp({ isDevelopment: isDev });
  response.headers.set('Content-Security-Policy-Report-Only', cspValue);
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
 */
export const config = {
  matcher: [
    // Negative-lookahead excludes static assets + favicon + .well-known
    // (deeplink files served with their own Content-Type via
    // next.config.ts headers()).
    '/((?!_next/static|_next/image|favicon\\.ico|\\.well-known).*)',
  ],
};
