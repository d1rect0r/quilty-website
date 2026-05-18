import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help',
  description: 'Quilty help center. Self-host vs vendor decision at M9+ per U3.',
};

export default function HelpPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-4xl font-semibold text-fg-default">Help</h1>
      <p className="mt-4 text-fg-muted">
        Coming soon — help center implementation (self-host vs Zendesk/Intercom at{' '}
        <code>help.my-quilty.com</code>) decided at M9+ per U3.
      </p>
    </section>
  );
}
