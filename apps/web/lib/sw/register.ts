/**
 * Service Worker registration — client-only.
 *
 * Invoked from a client island in the root layout. Production-only
 * by design: `next dev` uses Turbopack with HMR + on-demand chunk
 * resolution, neither of which plays nicely with cache-first SW
 * strategies (per ADR-0022 §Dev-mode behaviour).
 *
 * Fires on the `load` event so the registration doesn't compete
 * with critical-path resource fetches; first-load LCP isn't blocked
 * by the SW install.
 *
 * Phase-A D4-B4 fix: registration errors now route through the
 * client container's errorReporter chokepoint (Sentry-wrapped),
 * NOT a swallowed catch. `window.onerror` does not capture
 * Promise rejections from event listeners, so the prior
 * empty-catch silently lost CSP-blocked / quota-exceeded failures.
 */

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV !== 'production') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(async (err: unknown) => {
      // Lazy-import the container factory so the registrar island
      // doesn't drag composition.client + the full observability
      // chain into the initial chunk graph for the registrar's
      // bundle. Registration failure is a cold path; the dynamic
      // import is acceptable here per Phase-C perf Warning #2.
      try {
        const [{ getClientContainer }, { makeClientContainer }] = await Promise.all([
          import('@/lib/get-container'),
          import('@/composition.client'),
        ]);
        const container = getClientContainer(makeClientContainer);
        const error = err instanceof Error ? err : new Error('Service Worker registration failed');
        container.errorReporter.captureException(error, {
          boundary: 'sw-register',
          scope: 'service-worker',
        });
        container.logger.warn('sw_registration_failed', {
          boundary: 'sw-register',
          error_name: error.name,
        });
      } catch {
        // If the container factory itself fails to dynamic-import,
        // the SW registration failure is unrecoverable; silent
        // swallow matches Web Almanac 2024 canon for SW errors.
      }
    });
  });
}

/**
 * Logout signal — invoked by the sign-out handler so the active SW
 * flushes all caches, unregisters itself, then posts back so this
 * client side can hard-reload.
 *
 * The SW responds with `{ type: 'LOGOUT_CACHES_CLEARED' }`; the
 * `messageHandler` here drives the reload so the next sign-in user
 * lands on a freshly fetched page with no stale SW state.
 *
 * TODO(auth-integration): wire `clearServiceWorkerCaches()` from
 * the sign-out Route Handler client callback when real-auth lands
 * (tracked at TW-014 in docs/runbook/trigger-watchlist.md).
 * Without this call, shared-device scenarios expose cached portal
 * responses to the next user — see ADR-0022 §Decision D for the
 * design contract.
 */
export function clearServiceWorkerCaches(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => {
      const messageHandler = (event: MessageEvent): void => {
        if (event.data && event.data.type === 'LOGOUT_CACHES_CLEARED') {
          navigator.serviceWorker.removeEventListener('message', messageHandler);
          window.location.reload();
        }
      };
      navigator.serviceWorker.addEventListener('message', messageHandler);
      registration.active?.postMessage({ type: 'LOGOUT_CLEAR_CACHES' });
      // Fallback hard-reload if the SW doesn't ack within 2s
      // (Safari edge cases where the message event doesn't fire).
      window.setTimeout(() => {
        navigator.serviceWorker.removeEventListener('message', messageHandler);
        window.location.reload();
      }, 2000);
    })
    .catch(() => undefined);
}
