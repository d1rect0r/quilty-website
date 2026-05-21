'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Route-change focus handler.
 *
 * Next.js App Router does NOT reset focus on client-side navigation
 * (open Next.js issue #49386). Without this, screen-reader users land
 * on a new page with no announcement of the page change — focus stays
 * on the just-clicked link, which is now in the previous page's history.
 *
 * Pattern: on every pathname change AFTER the initial hydration, move
 * focus to `<main id="main">`. The `<main>` must have `tabIndex={-1}`
 * (set in the layouts) so it can receive programmatic focus without
 * being in the tab order itself.
 *
 * The `hasMountedRef` gate is load-bearing: without it, focus is stolen
 * on initial hydration before the user has a chance to tab to the
 * SkipLink — keyboard users would never reach it. The skip-link is the
 * canonical WCAG 2.4.1 "bypass blocks" mechanism, so this guard is the
 *(Footer / SkipLink reachability).
 */
export function FocusOnNavigate() {
  const pathname = usePathname();
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    const main = document.getElementById('main');
    if (main) {
      main.focus({ preventScroll: true });
    }
  }, [pathname]);

  return null;
}
