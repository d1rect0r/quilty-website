import Link from 'next/link';
import { SkipLink } from '@/components/site/SkipLink';
import { PortalNav } from '@/components/account/PortalNav';
import { FocusOnNavigate } from '@/components/site/FocusOnNavigate';
import type { Metadata } from 'next';

/**
 * Account portal layout. Hybrid nav per U1: top-nav primary at every level;
 * complex sub-screens (security, subscription) compose PortalSidebar inside
 * their own page or nested layout.
 *
 * Per ADR-0005 two-tier CSP: portal routes get the nonce + strict-dynamic
 * CSP variant in proxy.ts (D59). Per ADR-0002: every portal Server
 * Component re-validates via the session store — no authorization decisions
 * in proxy.ts alone (Next.js CVE-2025-29927).
 *
 * `<main id="main" tabIndex={-1}>` is the focus target for FocusOnNavigate
 * on route changes (a11y).
 */

/**
 * IMPORTANT: This `robots: { index: false, follow: false }` MUST cascade to
 * every page in the (account) route group. Next.js metadata merges per-field —
 * if any account page exports its own `metadata` block without a `robots` key,
 * inheritance works. But a future contributor who exports a full
 * `metadata: { robots: ... }` block will silently override this protection.
 *
 * Rule: account pages set `metadata.title` (and only title) at most.
 * Any other metadata field requires explicit re-statement of
 * `robots: { index: false, follow: false }`.
 *
 * TypeScript reviewer flagged this fragility — enforcing at type-level
 * would require a custom Next.js plugin; defensive documentation is the current
 * solution.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkipLink />
      <FocusOnNavigate />
      <PortalNav />
      <main id="main" tabIndex={-1} className="bg-bg-surface">
        {children}
      </main>
      {/* contentinfo landmark for AT landmark-navigation parity with
          the marketing layout. Minimal — copyright + privacy link
          satisfies SC 1.3.1 + closes the symmetry gap. `role` is
          redundant on a direct-body-child `<footer>` but defensive
          against deeper React-fragment nesting. */}
      <footer role="contentinfo" className="border-border-default bg-bg-elevated border-t">
        <div className="text-fg-muted mx-auto max-w-6xl px-6 py-4 text-sm">
          <p>
            © {new Date().getFullYear()} Quilty Inc. ·{' '}
            <Link
              href="/en/legal/privacy"
              className="hover:text-fg-default underline underline-offset-2"
            >
              Privacy
            </Link>
          </p>
        </div>
      </footer>
    </>
  );
}
