import type { Metadata } from 'next';
import { SkipLink } from '@/components/site/SkipLink';
import { PortalNav } from '@/components/account/PortalNav';
import { FocusOnNavigate } from '@/components/site/FocusOnNavigate';

/**
 * Account portal layout. Hybrid nav per U1: top-nav primary at every level;
 * complex sub-screens (security, subscription) compose PortalSidebar inside
 * their own page or nested layout.
 *
 * Per ADR-0005 two-tier CSP: portal routes get the nonce + strict-dynamic
 * CSP variant in proxy.ts (Commit 5). Per ADR-0002: every portal Server
 * Component re-validates via the session store — no authorization decisions
 * in proxy.ts alone (Next.js CVE-2025-29927).
 *
 * `<main id="main" tabIndex={-1}>` is the focus target for FocusOnNavigate
 * on route changes (Round-5 a11y).
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
 * Round-5 TypeScript reviewer flagged this fragility — enforcing at type-level
 * would require a custom Next.js plugin; defensive documentation is the M1
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
    </>
  );
}
