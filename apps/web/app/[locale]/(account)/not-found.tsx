import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Portal-tier 404. Renders inside the (account) layout — PortalNav +
 * SkipLink stay intact so a signed-in user who hit a removed-route
 * URL (e.g., bookmark to a deprecated portal sub-screen) can navigate
 * elsewhere via the chrome.
 *
 * `robots: noindex, nofollow` inherited from the (account) layout
 * cascade — no re-declaration here (the layout comment explicitly
 * warns about re-declaring metadata blocks silently breaking the
 * noindex cascade).
 *
 * Title-only metadata per the (account) layout discipline.
 */
export const metadata: Metadata = {
  title: 'Page not found',
};

export default function AccountNotFound() {
  return (
    <section
      aria-labelledby="account-notfound-heading"
      className="mx-auto max-w-2xl px-6 py-16 text-center"
    >
      <p className="text-fg-muted text-sm font-medium">404</p>
      <h1 id="account-notfound-heading" className="text-fg-default mt-2 text-3xl font-semibold">
        Page not found
      </h1>
      <p className="text-fg-muted mt-4">
        That portal URL doesn&apos;t lead anywhere we recognize. Your session is still active.
      </p>
      <Link
        href="/en/account"
        className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover mt-8 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4"
      >
        Back to profile
      </Link>
    </section>
  );
}
