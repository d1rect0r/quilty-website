import { buildOpenGraphMetadata, JsonLd } from '@quilty/seo';
import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Public DSAR landing page (D99).
 *
 * The Stripe `/legal/privacy-center` + Vercel DataGrail peer pattern:
 * one indexable page that enumerates statutory rights + names the
 * canonical exercise path (signed-in self-serve via /account/privacy;
 * email-link verification for the unsigned path).
 *
 * Indexable on purpose so search-engine discovery + automated rights-
 * verification tooling (EDPB, ICO, CA AG enforcement crawlers) can
 * find the surface. Per D152 the published SLA is the conservative
 * 45-day floor across GDPR/CCPA/MHMDA; per-jurisdiction internal
 * targets are tighter.
 *
 * Identity verification is deliberately anti-photo-ID per EDPB
 * Guidelines 01/2022 + the Dutch DPA's €525K DPG Media fine (the
 * routine-DSAR-photo-ID-as-friction anti-pattern). Signed-in users
 * rely on the existing authenticated session; unsigned users use an
 * email-link single-use token (24-hour TTL).
 */

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const pageUrl = `${siteUrl}/en/legal/privacy-choices`;

// Title carries the brand keyword "Privacy Rights" + names the four
// statutory frameworks so compliance-officer + procurement queries
// ("Quilty privacy rights", "Quilty GDPR", "Quilty CCPA") land on
// the right surface. Stays inside the ~60-char SERP truncation
// window after the "· Quilty" template suffix.
const PAGE_TITLE = 'Privacy Rights — GDPR, CCPA, MHMDA';

// Description front-loads the action verbs (Access · Delete ·
// Export) before the ~120-char SERP fold so procurement reviewers
// scanning the snippet see the affordances immediately, then the
// statutory-framework + 45-day-SLA context.
const PAGE_DESCRIPTION =
  'Access, correct, delete, export, or restrict your data. Exercise your privacy rights under GDPR, CCPA, WA MHMDA, and Quebec Law 25. 45-day SLA.';

const LAST_REVIEWED = '2026-05-22';

const ogMetadata = buildOpenGraphMetadata({
  ogImage: new URL('/og-default.jpg', siteUrl).toString(),
  ogImageAlt: 'Quilty — privacy choices',
  ogImageType: 'image/jpeg',
  siteName: 'Quilty',
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  url: pageUrl,
  locale: 'en_US',
});

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: '/en/legal/privacy-choices',
    languages: {
      // 'en-US' (BCP 47) matches inLanguage on the JSON-LD WebPage
      // anchor + the WebSite graph anchor in @quilty/seo. Bare 'en'
      // is interpreted as "any English" by Google; an explicit
      // region tag is the correct signal for a US-product surface
      // that names California + Washington + EU statutes.
      'en-US': '/en/legal/privacy-choices',
      'x-default': '/en/legal/privacy-choices',
    },
  },
  ...ogMetadata,
};

const webPageJsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${pageUrl}#webpage`,
  url: pageUrl,
  name: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  inLanguage: 'en-US',
  dateModified: LAST_REVIEWED,
  isPartOf: { '@id': `${siteUrl}#website` },
  publisher: { '@id': `${siteUrl}#organization` },
};

