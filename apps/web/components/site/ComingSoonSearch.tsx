/**
 * <ComingSoonSearch>
 *
 * Flag-OFF placeholder for the `/[locale]/search` route. Renders when
 * `features.flag('search_enabled')` is false — the default until
 * Pagefind has content to index (no MDX has shipped yet).
 *
 * Server Component — no interactivity. The flag-ON path
 * `<SearchInterface>` carries the entire client surface. Keeping
 * ComingSoonSearch server-side keeps the flag-OFF route under the
 * 60 KB per-route budget without relying on the lazy-import seam to
 * defer client weight.
 *
 * A11y: an `aria-live` region announces "Search coming soon" so
 * assistive tech treats the placeholder as a non-error empty state
 * rather than a missing-content gap.
 */

export function ComingSoonSearch(): React.JSX.Element {
  return (
    <section
      aria-labelledby="search-coming-soon-heading"
      className="border-border-default bg-bg-elevated rounded-lg border p-8 text-center"
    >
      <h2
        id="search-coming-soon-heading"
        className="text-fg-default text-xl font-semibold tracking-tight"
      >
        Search is coming soon
      </h2>
      <p className="text-fg-muted mt-3 text-sm">
        We&rsquo;re building the article + story catalog. Until then, try the navigation above or
        head to the homepage for the latest from Quilty.
      </p>
      <div aria-live="polite" className="sr-only">
        Search functionality is not yet available. Please use the site navigation.
      </div>
    </section>
  );
}
