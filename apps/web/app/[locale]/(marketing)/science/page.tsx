import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildMedicalWebPageJsonLd } from '@/lib/seo/schemas';

export const metadata: Metadata = {
  title: 'Science',
  description:
    'The research + clinical evidence behind Quilty. Real content + named clinical reviewer land in M3-M4 per roadmap.',
  // Stub-page protection: keep out of the index until M3-M4 fills in real
  // content (Round-5 final-QA SEO H3). Sitemap still lists this route so
  // Search Console picks it up the moment we un-noindex.
  robots: { index: false, follow: true },
  alternates: {
    canonical: '/en/science',
    languages: { en: '/en/science', 'x-default': '/en/science' },
  },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function SciencePage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <JsonLd
        data={buildMedicalWebPageJsonLd({
          siteUrl: SITE_URL,
          url: `${SITE_URL}/en/science`,
          name: 'Science · Quilty',
          description: 'The research + clinical evidence behind Quilty.',
          lastReviewed: null,
          reviewedBy: null,
        })}
      />
      <h1 className="text-4xl font-semibold text-fg-default">Science</h1>
      <p className="mt-4 text-fg-muted">
        Coming soon — content + named clinical reviewer (lastReviewed +
        reviewedBy per D27) land in M3-M4.
      </p>
    </section>
  );
}
