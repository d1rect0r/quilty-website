import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Quilty privacy policy. Lawyer-reviewed copy lands in M8 per roadmap.',
  // Legal pages stay INDEXABLE (Round-5 final-QA SEO H3) — external
  // systems (Apple Dev, Google OAuth verification, Stripe activation)
  // need the URL to resolve and Search Console requires the page
  // crawlable to verify policy link health.
  alternates: {
    canonical: '/en/legal/privacy',
    languages: { en: '/en/legal/privacy', 'x-default': '/en/legal/privacy' },
  },
};

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-fg-default text-4xl font-semibold">Privacy Policy</h1>
      <p className="text-fg-muted mt-4">
        Placeholder — lawyer-reviewed copy lands in M8. Until then, this URL is reserved so external
        systems (Apple Dev, Google OAuth verification, Stripe activation) can resolve the link.
      </p>
      <p id="gpc" className="text-fg-muted mt-4">
        Your Privacy Choices: M8 wires GPC handling + the visible CCPA §7025(c)(6) opt-out
        confirmation per D62.
      </p>
    </section>
  );
}
