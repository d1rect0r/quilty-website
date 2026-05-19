import { JsonLd } from '@/components/seo/JsonLd';
import {
  buildBreadcrumbsJsonLd,
  buildWebSiteJsonLd,
  buildSoftwareApplicationJsonLd,
} from '@/lib/seo/schemas';
import type { Metadata } from 'next';

// Use the root layout's title template default (no `title` here so the page
// renders as plain "Quilty" rather than "Home · Quilty" — Round-5 a11y
// reviewer flagged "Home" as too vague for WCAG 2.4.2 Page Titled).
// M3 identity discovery may replace this with a topical homepage title
// ("Quilty — Mental health, made personal") once the voice lands.
export const metadata: Metadata = {
  description: 'Quilty — a mental-health peer-set product.',
  // Per-page canonical + self-referencing hreflang. The root layout no
  // longer ships a blanket canonical (Round-5 final-QA SEO C2 + M1); every
  // marketing page MUST declare its own. `x-default` points at the English
  // route for now — when next-intl ships at M5+ the locale layout will
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
      <JsonLd data={buildWebSiteJsonLd(SITE_URL)} />
      <JsonLd data={buildSoftwareApplicationJsonLd(SITE_URL)} />
      <JsonLd data={buildBreadcrumbsJsonLd(SITE_URL, [{ name: 'Home', url: `${SITE_URL}/en` }])} />

      <section aria-labelledby="hero-heading" className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1
          id="hero-heading"
          className="text-fg-default text-balance text-5xl font-semibold tracking-tight"
        >
          Mental health, made personal.
        </h1>
        <p className="text-fg-muted mt-6 text-lg">
          M3 identity discovery will replace this hero with real voice + visual. M1 ships the
          structural baseline — locale segment, route groups, JSON-LD graph, security spine,
          observability adapters — so every future page is addition-not-rebuild.
        </p>
      </section>
    </>
  );
}
