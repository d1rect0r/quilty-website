import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'For business',
  description: 'Quilty for employers + clinical partners. Real content lands post-launch.',
};

export default function ForBusinessPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-4xl font-semibold text-fg-default">For business</h1>
      <p className="mt-4 text-fg-muted">
        Coming soon — B2B / employer / clinical partner content lands post-launch.
      </p>
    </section>
  );
}
