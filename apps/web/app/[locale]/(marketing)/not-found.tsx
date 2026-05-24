import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Marketing-tier 404 — invoked when `notFound()` from `next/navigation`
 * fires inside a `(marketing)/*` route, OR when an unmatched URL
 * resolves into the (marketing) route group (Next.js cascades to the
 * nearest not-found.tsx).
 *
 * Renders INSIDE the marketing layout — Header + Footer + SkipLink
 * stay intact so users can navigate elsewhere via the chrome rather
 * than being dropped into a bare full-screen 404. The apex
 * `apps/web/app/not-found.tsx` covers URLs that don't resolve to any
 * route group; this file covers `notFound()`-inside-marketing.
 *
 * Next.js auto-emits status 404 + `<meta name="robots" content="noindex">`
 * for the not-found.tsx file convention.
 *
 * NO `<main id="main">` here — the marketing layout owns it.
 */
export const metadata: Metadata = {
  title: 'Page not found',
};

export default function MarketingNotFound() {
  return (
    <section
      aria-labelledby="marketing-notfound-heading"
      className="mx-auto max-w-2xl px-6 py-24 text-center"
    >
      <p className="text-fg-muted text-sm font-medium">404</p>
      <h1 id="marketing-notfound-heading" className="text-fg-default mt-2 text-4xl font-semibold">
        Page not found
      </h1>
      <p className="text-fg-muted mt-4">
        That URL doesn&apos;t lead anywhere we recognize. The URL may have moved or been retired.
      </p>
      <Link
        href="/en"
        className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover mt-8 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4"
      >
        Back to home
      </Link>
    </section>
  );
}
