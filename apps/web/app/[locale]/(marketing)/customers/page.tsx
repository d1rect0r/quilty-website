import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customers',
  description: 'Testimonials + case studies. Testimonials + case studies activate post-launch.',
  robots: { index: false, follow: true },
  alternates: {
    canonical: '/en/customers',
    languages: { en: '/en/customers', 'x-default': '/en/customers' },
  },
};

export default function CustomersPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-fg-default text-4xl font-semibold">Customers</h1>
      <p className="text-fg-muted mt-4">
        Coming soon — testimonials + case studies activate post-launch.
      </p>
    </section>
  );
}
