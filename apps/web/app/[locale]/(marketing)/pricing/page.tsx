import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Quilty pricing. Real content activates when the marketing-pages milestone ships.',
  robots: { index: false, follow: true },
  alternates: {
    canonical: '/en/pricing',
    languages: { en: '/en/pricing', 'x-default': '/en/pricing' },
  },
};

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-fg-default text-4xl font-semibold">Pricing</h1>
      <p className="text-fg-muted mt-4">
        Coming soon — content activates when the marketing-pages milestone ships.
      </p>
    </section>
  );
}
