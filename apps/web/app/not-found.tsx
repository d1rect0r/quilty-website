import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found',
};

/**
 * 404 page. Next.js auto-emits status 404 + `<meta name="robots" content="noindex">`
 * for this file convention. Never stream JSX before `notFound()` is
 * called (status locks to 200 — soft-404 trap).
 *
 * This file renders directly inside `app/layout.tsx`'s `<body>` — it
 * does NOT route through the (marketing) or (account) group layouts,
 * so it must provide its own `<main>` landmark + skip-link target per
 * WCAG 2.4.1.
 */
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1}>
      <section
        aria-labelledby="notfound-heading"
        className="mx-auto max-w-2xl px-6 py-24 text-center"
      >
        <p className="text-fg-muted text-sm font-medium">404</p>
        <h1 id="notfound-heading" className="text-fg-default mt-2 text-4xl font-semibold">
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
    </main>
  );
}
