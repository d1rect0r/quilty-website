import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact Quilty. Real content lands in M2-M3 per roadmap.',
  robots: { index: false, follow: true },
  alternates: {
    canonical: '/en/contact',
    languages: { en: '/en/contact', 'x-default': '/en/contact' },
  },
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-4xl font-semibold text-fg-default">Contact</h1>
      <p className="mt-4 text-fg-muted">Coming soon — content lands in M2-M3.</p>
    </section>
  );
}
