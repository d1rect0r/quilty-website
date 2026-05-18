import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'Quilty cookie policy. Lawyer-reviewed copy + ConsentState UI land in M8 per roadmap.',
};

export default function CookiesPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-semibold text-fg-default">Cookie Policy</h1>
      <p className="mt-4 text-fg-muted">
        Placeholder — lawyer-reviewed copy + ConsentState UI (D35 + D63) land in M8.
      </p>
    </section>
  );
}
