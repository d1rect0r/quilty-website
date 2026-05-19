import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'For business',
  description: 'Quilty for employers + clinical partners. Real content lands post-launch.',
  robots: { index: false, follow: true },
  alternates: {
    canonical: '/en/for-business',
    languages: { en: '/en/for-business', 'x-default': '/en/for-business' },
  },
};

export default function ForBusinessPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-fg-default text-4xl font-semibold">For business</h1>
      <p className="text-fg-muted mt-4">
        Coming soon — B2B / employer / clinical partner content lands post-launch.
      </p>
    </section>
  );
}
