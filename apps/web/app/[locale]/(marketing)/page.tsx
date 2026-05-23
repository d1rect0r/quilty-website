import { buildBreadcrumbsJsonLd, buildSoftwareApplicationJsonLd, JsonLd } from '@quilty/seo';
import type { Metadata } from 'next';

// Use the root layout's title template default (no `title` here so the page
// renders as plain "Quilty" rather than "Home · Quilty" — a11y
// reviewer flagged "Home" as too vague for WCAG 2.4.2 Page Titled).
// The identity-discovery milestone may replace this with a topical homepage title
// ("Quilty — Mental health, made personal") once the voice lands.
export const metadata: Metadata = {
  description: 'Quilty — a mental-health peer-set product.',
  // Per-page canonical + self-referencing hreflang. The root layout no
  // longer ships a blanket canonical; every
  // marketing page MUST declare its own. `x-default` points at the English
  // route for now — when next-intl wiring lands the locale layout will
  // programmatically broaden this.
  alternates: {
    canonical: '/en',
    languages: { en: '/en', 'x-default': '/en' },
  },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function HomePage() {
  return (
    <>
      {/* WebSite is now emitted in app/layout.tsx so every route has
          a resolvable `isPartOf` anchor — do not re-emit here. */}
      <JsonLd data={buildSoftwareApplicationJsonLd(SITE_URL)} />
      <JsonLd data={buildBreadcrumbsJsonLd(SITE_URL, [{ name: 'Home', url: `${SITE_URL}/en` }])} />

      {/* <section> without aria-labelledby — nested-region landmarks
          under <main> add AT-navigation noise without giving sub-page
          structure (single-section pages especially). */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className="text-fg-default text-balance text-5xl font-semibold tracking-tight">
          Mental health, made personal.
        </h1>
        <p className="text-fg-muted mt-6 text-lg">
          The identity-discovery milestone will replace this hero with real voice + visual. The
          current scaffold ships the structural baseline — locale segment, route groups, JSON-LD
          graph, security spine, observability adapters — so every future page is
          addition-not-rebuild.
        </p>
      </section>
    </>
  );
}
