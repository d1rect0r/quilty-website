import Link from 'next/link';

/**
 * Top-nav portal shell (U1 hybrid pattern, primary surface). Lives in
 * `(account)/layout.tsx`. Sub-screens with deeper hierarchies (security,
 * subscription) wrap children in PortalSidebar for the secondary nav layer.
 *
 * Real authenticated user dropdown + sign-out lands in M6 with the BFF
 * session model (ADR-0002). M1 ships a structural placeholder so the
 * portal-route-group has a header reference + the layout/CSP boundary
 * is wired.
 */
export function PortalNav() {
  return (
    <header role="banner" className="border-border-default bg-bg-elevated border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        {/* No aria-label here: WCAG 2.5.3 Label in Name. A custom aria-label
            ("Account home") that doesn't contain the visible text ("Quilty
            Account") makes voice-control users say a word they can't see
            . The link's accessible name is
            now its visible text. */}
        <Link href="/en/account" className="text-fg-default text-base font-semibold">
          Quilty Account
        </Link>
        <nav aria-label="Account">
          {/* min-h-11 (44px) per WCAG 2.5.5 Target Size AA — same treatment as
              the marketing Header per architecture lock a11y reviewer cross-check. */}
          <ul className="text-fg-muted flex items-center gap-1 text-sm">
            <li>
              <Link
                href="/en/account"
                className="hover:text-fg-default flex min-h-11 items-center px-3"
              >
                Profile
              </Link>
            </li>
            <li>
              <Link
                href="/en/account/security"
                className="hover:text-fg-default flex min-h-11 items-center px-3"
              >
                Security
              </Link>
            </li>
            <li>
              <Link
                href="/en/account/subscription"
                className="hover:text-fg-default flex min-h-11 items-center px-3"
              >
                Subscription
              </Link>
            </li>
            <li>
              <Link
                href="/en/account/data"
                className="hover:text-fg-default flex min-h-11 items-center px-3"
              >
                Data
              </Link>
            </li>
            <li>
              <Link
                href="/en/account/notifications"
                className="hover:text-fg-default flex min-h-11 items-center px-3"
              >
                Notifications
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
