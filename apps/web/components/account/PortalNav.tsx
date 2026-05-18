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
    <header
      role="banner"
      className="border-b border-border-default bg-bg-elevated"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link
          href="/en/account"
          className="text-base font-semibold text-fg-default"
          aria-label="Account home"
        >
          Quilty Account
        </Link>
        <nav aria-label="Account">
          {/* min-h-11 (44px) per WCAG 2.5.5 Target Size AA — same treatment as
              the marketing Header per Round-5 a11y reviewer cross-check. */}
          <ul className="flex items-center gap-1 text-sm text-fg-muted">
            <li>
              <Link
                href="/en/account"
                className="flex min-h-11 items-center px-3 hover:text-fg-default"
              >
                Profile
              </Link>
            </li>
            <li>
              <Link
                href="/en/account/security"
                className="flex min-h-11 items-center px-3 hover:text-fg-default"
              >
                Security
              </Link>
            </li>
            <li>
              <Link
                href="/en/account/subscription"
                className="flex min-h-11 items-center px-3 hover:text-fg-default"
              >
                Subscription
              </Link>
            </li>
            <li>
              <Link
                href="/en/account/data"
                className="flex min-h-11 items-center px-3 hover:text-fg-default"
              >
                Data
              </Link>
            </li>
            <li>
              <Link
                href="/en/account/notifications"
                className="flex min-h-11 items-center px-3 hover:text-fg-default"
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
