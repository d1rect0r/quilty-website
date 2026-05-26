'use client';

/**
 * Toast surface wrapper (ADR-0017 Decision I).
 *
 * Wraps the third-party Toaster component at the app-tier per D18
 * "wrap don't edit" — the underlying library is a vendor; consumers
 * call into `apps/web/lib/toast.ts` rather than importing the vendor
 * directly. This keeps the toast surface vendor-agnostic at call
 * sites (the visual-identity reskin trigger lands without touching consumer
 * code).
 *
 * Mounted ONCE at the root layout. Subsequent `toast.info(...)` calls
 * from anywhere in the tree route through the singleton.
 *
 * The shadcn-canonical `components/ui/sonner.tsx` primitive was not
 * scaffolded at install time (the shadcn CLI cache hit a permission
 * issue locally). The wrapper here implements the same surface
 * directly; if shadcn-add is run later, the import line below moves
 * to `@/components/ui/sonner` without changing the consumer API.
 */

import { Toaster as Sonner } from 'sonner';

interface ToastProviderProps {
  readonly position?: 'top-right' | 'top-center' | 'bottom-right' | 'bottom-center';
}

/**
 * The Sonner Toaster is a Client Component that internally handles
 * its own browser-only rendering (no hydration mismatch). The earlier
 * `useEffect`-driven mount-guard pattern is now flagged by the React
 * 19 `react-hooks/set-state-in-effect` rule as an anti-pattern; the
 * `'use client'` directive on this file is sufficient.
 */
export function ToastProvider({ position = 'top-right' }: ToastProviderProps) {
  return (
    <Sonner
      position={position}
      richColors
      closeButton
      // Keep the duration consistent with apps/web/lib/toast.ts defaults.
      toastOptions={{
        duration: 3000,
      }}
    />
  );
}
