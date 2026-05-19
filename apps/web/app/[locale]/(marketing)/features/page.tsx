import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Features',
  description: 'What Quilty does. Real content lands in M4 per roadmap.',
  // Stub-page noindex until real content lands (Round-5 final-QA SEO H3).
  // Sitemap continues to list this route; flip robots.index when M4 ships.
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
      <p className="text-fg-muted mt-4">Coming soon — content lands in M4.</p>
    </section>
  );
}
