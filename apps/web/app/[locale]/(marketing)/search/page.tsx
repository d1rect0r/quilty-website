import dynamic from 'next/dynamic';
import type { Metadata } from 'next';

/**
 * `<SearchInterface>` carries the entire search client surface
 * (input + results renderer + cmd-K bind). Dynamic-imported so its
 * ~10 KB gzipped weight stays out of the initial route chunk when the
 * search-enabled flag is OFF (the dominant case pre-content).
 *
 * `<ComingSoonSearch>` is the flag-OFF placeholder. Both share the
 * same dynamic-import seam so the route's first-load budget stays
 * predictable across the flag flip.
 */
const SearchInterface = dynamic(
  () =>
    import('@/components/site/SearchInterface').then((mod) => ({ default: mod.SearchInterface })),
  {
    loading: () => <SearchSkeleton />,
  },
);
const ComingSoonSearch = dynamic(() =>
  import('@/components/site/ComingSoonSearch').then((mod) => ({ default: mod.ComingSoonSearch })),
);

/**
 * /search route.
 *
 * Server-rendered shell. The flag evaluation happens server-side via
 * `getServerContainer().featureFlags`; the rendered island is either
 * `<SearchInterface>` (when `search_enabled: true`) or
 * `<ComingSoonSearch>` (when false, the default).
 *
 * Per ADR-0019 the Pagefind index is empty pre-content; the route
 * ships now so the URL + a11y + metadata + sitemap entry are locked
 * before content lands. The composition root wires the SearchIndex
 * port at the client tier (in-memory fake by default; Pagefind
 * adapter at content activation per ADR-0019 Decision H).
 */

export const metadata: Metadata = {
  title: 'Search Quilty — find articles, guides, and updates',
  description:
    'Search across Quilty articles, customer stories, and product updates. Your queries stay on your device.',
  alternates: {
    canonical: '/en/search',
    languages: { 'en-US': '/en/search', 'x-default': '/en/search' },
  },
  openGraph: {
    title: 'Search Quilty',
    description: 'Search across Quilty articles, customer stories, and product updates.',
    url: '/en/search',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Search Quilty',
    description: 'Search across Quilty articles, customer stories, and product updates.',
  },
  robots: {
    // /search itself indexable; individual result clicks lead to
    // already-indexed content. The Pagefind bundle is excluded by
    // robots.ts (the `/pagefind/*` path).
    index: true,
    follow: true,
  },
};

function SearchSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading search">
      <div className="bg-bg-elevated min-h-[44px] w-full rounded border" />
      <div className="bg-bg-elevated min-h-[120px] w-full rounded border" />
    </div>
  );
}

export default async function SearchPage(): Promise<React.JSX.Element> {
  // Server-side flag read. `getServerContainer` is the canonical
  // composition entry-point; importing the factory keeps the lazy
  // initialisation invariant intact.
  const { getServerContainer } = await import('@/lib/get-container');
  const { makeServerContainer } = await import('@/composition.server');
  const { getTypedFlag } = await import('@/lib/flags/features');
  const container = getServerContainer(makeServerContainer);
  const searchEnabled = getTypedFlag(container.featureFlags, 'search_enabled');

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-fg-default text-3xl font-semibold tracking-tight">Search Quilty</h1>
      <p className="text-fg-muted mt-2 text-base">
        Find articles, customer stories, and product updates. Your queries stay on your device.
      </p>
      <div className="mt-8">{searchEnabled ? <SearchInterface /> : <ComingSoonSearch />}</div>
    </main>
  );
}
