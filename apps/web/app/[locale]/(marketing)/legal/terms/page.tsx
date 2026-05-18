import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Quilty terms of service. Lawyer-reviewed copy lands in M8 per roadmap.',
};

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-semibold text-fg-default">Terms of Service</h1>
      <p className="mt-4 text-fg-muted">
        Placeholder — lawyer-reviewed copy lands in M8.
      </p>
    </section>
  );
}
