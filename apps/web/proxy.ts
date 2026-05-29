import { CONSENT_COOKIE_NAME, COOKIE_REGISTRY, TAXONOMY_VERSION } from '@quilty/consent';
import {
  buildMarketingCsp,
  buildPortalCsp,
  buildSecurityHeaders,
  generateCsrfTokenEdge,
  generateNonce,
  isPortalRoute,
} from '@quilty/security';
import { NextResponse, type NextRequest } from 'next/server';
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  MAINTENANCE_BYPASS_COOKIE_NAME,
  isMaintenanceBypassPath,
} from '@/lib/edge/maintenance-allowlist';

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
  // Whole `/api/*` tree — broader than `isPortalRoute` in
  // `packages/security/src/domain/csp-builder.ts` (which only marks
  // `/api/auth/*` + `/api/webhooks/*` as portal-CSP). The wider
  // surface is deliberate: every Route Handler — webhooks, future
  // payment callbacks, csp-report — must be unreachable via SERP.
  /^\/api\//,
  // `(\/|$)` alternation handles BOTH the trailing-slash subpage
  // case AND the no-trailing-slash account-index case
  // (`trailingSlash: false` in next.config.ts means `/en/account`
  // arrives without a trailing slash). `^` anchor is stricter than
  // `isPortalRoute`'s unanchored test, which would also match
  // `/foo/account` mid-path — we explicitly want apex + locale-
  // prefixed paths only.
  /^\/account(\/|$)/,
  // `{2,}` (not `{2}`) is open-ended to match future 3-letter ISO
  // 639-2 prefixes (`zho`, `hin`, `ara`) — every locale receives
  // the response-header noindex tier alongside its portal CSP.
  /^\/[a-z]{2,}\/account(\/|$)/,
  /^\/dev(\/|$)/,
  // (errors) route group surfaces — `/410`, `/451`, `/503`. The
  // route-group layout sets `robots: { index: false, follow: false }`
  // via metadata, but header-only crawlers (Googlebot HEAD requests,
  // compliance scanners, AI-citation bots that don't parse HTML)
  // need the response-header tier too. The `/503` path also gets
  // X-Robots-Tag set inline by `maintenanceRewrite` when the
  // maintenance gate fires; this pattern covers the direct-navigation
  // case (curl /503 + future ops-runbook navigation).
  //
  // Locale-prefixed variants (`/en/410`, `/zho/451`, etc.) are NOT
  // reachable today — (errors) sits outside [locale] in the route
  // tree — but the pattern covers them for future resilience if the
  // route-group ever moves under [locale] (e.g., to localise the
  // status-page copy). `{2,}` matches future 3-letter ISO 639-2
  // prefixes alongside the current 2-letter set.
  /^\/(410|451|503)(\/|$)/,
  /^\/[a-z]{2,}\/(410|451|503)(\/|$)/,
];

