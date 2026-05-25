import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * 410 Gone (RFC 7231 §6.5.9).
 *
 * Rendered when proxy.ts rewrites a request to `/410` because the
 * URL is in the 410 allowlist (sunset content; reserved for the
 * content lifecycle work — empty allowlist today). HTTP
 * status 410 is the right code (vs 404) because:
 *   - Search engines drop 410 URLs from the index faster than 404
 *     (Google's John Mueller confirmation; independent SEO tests).
 *   - Well-behaved SDK clients stop retrying on 410 but treat 404
 *     as transient.
 *
 * No retry CTA — 410 means "intentionally + permanently gone." The
 * primary action is navigation to the marketing home; secondary is
 * support contact if the user believes the URL should still resolve.
 *
 * `robots: noindex, nofollow` inherited from the (errors) layout
 * cascade.
 */
export const metadata: Metadata = {
  title: 'Gone',
};

export default function GonePage() {
  return (
    <section aria-labelledby="gone-heading" className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-fg-muted text-sm font-medium">410</p>
      <h1 id="gone-heading" className="text-fg-default mt-2 text-4xl font-semibold">
        This page is gone
      </h1>
      <p className="text-fg-muted mt-4">
        The URL you followed pointed to content we’ve intentionally retired. It won’t come back.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/en"
          className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4"
        >
          Go home
        </Link>
      </div>
    </section>
  );
}
