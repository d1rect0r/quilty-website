'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/sw/register';

/**
 * Client island that registers the Service Worker on mount.
 *
 * Rendered from `app/layout.tsx` so registration fires once per
 * full-page navigation, NOT once per route change (App Router
 * keeps client components mounted across navigations within the
 * same layout).
 *
 * The component is intentionally render-less; it exists purely
 * for the `useEffect` lifecycle.
 */
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
