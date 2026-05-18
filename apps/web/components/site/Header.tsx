import Link from 'next/link';

/**
 * Marketing-tier site header. Lives only in (marketing)/layout.tsx — the
 * portal has its own PortalNav per U1. Real branding + nav items land in
 * M3 identity discovery; M1 ships a structural placeholder so layout/CSP
 * hooks have something to wrap.
 */
export function Header() {
  return (
    <header
      role="banner"
      className="border-b border-border-default bg-bg-elevated"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/en"
          className="text-lg font-semibold text-fg-default"
          aria-label="Quilty home"
        >
          Quilty
        </Link>
        <nav aria-label="Primary">
          {/* Real nav items land in M2 with the marketing IA scope (per U2).
              Every interactive element has min-h-11 (44px) to satisfy WCAG 2.5.5
              Target Size (AA) — Round-5 a11y reviewer finding. */}
          <ul className="flex items-center gap-2 text-sm text-fg-muted">
            <li>
              <Link
                href="/en/features"
                className="flex min-h-11 items-center px-3 hover:text-fg-default"
              >
                Features
              </Link>
            </li>
            <li>
              <Link
                href="/en/pricing"
                className="flex min-h-11 items-center px-3 hover:text-fg-default"
              >
                Pricing
              </Link>
            </li>
            <li>
              <Link
                href="/en/science"
                className="flex min-h-11 items-center px-3 hover:text-fg-default"
              >
                Science
              </Link>
            </li>
            <li>
              <Link
                href="/en/account"
                className="flex min-h-11 items-center rounded-md bg-accent-primary px-4 text-accent-fg hover:bg-accent-primary-hover"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
