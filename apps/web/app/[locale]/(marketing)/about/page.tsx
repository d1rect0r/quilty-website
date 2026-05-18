import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'About Quilty. Real content lands in M3-M4 per roadmap.',
};

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-4xl font-semibold text-fg-default">About</h1>
      <p className="mt-4 text-fg-muted">Coming soon — content lands in M3-M4.</p>
    </section>
  );
}
