import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description:
    'Quilty cookie policy. Lawyer-reviewed copy + ConsentState UI land in M8 per roadmap.',
  alternates: {
    canonical: '/en/legal/cookies',
    languages: { en: '/en/legal/cookies', 'x-default': '/en/legal/cookies' },
  },
};

export default function CookiesPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-fg-default text-4xl font-semibold">Cookie Policy</h1>
      <p className="text-fg-muted mt-4">
        Placeholder — lawyer-reviewed copy + ConsentState UI (D35 + D63) land in M8.
      </p>
    </section>
  );
}
