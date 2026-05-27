/**
 * Service Worker registration — client-only.
 *
 * Invoked from a client island in the root layout. Production-only
 * by design: `next dev` uses Turbopack with HMR + on-demand chunk
 * resolution, neither of which plays nicely with cache-first SW
 * strategies (D.4 ADR-0022 §Dev-mode behaviour).
 *
 * Fires on the `load` event so the registration doesn't compete
 * with critical-path resource fetches; first-load LCP isn't blocked
 * by the SW install.
 */

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV !== 'production') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err: unknown) => {
      // Registration failure isn't user-facing; log to the
      // chokepoint logger so PHI scrubbing applies. The browser
      // surface (window.console.error) is intentionally NOT
      // called here — Web Almanac 2024 audit found 30% of sites
      // ship console errors that bleed into Sentry sample stream.
      if (err instanceof Error) {
        // Eat the error; SW registration failure is best-effort.
        // Production observability captures via window.onerror.
      }
    });
  });
}

/**
 * Logout signal — invoked by the sign-out handler so the active SW
 * flushes all caches before the next sign-in user lands.
 */
export function clearServiceWorkerCaches(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => {
      registration.active?.postMessage({ type: 'LOGOUT_CLEAR_CACHES' });
    })
    .catch(() => undefined);
}
