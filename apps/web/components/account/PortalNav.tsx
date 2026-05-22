import Link from 'next/link';
import { PortalNavLinks } from './PortalNavLinks';

/**
 * Top-nav portal shell (U1 hybrid pattern, primary surface). Lives in
 * `(account)/layout.tsx`. Sub-screens with deeper hierarchies (security,
 * subscription) wrap children in PortalSidebar for the secondary nav layer.
 *
 * The link list itself is a Client Component (`PortalNavLinks`) because
 * `aria-current="page"` requires `usePathname()`. The header chrome
 * stays server-rendered so the client-bundle delta is minimal.
 *
 * Real authenticated user dropdown + sign-out lands at the
 * auth-integration activation with the BFF session model (ADR-0002).
 * M1 ships a structural placeholder so the portal route-group has a
 * header reference + the layout/CSP boundary is wired.
 */
export function PortalNav() {
  return (
    <header role="banner" className="border-border-default bg-bg-elevated border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        {/* No aria-label here: WCAG 2.5.3 Label in Name. A custom aria-label
            ("Account home") that doesn't contain the visible text ("Quilty
            Account") makes voice-control users say a word they can't see.
            The link's accessible name is now its visible text. */}
        <Link href="/en/account" className="text-fg-default text-base font-semibold">
          Quilty Account
        </Link>
        <nav aria-label="Account portal">
          {/* min-h-11 (44px) per WCAG 2.5.5 Target Size AA — matches
              the marketing Header treatment. Active-link styling +
              aria-current live in the client wrapper. */}
          <PortalNavLinks />
        </nav>
      </div>
    </header>
  );
}
