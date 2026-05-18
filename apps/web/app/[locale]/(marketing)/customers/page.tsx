import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customers',
  description: 'Testimonials + case studies. Real content lands post-M4 per roadmap.',
};

export default function CustomersPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-4xl font-semibold text-fg-default">Customers</h1>
      <p className="mt-4 text-fg-muted">Coming soon — testimonials + case studies land post-M4.</p>
    </section>
  );
}
