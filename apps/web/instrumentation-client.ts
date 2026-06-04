/**
 * Sentry CLIENT initialization entrypoint (Next.js 16 + @sentry/nextjs 10
 * convention).
 *
 * This is the canonical browser-init file: Next.js auto-loads
 * `instrumentation-client.ts` on the client, and `withSentryConfig`
 * (next.config.ts) wires it into the build. It REPLACES the legacy
 * `sentry.client.config.ts` (deleted) — which was orphaned (nothing
 * imported it) so `Sentry.init` never ran on the client.
 *
 * Critical-path discipline (ADR-0018): this file does NOT statically
 * import `@sentry/nextjs`. Because Next.js auto-loads it on every page,
 * a static import would pull the ~48 KB-gzipped Sentry SDK into the
 * shared first-load runtime (framework/main/webpack chunks) on EVERY
 * route — blowing the first-load budgets. Instead, the entire init lives
 * in `lib/observability/sentry-client-init.ts`, dynamically `import()`ed
 * on browser idle so the SDK lands in a separate lazy vendor chunk. The
 * DSN gate below is deliberately SDK-free so the chunk is never fetched
 * without a real, CSP-coherent DSN.
 */

/**
 * Gate Sentry init on a CSP-coherent DSN host. The portal CSP
 * `connect-src` only allows the pinned `o<orgId>.ingest.us.sentry.io`
 * subdomain (per the csp-builder `pinnedSentryHostOrNull` policy).
 * If the DSN points at a non-pinned host, every SDK POST would be
 * CSP-blocked and the browser would emit a violation report on
 * every transport attempt — a runaway feedback loop where every
 * CSP-violation report itself fires a CSP-violation report.
 *
 * Returning `false` here skips the dynamic import of the init module
 * entirely; without a real canonical DSN the Sentry vendor chunk is
 * never even fetched. Operators see no Sentry events until they
 * provision a real canonical DSN — which is why this wiring is safe to
 * land before the Sentry project + DSN are provisioned at deploy.
 */
function shouldInitializeSentryClient(): boolean {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (typeof dsn !== 'string' || dsn.trim().length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  // Same shape the CSP pin enforces server-side.
  return /^o[0-9]+\.ingest\.us\.sentry\.io$/.test(parsed.hostname);
}

/**
 * Holds the lazily-loaded `Sentry.captureRouterTransitionStart` once the
 * init module has resolved. Before then it stays `undefined` and the
 * exported `onRouterTransitionStart` wrapper is a no-op — early App
 * Router navigations (fired before idle init completes) are simply not
 * instrumented, which is acceptable for client transition spans.
 */
type RouterTransitionHook = (href: string, navigationType: string) => void;
let routerTransitionHook: RouterTransitionHook | undefined;

/**
 * Defer the Sentry SDK load to browser idle so it never competes with
 * first paint or hydration. `requestIdleCallback` is preferred; the
 * `setTimeout(…, 0)` fallback covers browsers without it (Safari).
 */
function scheduleIdle(callback: () => void): void {
  if (typeof window === 'undefined') return;
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (typeof idle === 'function') {
    idle(callback);
  } else {
    setTimeout(callback, 0);
  }
}

if (shouldInitializeSentryClient() && typeof window !== 'undefined') {
  scheduleIdle(() => {
    // Dynamic import: the @sentry/nextjs SDK + init code resolve into a
    // separate async chunk, kept off the shared first-load runtime.
    void import('./lib/observability/sentry-client-init')
      .then(({ initSentryClient }) => {
        routerTransitionHook = initSentryClient();
      })
      .catch(() => {
        // Sentry unavailable (offline / chunk fetch failure). The app
        // continues without client error reporting; losing telemetry is
        // acceptable, losing the app to an init throw is not.
      });
  });
}

/**
 * Instruments App Router client-side navigations (the v10
 * `instrumentation-client.ts` API). Exported as a thin wrapper that
 * delegates to the lazily-loaded `Sentry.captureRouterTransitionStart`
 * once the init module has resolved; before then it is a no-op. Safe to
 * export unconditionally — it never references the Sentry SDK directly.
 */
export const onRouterTransitionStart: RouterTransitionHook = (href, navigationType) => {
  routerTransitionHook?.(href, navigationType);
};
