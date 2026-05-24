/**
 * Legal-tier loading skeleton (D115).
 *
 * Same skeleton primitive as the marketing-tier loading.tsx but
 * shaped for the longer-prose layout of /legal/* pages (multiple
 * h2 sections + dense paragraph blocks). The most-specific
 * `loading.tsx` in the segment tree wins, so this file is what
 * users see while any `/legal/*` route's RSC stream resolves.
 *
 * The marketing layout's Header + Footer + SkipLink stay intact —
 * only the page body is replaced with the skeleton.
 */
export default function LegalLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading"
      className="mx-auto max-w-3xl px-6 py-24"
    >
      <div className="bg-bg-elevated h-12 w-3/4 animate-pulse rounded-md" />
      <div className="bg-bg-elevated mt-6 h-4 w-full animate-pulse rounded-md" />
      <div className="bg-bg-elevated mt-3 h-4 w-11/12 animate-pulse rounded-md" />
      <div className="bg-bg-elevated mt-3 h-4 w-5/6 animate-pulse rounded-md" />

      <div className="mt-12 space-y-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>
            <div className="bg-bg-elevated h-7 w-1/2 animate-pulse rounded-md" />
            <div className="mt-4 space-y-3">
              <div className="bg-bg-elevated h-4 w-full animate-pulse rounded-md" />
              <div className="bg-bg-elevated h-4 w-full animate-pulse rounded-md" />
              <div className="bg-bg-elevated h-4 w-3/4 animate-pulse rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