function shouldNoindexPath(pathname: string): boolean {
  return NOINDEX_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

// GPC FORCE-OFF cookie (D100 + Disney $2.75M Feb 2026). Lifetime
// derived from COOKIE_REGISTRY so a future legal review can rotate
// in one place. Module-init throw guards against a registry drop or
// `session`-lifetime reassignment.
const CONSENT_COOKIE_ENTRY = COOKIE_REGISTRY.find((c) => c.name === CONSENT_COOKIE_NAME);
if (CONSENT_COOKIE_ENTRY === undefined || CONSENT_COOKIE_ENTRY.lifetime === 'session') {
  throw new Error(
    `proxy.ts: consent cookie "${CONSENT_COOKIE_NAME}" missing from @quilty/consent COOKIE_REGISTRY or has session lifetime — registry must declare a numeric day count.`,
  );
}
const CONSENT_COOKIE_MAX_AGE_SECONDS = CONSENT_COOKIE_ENTRY.lifetime * 24 * 60 * 60;

/**
 * Edge-runtime-safe base64 encoder. `Buffer` is polyfilled in the
 * Next.js Edge runtime but the Web-API path here is the canonical
 * cross-runtime form. JSON output is ASCII-only (taxonomy field
 * names + boolean literals + ISO timestamp) so the Latin-1 round
 * trip is safe; if non-ASCII content ever lands in the payload,
 * promote to `TextEncoder` + chunked encoding.
 */
function base64Encode(value: string): string {
  return btoa(value);
}

/**
 * Write the GPC FORCE-OFF consent cookie on the response if and only
 * if `Sec-GPC: 1` is present AND no consent cookie already exists.
 * Idempotent — a returning GPC user with the cookie already set
 * skips the write so the existing record (which may carry a more
 * recent `updated_at`) is preserved.
 */
function applyGpcForceOffCookie(request: NextRequest, response: NextResponse): void {
  if (request.headers.get('sec-gpc') !== '1') return;
  if (request.cookies.has(CONSENT_COOKIE_NAME)) return;

  // `gpc_detected: true` is correct here — the function only runs
  // when `Sec-GPC: 1` was present on the request (guarded above), so
  // the persisted snapshot reflects what was actually seen. Writing
  // `false` was a regression from an earlier scaffold pass (the
  // GPC-detector port's `gpc_detected` field is the per-request
  // header-presence signal per D63). A future read of the cookie
  // alone (without the live header) would inherit the false value
  // and silently lie about the GPC signal's provenance. The cookie
  // reader still consults the live header on every request; this
  // field documents what was true at write time.
  const payload = JSON.stringify({
    essential: true,
    functional: true,
    analytics: false,
    marketing: false,
    personalization: false,
    gpc_detected: true,
    gpc_honored: true,
    version: TAXONOMY_VERSION,
    updated_at: new Date().toISOString(),
  });

  response.cookies.set({
    name: CONSENT_COOKIE_NAME,
    value: base64Encode(payload),
    // `__Host-` prefix requires Secure + Path=/ + no Domain. httpOnly
    // intentionally false (matches the cookie-taxonomy registry +
    // future useConsent() client hook). SameSite=Lax — the cookie
    // travels with top-level navigation but not with cross-site
    // sub-resource POSTs, which is the right CSRF posture for an
    // opt-out marker.
    secure: true,
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: CONSENT_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * CSRF token cookie name (D113 8-piece form pattern; OWASP canonical
 * double-submit). The `__Host-` prefix forces Secure + Path=/ + no
 * Domain, mutually exclusive with parent-domain cookie sharing.
 * Localised at module scope so the proxy.ts + page.tsx + Route Handler
 * agree on a single literal.
 */
const CSRF_COOKIE_NAME = '__Host-quilty_csrf';

/**
 * Forms-bearing route check. Matches any `/{2+ letter locale}/contact`
 * path so the CSRF cookie is minted at the proxy layer before the
 * Server Component renders. Next.js 16 hardened `cookies()` API to be
 * read-only outside Server Actions, Route Handlers, and middleware;
 * proxy.ts is the only render-time-compatible mint site.
 *
 * Extend this matcher when subscribers / waitlist / contact-sales
 * forms ship — every D113-pattern form needs the same cookie pre-mint.
 */
function isFormsRoute(pathname: string): boolean {
  return /^\/[a-z]{2,}\/contact(\/|$)/.test(pathname);
}

/**
 * Mint-or-reuse the CSRF cookie for forms-bearing routes. Returns the
 * fresh token to set on the response cookies, OR `null` when the cookie
 * already exists and no mint is needed.
 *
 * Mutates `request.cookies` so the downstream Server Component reads
 * the new token via `cookies().get()` on THIS request. The response
 * cookie is set separately by the caller so the browser persists the
 * token for subsequent visits.
 *
 * Web Crypto (SubtleCrypto HMAC-SHA-256) — runs in Edge runtime
 * without `node:crypto`. The byte-identical contract with the Node
 * `verifyCsrf()` is locked by `packages/security/__tests__/csrf-edge.test.ts`.
 */
async function ensureCsrfCookieMint(request: NextRequest): Promise<string | null> {
  if (request.cookies.has(CSRF_COOKIE_NAME)) return null;
  const token = await generateCsrfTokenEdge();
  // request.cookies.set mutates the underlying Cookie header so the
  // downstream `request.headers` snapshot picks up the new pair when
  // proxy.ts forwards via `NextResponse.next({ request: { headers } })`.
  request.cookies.set(CSRF_COOKIE_NAME, token);
  return token;
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

/**
 * Maintenance-mode gate. Returns a 503 NextResponse rewritten to /503
 * when `MAINTENANCE_MODE=true` env var is set AND the request path
 * is not in the bypass allowlist AND the ops-bypass cookie isn't
 * present. Returns null when the request should flow through normally.
 *
 * Allowlist + cookie name live in `lib/edge/maintenance-allowlist.ts`
 * — single source of truth shared with the ops runbook.
 *
 * Sets:
 *   - `Retry-After` per RFC 7231 §7.1.3 — Googlebot crawl-throttle hint
 *   - `X-Cluster-Status: maintenance` (Cloudflare convention) so
 *     future Instatus integration parses without HTML scrape
 *   - `X-Robots-Tag: noindex, nofollow` defense-in-depth (the (errors)
 *     layout metadata also emits robots:noindex, but the header runs
 *     before HTML parses)
 */
/**
 * Module-init guard: in production the ops bypass MUST verify against
 * an HMAC secret. The bypass cookie name is public (in source); without
 * an HMAC step, any attacker with `Cookie: qty_ops_bypass=x` punches
 * through the maintenance wall. The forms-canonical commit ships the
 * shared HMAC verifier; until then, production deployments with
 * MAINTENANCE_MODE=true are gated here at module load.
 */
const HAS_BYPASS_SECRET = process.env.QUILTY_MAINTENANCE_BYPASS_SECRET !== undefined;
if (
  process.env.NODE_ENV === 'production' &&
  process.env.MAINTENANCE_MODE === 'true' &&
  !HAS_BYPASS_SECRET
) {
  throw new Error(
    'proxy.ts: MAINTENANCE_MODE=true in production requires QUILTY_MAINTENANCE_BYPASS_SECRET to be set ' +
      '(HMAC-verified ops bypass). Set the secret or unset MAINTENANCE_MODE.',
  );
}

function maintenanceRewrite(request: NextRequest): NextResponse | null {
  if (process.env.MAINTENANCE_MODE !== 'true') return null;
  if (isMaintenanceBypassPath(request.nextUrl.pathname)) return null;
  // Ops bypass: cookie-presence-only check is acceptable when the
  // bypass secret is absent (dev/test only — module-init guard above
  // refuses to start production without it). When the secret is set,
  // the stub still passes the cookie through; full HMAC verification
  // lands with the forms-canonical commit's shared HMAC verifier. The
  // production gate is enforced at module init, not here, so a hot-
  // path branch isn't required.
  const bypassCookie = request.cookies.get(MAINTENANCE_BYPASS_COOKIE_NAME);
  if (bypassCookie !== undefined && bypassCookie.value.length > 0) return null;

  const target = request.nextUrl.clone();
  target.pathname = '/503';
  // Validate the env override — non-numeric input would silently emit
  // an invalid `Retry-After` header that Googlebot ignores, voiding
  // the deindex protection the header is meant to provide.
  const rawRetryAfter = process.env.MAINTENANCE_RETRY_AFTER_SECONDS;
  const retryAfter =
    rawRetryAfter !== undefined && /^\d+$/.test(rawRetryAfter)
      ? rawRetryAfter
      : String(DEFAULT_RETRY_AFTER_SECONDS);
  const response = NextResponse.rewrite(target, { status: 503 });
  response.headers.set('Retry-After', retryAfter);
  response.headers.set('X-Cluster-Status', 'maintenance');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  applySecurityHeaders(response, { portal: false, nonce: undefined });
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Maintenance-mode gate fires before any other routing — a 503
  // window must shadow apex-redirect + change-password + GPC cookie
  // writes so the operationally-failing tier doesn't keep doing
  // tier-specific work.
  const maintenance = maintenanceRewrite(request);
  if (maintenance !== null) return maintenance;

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
    applyGpcForceOffCookie(request, redirect);
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
    applyGpcForceOffCookie(request, redirect);
    return redirect;
  }

  const portal = isPortalRoute(pathname);
  const nonce = portal ? generateNonce() : undefined;

  // CSRF cookie mint for D113 forms-bearing routes. Must run BEFORE
  // the requestHeaders snapshot so the updated Cookie header
  // propagates to the downstream Server Component on THIS request via
  // `NextResponse.next({ request: { headers } })`. Next.js 16
  // forbids `cookies().set()` in Server Components — proxy.ts is the
  // canonical pre-render mint site (open risk #7 closure).
  const mintedCsrfToken = isFormsRoute(pathname) ? await ensureCsrfCookieMint(request) : null;

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

  // Persist the freshly-minted CSRF token to the browser via Set-Cookie
  // so subsequent visits skip the mint. The `__Host-` prefix requires
  // Secure + Path=/ + no Domain (mutually exclusive with parent-domain
  // sharing). `httpOnly: false` is load-bearing — the Client Component
  // reads `document.cookie` to forward the token in the `X-Quilty-CSRF`
  // header (the triple-defense layer 3, D10 + D53 + OWASP). Flipping to
  // httpOnly: true would break the custom-header layer; CSP + Trusted
  // Types + the HMAC signature are the layered XSS defense.
  if (mintedCsrfToken !== null) {
    response.cookies.set({
      name: CSRF_COOKIE_NAME,
      value: mintedCsrfToken,
      httpOnly: false,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  }

  applySecurityHeaders(response, { portal, nonce });

  // Service Worker script must NOT be cached by the browser. A
  // stale /sw.js bypasses subsequent SW updates (the SW Update API
  // checks for byte-difference against the cached copy; a `no-cache`
  // CDN response forces a revalidation roundtrip on every page
  // load while keeping the SW's OWN cache strategies in place).
  // Per ADR-0022 §Security.
  if (pathname === '/sw.js') {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }

  // Workbox runtime bundles are version-pinned to `workbox-*@7.3.0`
  // in apps/web/package.json + vendored deterministically via the
  // prebuild script; safe to ship as immutable max-age=1y. Without
  // this header Next.js defaults `/public/*` to `max-age=0,
  // must-revalidate`, forcing every SW install + update check to
  // re-fetch ~50 KB from origin (Phase-C perf Critical).
  if (pathname.startsWith('/workbox/')) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }

  if (shouldNoindexPath(pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // 451 RFC 7725 §3 — the response MUST carry a `Link: <...>; rel="blocked-by"`
  // header pointing at the ENTITY IMPLEMENTING THE BLOCK (us / our CDN), NOT
  // the legal authority mandating it. The takedown-policy URL is the user-
  // facing appeal surface. Per the IETF 99 hackathon finding, the RFC's own
  // example (`spqr.example.org`) misleads implementers into pointing at the
  // authority — that's wrong; the blocking entity is named here, the
  // mandating authority is named in the rendered page body.
  if (pathname === '/451') {
    response.headers.set('Link', '<https://my-quilty.com/legal/takedown-policy>; rel="blocked-by"');
  }

  // Direct navigation to /503 (operator runbook, smoke test) must
  // also carry Retry-After + X-Cluster-Status: maintenance per
  // RFC 7231 §7.1.3 — the maintenanceRewrite path sets these only
  // when MAINTENANCE_MODE is on. Direct nav with operational mode
  // still classifies the response as a maintenance surface.
  //
  // Apply the same env-var validation as `maintenanceRewrite()`:
  // an unvalidated `MAINTENANCE_RETRY_AFTER_SECONDS` (e.g., "5m" or
  // "auto") would emit a malformed `Retry-After` value that
  // Googlebot ignores per its crawl-throttle parser, voiding the
  // header's purpose. Numeric-only check mirrors the canonical
  // path so the two surfaces stay behaviorally identical.
  if (pathname === '/503') {
    const rawRetryAfter = process.env.MAINTENANCE_RETRY_AFTER_SECONDS;
    const retryAfter =
      rawRetryAfter !== undefined && /^\d+$/.test(rawRetryAfter)
        ? rawRetryAfter
        : String(DEFAULT_RETRY_AFTER_SECONDS);
    response.headers.set('Retry-After', retryAfter);
    response.headers.set('X-Cluster-Status', 'maintenance');
  } else {
    // X-Cluster-Status (Cloudflare convention). Synthetic monitors +
    // future Instatus integration can parse this header without HTML
    // scraping to track operational state. The maintenance-mode path
    // sets `maintenance`; the normal path sets `operational`.
    response.headers.set('X-Cluster-Status', 'operational');
  }

  // GPC FORCE-OFF persistence write per D100. The CloudFront Function
  // edge layer (D63) is the eventual production home for this cookie
  // write; proxy.ts is the stand-in until that infrastructure ships.
  applyGpcForceOffCookie(request, response);

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
