import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Quilty terms of service. Lawyer-reviewed copy activates at the compliance milestone.',
  alternates: {
    canonical: '/en/legal/terms',
    languages: { en: '/en/legal/terms', 'x-default': '/en/legal/terms' },
  },
};

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-fg-default text-4xl font-semibold">Terms of Service</h1>
      <p className="text-fg-muted mt-4">
        Placeholder — lawyer-reviewed copy activates at the compliance milestone.
      </p>
    </section>
  );
}
