/**
 * TanStack Query v5 client factory — Next.js 16 App Router hydration
 * pattern (ADR-0017 Decision H).
 *
 * Server-side: a fresh `QueryClient` per request (the `cache()` wrap
 * ensures one per request boundary, not per render). Client-side: a
 * module-level singleton (lazy-initialised inside the browser).
 *
 * The 60s `staleTime` floor + 5min `gcTime` are TanStack canonical
 * defaults for SSR-hydrated queries — they prevent the client from
 * immediately re-fetching data the server prefetched, and they keep
 * the cache around long enough for back-button navigation.
 *
 * Per ADR-0017 Decision H: RSC + Server Actions remain the default
 * for server-side data; this client handles client-side caches +
 * optimistic mutations + background sync only.
 */

import { QueryClient, isServer } from '@tanstack/react-query';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 60s before refetch on revalidation — SSR-hydration friendly.
        staleTime: 60 * 1000,
        // 5min garbage-collection retention.
        gcTime: 5 * 60 * 1000,
        // Refetch on window focus is convenient but noisy; pre-launch
        // keep off until UX testing justifies it.
        refetchOnWindowFocus: false,
        // Throw errors during render so the Next.js error boundary
        // catches them — composes with apps/web/app/error.tsx.
        throwOnError: false,
      },
      mutations: {
        // Mutations never auto-retry — the api-client adapter owns
        // retry semantics (Decision C). Double-retry would compound.
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Returns the QueryClient for the current runtime.
 *
 * SERVER: per-request fresh client (the `cache()` wrapper in `app/`
 * code creates a single instance per request boundary).
 *
 * CLIENT: module-level singleton. Subsequent calls return the same
 * instance so the cache survives across re-renders.
 */
export function getQueryClient(): QueryClient {
  if (isServer) {
    // Server: always make a new client. Per-request isolation is the
    // canonical Next.js 16 + TanStack Query v5 pattern.
    return makeQueryClient();
  }
  // Browser: lazily create the singleton.
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
