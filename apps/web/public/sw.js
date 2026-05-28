/* global importScripts, workbox */
/*
 * Quilty Service Worker — hand-rolled Workbox per ADR-0022.
 *
 * Strategies:
 *   - Cache-first for /_next/static/*, /static/*, fonts, icons, manifest.
 *   - NetworkFirst (3s timeout) for navigations + HTML routes.
 *   - NetworkOnly (excluded from SW entirely) for:
 *       /api/auth/* | /api/contact | /api/csp-report | /api/dsar/*
 *       /api/webhooks/* | /[locale]/account/* | ?_rsc=* | sentry/posthog tunnels
 *       any non-GET (POST server actions, etc.)
 *   - BCP-47 aware locale exclusion regex (covers pt-BR, zh-Hant, etc.)
 *
 * Security:
 *   - Workbox vendored at /workbox/ — CSP `script-src 'self'` +
 *     `worker-src 'self'` are satisfied without weakening either.
 *     `setConfig({ modulePathPrefix })` pins the lazy-module loader
 *     to our same-origin copy; absent this the loader defaults to
 *     `storage.googleapis.com/workbox-cdn/...` which CSP blocks.
 *   - clients.postMessage('LOGOUT_CLEAR_CACHES') → flushes ALL caches
 *     AND calls registration.unregister() + posts back so the
 *     register.ts callback can hard-reload the page.
 *   - cleanupOutdatedCaches() on activate.
 *   - Cache-Control: no-cache on /sw.js (set in proxy.ts).
 *   - CSP: worker-src 'self' (set in csp-builder.ts).
 *
 * Activation gate: registration logic in apps/web/lib/sw/register.ts
 * only fires in production (not `next dev`). The flag-gated install
 * prompt lives separately in <InstallPrompt>; the SW itself runs
 * unconditionally in production.
 */

importScripts('/workbox/workbox-sw.js');

if (typeof workbox !== 'undefined' && workbox) {
  workbox.setConfig({ modulePathPrefix: '/workbox/' });
  workbox.core.setCacheNameDetails({ prefix: 'quilty', suffix: 'v1' });
  workbox.precaching.cleanupOutdatedCaches();
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  // BCP 47 locale prefix: 2+ ASCII letters with optional `-<subtag>`
  // segments. Matches `/en/`, `/pt-BR/`, `/zh-Hant/`. Case-insensitive
  // by spec, so we test against `.toLowerCase()` form below.
  const ACCOUNT_LOCALE_RE = /^\/[a-z]{2,}(-[a-z0-9]+)*\/account\//;
  const EXCLUDED_PATH_PATTERNS = [
    /^\/api\/auth\//,
    /^\/api\/contact$/,
    /^\/api\/csp-report$/,
    /^\/api\/dsar\//,
    /^\/api\/webhooks\//,
    /\?_rsc=/,
    /\/sentry-tunnel/,
    /\/posthog-tunnel/,
  ];

  function isExcluded(url, request) {
    // Defense-in-depth #1: any non-GET HTTP method bypasses the SW
    // cache entirely. Server Actions are POST to the same route URLs
    // a navigation would use; without this guard, a Workbox routing
    // rule might intercept the response and cache it. Belt-and-braces
    // beyond the per-strategy `request.mode === 'navigate'` checks.
    if (request.method !== 'GET') return true;

    const path = url.pathname.toLowerCase();
    if (ACCOUNT_LOCALE_RE.test(path)) return true;
    const pathAndSearch = path + url.search;
    return EXCLUDED_PATH_PATTERNS.some((re) => re.test(pathAndSearch));
  }

  // Cache-first: static assets + fonts + icons + manifest.
  workbox.routing.registerRoute(
    ({ url, request }) =>
      !isExcluded(url, request) &&
      (url.pathname.startsWith('/_next/static/') ||
        url.pathname.startsWith('/static/') ||
        url.pathname.startsWith('/workbox/') ||
        request.destination === 'font' ||
        url.pathname.endsWith('.ico') ||
        url.pathname.endsWith('webmanifest')),
    new workbox.strategies.CacheFirst({
      cacheName: 'quilty-static-v1',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        }),
      ],
    }),
  );

  // NetworkFirst (3s timeout) for navigations + HTML.
  workbox.routing.registerRoute(
    ({ request, url }) =>
      !isExcluded(url, request) &&
      (request.mode === 'navigate' || request.destination === 'document'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'quilty-html-v1',
      networkTimeoutSeconds: 3,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24, // 1 day
        }),
      ],
    }),
  );

  // Explicit network-only for excluded paths — defense-in-depth so a
  // misconfigured strategy can't accidentally cache PHI-adjacent
  // routes.
  workbox.routing.registerRoute(
    ({ url, request }) => isExcluded(url, request),
    new workbox.strategies.NetworkOnly(),
  );

  // Logout flush: post message from sign-out handler triggers a
  // three-step purge — clear all caches, unregister this SW, post
  // back so the client can hard-reload. Per ADR-0022 Decision D
  // (revised post-Phase-A) + OAuth-flow shared-device canon.
  // Consumer: clearServiceWorkerCaches() in apps/web/lib/sw/register.ts
  // (will be wired into the sign-out Route Handler at M6 auth).
  self.addEventListener('message', async (event) => {
    if (!event.data || event.data.type !== 'LOGOUT_CLEAR_CACHES') return;
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      // Notify the client that posted the message so it can reload.
      const source = event.source;
      if (source && 'postMessage' in source) {
        source.postMessage({ type: 'LOGOUT_CACHES_CLEARED' });
      }
    } catch (err) {
      // Best-effort; if the caches API rejects (Safari edge cases),
      // the client-side fallback in register.ts still triggers a
      // reload via the timeout path.
      console.warn('quilty-sw: LOGOUT_CLEAR_CACHES handler failed', err);
    }
  });
} else {
  // Workbox failed to load — fall back to no-op SW so the page
  // doesn't 5xx; logged but otherwise inert.
  console.warn('quilty-sw: Workbox vendor bundle unreachable; SW running in no-op mode');
}
