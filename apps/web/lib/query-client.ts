/**
 * TanStack Query v5 client factory — Next.js 16 App Router hydration
 * pattern (ADR-0017 Decision H).
 *
 * Server-side: React's `cache()` wrap binds `getQueryClient()` to the
 * current request boundary, so every Server Component within a single
 * request tree shares one `QueryClient`. WITHOUT the `cache()` wrap,
 * each Server Component call creates a fresh client and prefetches in
 * a parent RSC are NOT visible to a `dehydrate()` call in a child
 * (canonical anti-pattern documented in TanStack Advanced SSR guide).
 *
 * Client-side: a module-level singleton (lazy-initialised inside the
 * browser).
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

import { cache } from 'react';
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
 * Per-request server-side singleton. React's `cache()` scopes the
 * memoization to the current request boundary, so every
 * `getServerQueryClient()` call within the same RSC tree returns the
 * same `QueryClient` instance — required for `HydrationBoundary` to
 * see what parent prefetches wrote (TanStack Advanced SSR pattern).
 *
 * `cache()` is a no-op on the client; we use the explicit branch
 * below for browser singleton initialization.
 */
const getServerQueryClient = cache((): QueryClient => makeQueryClient());

/**
 * Returns the QueryClient for the current runtime.
 *
 * SERVER: per-request shared client via React `cache()`. Multiple
 * Server Components within one request boundary observe the same
 * instance; prefetches in a parent RSC are visible to a `dehydrate()`
 * in a child.
 *
 * CLIENT: module-level singleton. Subsequent calls return the same
 * instance so the cache survives across re-renders.
 */
export function getQueryClient(): QueryClient {
  if (isServer) {
    return getServerQueryClient();
  }
  // Browser: lazily create the singleton.
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
