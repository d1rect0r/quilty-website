/**
 * Marketing-tier loading skeleton (D115).
 *
 * Rendered by Next.js as the Suspense fallback for the entire
 * (marketing) route group while RSC streams resolve. Stays inside
 * the marketing layout — Header + Footer + SkipLink remain visible
 * + the skeleton replaces only the page body. Keeps layout chrome
 * stable across navigations (no CLS).
 *
 * Skeleton shape mirrors a typical marketing-page hero + body block:
 * heading + sub-heading + 2 paragraphs of muted-fg blocks. `aria-busy`
 * tells AT this is a loading region; `aria-live="polite"` lets the
 * announcement queue up without interrupting other speech (the
 * actual page content's focus management takes over when streaming
 * completes).
 */
export default function MarketingLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading"
      className="mx-auto max-w-3xl px-6 py-24"
    >
      <div className="bg-bg-elevated h-10 w-2/3 animate-pulse rounded-md" />
      <div className="bg-bg-elevated mt-4 h-6 w-1/2 animate-pulse rounded-md" />
      <div className="mt-12 space-y-3">
        <div className="bg-bg-elevated h-4 w-full animate-pulse rounded-md" />
        <div className="bg-bg-elevated h-4 w-full animate-pulse rounded-md" />
        <div className="bg-bg-elevated h-4 w-5/6 animate-pulse rounded-md" />
      </div>
      <div className="mt-8 space-y-3">
        <div className="bg-bg-elevated h-4 w-full animate-pulse rounded-md" />
        <div className="bg-bg-elevated h-4 w-3/4 animate-pulse rounded-md" />
      </div>
    </section>
  );
}
