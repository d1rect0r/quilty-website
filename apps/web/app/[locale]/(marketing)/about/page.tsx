import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'About Quilty. Real content activates when the identity-discovery milestone ships.',
  robots: { index: false, follow: true },
  alternates: {
    canonical: '/en/about',
    languages: { en: '/en/about', 'x-default': '/en/about' },
  },
};

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-fg-default text-4xl font-semibold">About</h1>
      <p className="text-fg-muted mt-4">
        Coming soon — content activates when the identity-discovery milestone ships.
      </p>
    </section>
  );
}