export default function PrivacyChoicesPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24" aria-labelledby="privacy-choices-heading">
      <JsonLd data={webPageJsonLd} />
      <h1 id="privacy-choices-heading" className="text-fg-default text-4xl font-semibold">
        Privacy Choices
      </h1>

      <p className="text-fg-muted mt-6">
        You have specific, statutory rights over the personal data we hold about you. This page
        summarises those rights and tells you exactly how to exercise them.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Your rights</h2>
      <ul className="text-fg-muted mt-4 list-disc space-y-3 pl-6">
        <li>
          <strong className="text-fg-default">Access (GDPR Article 15).</strong> Receive a copy of
          the personal data we hold about you.
        </li>
        <li>
          <strong className="text-fg-default">Correction (GDPR Article 16).</strong> Correct
          inaccurate or incomplete data.
        </li>
        <li>
          <strong className="text-fg-default">
            Erasure / Deletion (GDPR Article 17, CCPA, WA MHMDA, Quebec Law 25).
          </strong>{' '}
          Request deletion of your data. Some records are retained under the Article 17(3)(b)
          legal-obligation exception (tax law, consent-demonstrability records); these are
          pseudonymised within 30 days of the request.
        </li>
        <li>
          <strong className="text-fg-default">Portability (GDPR Article 20).</strong> Receive your
          data in a structured, machine-readable format.
        </li>
        <li>
          <strong className="text-fg-default">Objection to profiling (GDPR Article 21).</strong> Opt
          out of automated decision-making + personalisation.
        </li>
        <li>
          <strong className="text-fg-default">Opt-out of sale / sharing (CCPA / CPRA).</strong> We
          do not sell your personal data; the GPC signal is honored at the edge.
        </li>
        <li>
          <strong className="text-fg-default">Consumer Health Data rights (WA MHMDA).</strong>{' '}
          Washington residents have additional standalone rights over consumer health data — see our
          Consumer Health Data Privacy Policy, available alongside this page, for the WA- specific
          surface.
        </li>
      </ul>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">How to exercise these rights</h2>
      <p className="text-fg-muted mt-4">
        <strong className="text-fg-default">If you have an account:</strong> sign in and visit your{' '}
        <Link href="/en/account/privacy" className="text-fg-default underline underline-offset-2">
          privacy settings
        </Link>
        . Most rights are self-serve from there. Destructive actions (data export, account deletion)
        trigger a step-up authentication challenge to confirm your identity inside a five-minute
        elevated-permissions window.
      </p>
      <p className="text-fg-muted mt-4">
        <strong className="text-fg-default">If you do not have an account:</strong> email{' '}
        <a
          href="mailto:privacy@my-quilty.com"
          className="text-fg-default underline underline-offset-2"
        >
          privacy@my-quilty.com
        </a>{' '}
        from the address you want to act on. We send a single-use verification link (24-hour
        expiry); confirming the link is sufficient identity verification for routine requests.
      </p>
      <p className="text-fg-muted mt-4">
        We do <strong className="text-fg-default">not</strong> require government-issued photo ID
        for routine privacy requests. EDPB Guidelines 01/2022 + the Dutch DPA&apos;s €525K DPG Media
        fine flag photo-ID-as-routine-DSAR-friction as an anti-pattern.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">How long we take</h2>
      <p className="text-fg-muted mt-4">
        Our published response window is <strong className="text-fg-default">45 days</strong> — the
        conservative floor across GDPR (30 days), CCPA (45 days), WA MHMDA (45 days), and Quebec Law
        25 (30 days). For complex requests we may extend by the additional window the relevant
        statute permits — up to 60 additional days for GDPR (Article 12(3)) and up to 45 additional
        days for CCPA — with notice. Per-jurisdiction internal targets are tighter than the
        published floor.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Privacy Lead</h2>
      <p className="text-fg-muted mt-4">
        Quilty&apos;s designated point of contact for privacy matters is our{' '}
        <strong className="text-fg-default">Privacy Lead</strong> at{' '}
        <a
          href="mailto:privacy@my-quilty.com"
          className="text-fg-default underline underline-offset-2"
        >
          privacy@my-quilty.com
        </a>
        . Detailed obligations + retention periods + supervisory-authority contacts are in our{' '}
        <Link href="/en/legal/privacy" className="text-fg-default underline underline-offset-2">
          privacy policy
        </Link>
        .
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Last reviewed</h2>
      <p className="text-fg-muted mt-4">
        This page was last reviewed on <time dateTime={LAST_REVIEWED}>{LAST_REVIEWED}</time>. We
        review on every meaningful change + at least annually.
      </p>
    </section>
  );
}
