'use client';

/**
 * Root-layout providers (ADR-0017 Decisions H + I).
 *
 * Mounts the TanStack Query v5 client (client-side cache + mutations
 * + optimistic UI) + the toast surface (retry-visibility UX). Pure
 * client component; everything inside is browser-only.
 *
 * Server Components above this boundary continue to fetch via
 * Server Actions + RSC; this provider is the bridge for whatever
 * client-side state below needs the query + toast wiring.
 *
 * Composition order:
 *   QueryClientProvider → ReactQueryDevtools (dev only) → ToastProvider
 *                       → children
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getQueryClient } from '@/lib/query-client';
import { ToastProvider } from './ToastProvider';
import type { ReactNode } from 'react';

interface ProvidersProps {
  readonly children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Read the QueryClient via the factory — server renders see a
  // per-request instance, client renders see the module-singleton.
  // See `apps/web/lib/query-client.ts` for the lazy-initialisation
  // discipline that survives Next.js 16 webpack chunk-splitting.
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ToastProvider />
      {/* Devtools render only in dev (Next.js NODE_ENV check inside the
          @tanstack/react-query-devtools package). They are tree-shaken
          out of the production client bundle. */}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
