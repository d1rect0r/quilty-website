import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Features',
  description: 'What Quilty does. Real content activates when the marketing-pages milestone ships.',
  // Stub-page noindex until real content lands .
  // Sitemap continues to list this route; flip robots.index when the marketing-pages content ships.
  robots: { index: false, follow: true },
  alternates: {
    canonical: '/en/features',
    languages: { en: '/en/features', 'x-default': '/en/features' },
  },
};

export default function FeaturesPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-fg-default text-4xl font-semibold">Features</h1>
      <p className="text-fg-muted mt-4">
        Coming soon — content activates when the marketing-pages milestone ships.
      </p>
    </section>
  );
}
