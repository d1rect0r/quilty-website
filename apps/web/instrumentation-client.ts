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
type RouterTransitionHook = (href: string, navigationType: 'push' | 'replace' | 'traverse') => void;
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

/**
 * Skip Sentry client init on a hard-load of the `app/(errors)/` status routes
 * (410 / 451 / 503). PRIMARY reason: these surfaces render with NO consent
 * surface (the (errors) layout omits SiteBanner), so starting Sentry's client
 * Session Replay there captures a session BEFORE consent is resolvable — the
 * consent-timing defect ePrivacy Art 5(3) and the multi-state baseline
 * (ADR-0024) forbid (the 503 is the worst case: the banner is structurally
 * absent). SECONDARY: error pages are the visible fallback when SDKs are
 * themselves failing, so a SDK-free shell is also more robust.
 *
 * Server-side error capture is UNAFFECTED — instrumentation.ts (D56) captures
 * the 503-generating error independently of this client gate, so the only loss
 * is pure-client-side JS errors in the error-page React tree (a narrow
 * surface). Init is a once-per-hard-load hook and error pages are reached by
 * direct hit / redirect, so SPA-navigation coverage loss is moot.
 *
 * NOTE: this gates the error-route subset; the broader "gate Replay behind
 * resolved consent on every pre-consent surface" (ADR-0028 ConsentState) is a
 * separate follow-up — `replaysOnErrorSampleRate` can fire pre-consent
 * elsewhere too. Keep in sync with the `(410|451|503)` noindex pattern in
 * proxy.ts: if locale-prefixed error routes (e.g. /en/503) are added, widen both.
 */
const MINIMAL_CHROME_ROUTES = /^\/(410|451|503)$/;
function isMinimalChromeRoute(): boolean {
  return typeof window !== 'undefined' && MINIMAL_CHROME_ROUTES.test(window.location.pathname);
}

if (shouldInitializeSentryClient() && typeof window !== 'undefined' && !isMinimalChromeRoute()) {
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
