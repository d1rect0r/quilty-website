import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Contact Quilty. Real content activates when the skeleton + identity milestones ship.',
  robots: { index: false, follow: true },
  alternates: {
    canonical: '/en/contact',
    languages: { en: '/en/contact', 'x-default': '/en/contact' },
  },
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-fg-default text-4xl font-semibold">Contact</h1>
      <p className="text-fg-muted mt-4">
        Coming soon — content activates when the skeleton milestone ships.
      </p>
    </section>
  );
}
