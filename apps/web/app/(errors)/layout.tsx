import type { Metadata } from 'next';

/**
 * Minimal-chrome layout for status-code surfaces (410 / 451 / 503).
 * Discord + Linear convention: the error/maintenance page should NOT
 * mount third-party SDKs because it's the visible fallback when the
 * SDKs are themselves failing. No SiteBanner, no analytics, no
 * cookie consent surface.
 *
 * Sits OUTSIDE the `[locale]` segment by design — these status
 * surfaces are jurisdiction-agnostic (a 503 maintenance page or a
 * 451 legal-block page renders the same regardless of locale; the
 * future i18n milestone can vary the message, but the layout shape
 * stays English-only at scaffold time).
 *
 * `<main id="main" tabIndex={-1}>` is the canonical skip-link target
 * even though there's no upstream nav to skip — keeps the WCAG 2.4.1
 * shape consistent across the site.
 *
 * `robots: { index: false, follow: false }` is set on the layout so
 * every page underneath inherits noindex via the Next.js metadata
 * cascade. The `X-Robots-Tag: noindex, nofollow` response header
 * (set by proxy.ts on the same response) is the header-side
 * defense-in-depth.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ErrorsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="bg-bg-surface min-h-screen">
      {children}
    </main>
  );
}
