/**
 * Portal-tier loading skeleton (D115).
 *
 * Rendered as the Suspense fallback for the entire (account) route
 * group. PortalNav stays mounted (the user is signed in + needs to
 * see their tab context); the skeleton replaces the page body only.
 *
 * Shimmer style matches the portal's interior surface (`bg-bg-surface`
 * background from the portal layout); skeleton blocks use
 * `bg-bg-elevated` so they're visually distinct from the surface
 * even at the AA contrast floor.
 */
export default function AccountLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading"
      className="mx-auto max-w-4xl px-6 py-10"
    >
      <div className="bg-bg-elevated h-8 w-1/3 animate-pulse rounded-md" />
      <div className="bg-bg-elevated mt-4 h-4 w-2/3 animate-pulse rounded-md" />

      <div className="mt-10 space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border-border-default rounded-lg border p-6">
            <div className="bg-bg-elevated h-6 w-1/4 animate-pulse rounded-md" />
            <div className="mt-3 space-y-2">
              <div className="bg-bg-elevated h-4 w-full animate-pulse rounded-md" />
              <div className="bg-bg-elevated h-4 w-5/6 animate-pulse rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
