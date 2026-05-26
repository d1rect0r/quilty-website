import Link from 'next/link';

/**
 * Marketing-tier site header. Lives only in (marketing)/layout.tsx — the
 * portal has its own PortalNav per U1. Real branding + nav items land at
 * the identity-discovery milestone; today the scaffold ships a structural
 * placeholder so layout/CSP hooks have something to wrap.
 */
export function Header() {
  return (
    <header role="banner" className="border-border-default bg-bg-elevated border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/en" className="text-fg-default text-lg font-semibold" aria-label="Quilty home">
          Quilty
        </Link>
        <nav aria-label="Primary">
          {/* Real nav items land at the marketing-content milestone (per U2).
              Every interactive element has min-h-11 (44px) to satisfy WCAG 2.5.5
              Target Size (AA) — a11y reviewer finding. */}
          <ul className="text-fg-muted flex items-center gap-2 text-sm">
            <li>
              <Link
                href="/en/features"
                className="hover:text-fg-default flex min-h-11 items-center px-3"
              >
                Features
              </Link>
            </li>
            <li>
              <Link
                href="/en/pricing"
                className="hover:text-fg-default flex min-h-11 items-center px-3"
              >
                Pricing
              </Link>
            </li>
            <li>
              <Link
                href="/en/science"
                className="hover:text-fg-default flex min-h-11 items-center px-3"
              >
                Science
              </Link>
            </li>
            <li>
              <Link
                href="/en/account"
                className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover flex min-h-11 items-center rounded-md px-4"
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
