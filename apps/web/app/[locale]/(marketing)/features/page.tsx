import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Features',
  description: 'What Quilty does. Real content lands in M4 per roadmap.',
};

export default function FeaturesPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-4xl font-semibold text-fg-default">Features</h1>
      <p className="mt-4 text-fg-muted">Coming soon — content lands in M4.</p>
    </section>
  );
}
