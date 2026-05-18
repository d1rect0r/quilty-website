'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Route-change focus handler.
 *
 * Next.js App Router does NOT reset focus on client-side navigation
 * (open Next.js issue #49386). Without this, screen-reader users land
 * on a new page with no announcement of the page change — focus stays
 * on the just-clicked link, which is now in the previous page's history.
 *
 * Pattern: on every pathname change, move focus to `<main id="main">`.
 * The `<main>` must have `tabIndex={-1}` (set in the layouts) so it can
 * receive programmatic focus without being in the tab order itself.
 *
 * Per Round-5 a11y agent: this is the canonical 2026 community pattern
 * for App Router until Next.js ships native focus management.
 */
export function FocusOnNavigate() {
  const pathname = usePathname();

  useEffect(() => {
    const main = document.getElementById('main');
    if (main) {
      // preventScroll: true — focus the landmark for AT but let the
      // router handle scroll restoration. Round-5 a11y reviewer flagged
      // the default (false) as causing jarring scroll-to-top on every
      // navigation, including anchor links within the page.
      main.focus({ preventScroll: true });
    }
  }, [pathname]);

  return null;
}
