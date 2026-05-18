import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found',
};

/**
 * 404 page. Next.js auto-emits status 404 + `<meta name="robots" content="noindex">`
 * for this file convention. Per Round-5 SEO agent: never stream JSX before
 * `notFound()` is called (status locks to 200 — soft-404 trap).
 *
 * This file renders directly inside `app/layout.tsx`'s `<body>` — it does NOT
 * route through the (marketing) or (account) group layouts, so it must
 * provide its own `<main>` landmark + skip-link target per WCAG 2.4.1
 * (Round-5 a11y reviewer finding).
 */
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1}>
      <section className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="text-sm font-medium text-fg-muted">404</p>
        <h1 className="mt-2 text-4xl font-semibold text-fg-default">
          Page not found
        </h1>
        <p className="mt-4 text-fg-muted">
          That URL doesn&apos;t lead anywhere we recognize. The URL may have
          moved or been retired.
        </p>
        <Link
          href="/en"
          className="mt-8 inline-block rounded-md bg-accent-primary px-4 py-2.5 text-accent-fg hover:bg-accent-primary-hover"
        >
          Back to home
        </Link>
      </section>
    </main>
  );
}
