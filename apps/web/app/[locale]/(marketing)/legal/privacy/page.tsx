import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Quilty privacy policy. Lawyer-reviewed copy lands in M8 per roadmap.',
};

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-semibold text-fg-default">Privacy Policy</h1>
      <p className="mt-4 text-fg-muted">
        Placeholder — lawyer-reviewed copy lands in M8. Until then, this URL is
        reserved so external systems (Apple Dev, Google OAuth verification, Stripe
        activation) can resolve the link.
      </p>
      <p id="gpc" className="mt-4 text-fg-muted">
        Your Privacy Choices: M8 wires GPC handling + the visible CCPA §7025(c)(6)
        opt-out confirmation per D62.
      </p>
    </section>
  );
}
