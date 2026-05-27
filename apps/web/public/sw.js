 
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
 *
 * Security:
 *   - clients.postMessage('LOGOUT_CLEAR_CACHES') → flushes all caches.
 *   - cleanupOutdatedCaches() on activate.
 *   - Cache-Control: no-cache on /sw.js (set in proxy.ts).
 *   - CSP: worker-src 'self' (set in proxy.ts).
 *
 * Activation gate: registration logic in apps/web/lib/sw/register.ts
 * only fires in production (not `next dev`). The flag-gated install
 * prompt lives separately in <InstallPrompt>; the SW itself runs
 * unconditionally in production.
 */

importScripts(
  'https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js',
);

if (workbox) {
  workbox.core.setCacheNameDetails({ prefix: 'quilty', suffix: 'v1' });
  workbox.precaching.cleanupOutdatedCaches();
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  const EXCLUDED_PATH_PATTERNS = [
    /^\/api\/auth\//,
    /^\/api\/contact$/,
    /^\/api\/csp-report$/,
    /^\/api\/dsar\//,
    /^\/api\/webhooks\//,
    /^\/[a-z]{2}\/account\//,
    /\?_rsc=/,
    /\/sentry-tunnel/,
    /\/posthog-tunnel/,
  ];

  function isExcluded(url) {
    const path = url.pathname + url.search;
    return EXCLUDED_PATH_PATTERNS.some((re) => re.test(path));
  }

  // Cache-first: static assets + fonts + icons + manifest.
  workbox.routing.registerRoute(
    ({ url, request }) =>
      !isExcluded(url) &&
      (url.pathname.startsWith('/_next/static/') ||
        url.pathname.startsWith('/static/') ||
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
      !isExcluded(url) &&
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

  // Explicit no-cache for excluded paths — return network-only so a
  // misconfigured strategy can't accidentally cache PHI-adjacent
  // routes.
  workbox.routing.registerRoute(
    ({ url }) => isExcluded(url),
    new workbox.strategies.NetworkOnly(),
  );

  // Logout flush: post message from sign-out handler triggers full
  // cache clear so the next sign-in user sees no stale data.
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'LOGOUT_CLEAR_CACHES') {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
  });
} else {
  // Workbox failed to load — fall back to no-op SW so the page
  // doesn't 5xx; logged but otherwise inert.
  // eslint-disable-next-line no-console
  console.warn('quilty-sw: Workbox CDN unreachable; SW running in no-op mode');
}
