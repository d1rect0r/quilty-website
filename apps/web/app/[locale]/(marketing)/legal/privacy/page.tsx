import { buildBreadcrumbsJsonLd, buildOpenGraphMetadata, JsonLd } from '@quilty/seo';
import Link from 'next/link';
import { env } from '@/lib/env';
import { formatReviewDate, toIsoDateTime } from '@/lib/format-date';
import type { Metadata } from 'next';

/**
 * Main Privacy Policy (D149).
 *
 * Stripe + Anthropic + Linear peer pattern: a single ~600-word
 * policy stub that names the structure + the load-bearing language
 * (Privacy Lead title, HIPAA-aligned discipline, sensitive-data
 * classes, jurisdiction-floor SLA, identity-verification anti-
 * pattern, sub-processor pointer). Lawyer-review milestone tightens the
 * specific obligations + retention periods + supervisory-authority
 * contacts but the structural shape is locked here so external
 * systems (Apple Dev, Google OAuth verification, Stripe activation)
 * resolve a policy URL with real content rather than scaffolding.
 *
 * Language discipline (load-bearing):
 *   - Privacy Lead title (D136), NEVER "DPO" as self-applied title.
 *     GDPR Art 38(6) makes a self-styled DPO without one a fineable
 *     risk; Austrian €5K + CJEU C-453/21 X-FAB + Belgian €50K
 *     precedents.
 *   - HIPAA-aligned, NEVER HIPAA-compliant (D104, Cerebral $7M FTC
 *     settlement; the website tier is non-PHI by D31 architectural
 *     seal).
 *   - Sensitive-data classification (D153) names CCPA §1798.140 +
 *     GDPR Art 9 + WA MHMDA explicitly; opt-in for sale/share
 *     irrespective of jurisdiction.
 *   - Per-jurisdiction SLA matrix (D152): 45-day published floor,
 *     conservative across GDPR (30+60) / CCPA (45+45) / MHMDA (45) /
 *     Quebec (30).
 *   - Identity verification (D151): NO photo ID for routine DSARs;
 *     EDPB Guidelines 01/2022 + Dutch DPA €525K DPG Media fine.
 */

const siteUrl = env.NEXT_PUBLIC_SITE_URL;
const pageUrl = `${siteUrl}/en/legal/privacy`;

// Title expands beyond bare "Privacy Policy" so the SERP-rendered
// form ("Privacy Policy — Your Data, Your Rights · Quilty") fills the
// 50-60 char window instead of wasting it on a 24-char bare title;
// the suffix carries the keyword cluster procurement + consumer
// queries grep for ("your data", "your rights") on a privacy
// surface.
const PAGE_TITLE = 'Privacy Policy — Your Data, Your Rights';

// Description deliberately avoids "designed to comply" or any
// affirmative compliance assertion — that phrasing is FTC §5
// deceptive-acts territory in the same shape as the Cerebral $7M
// settlement. "Covers" is intent-framing; the body uses "HIPAA-
// aligned" everywhere a compliance claim would be tempting.
const PAGE_DESCRIPTION =
  'How Quilty collects, uses, and shares your personal data. HIPAA-aligned. Covers GDPR, CCPA, WA MHMDA, and Quebec Law 25 rights. 45-day response SLA.';

const LAST_REVIEWED = '2026-05-22';

const ogMetadata = buildOpenGraphMetadata({
  ogImage: new URL('/og-default.jpg', siteUrl).toString(),
  ogImageAlt: 'Quilty — privacy policy',
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
    canonical: '/en/legal/privacy',
    languages: {
      'en-US': '/en/legal/privacy',
      'x-default': '/en/legal/privacy',
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
  datePublished: toIsoDateTime(LAST_REVIEWED),
  dateModified: toIsoDateTime(LAST_REVIEWED),
  isPartOf: { '@id': `${siteUrl}#website` },
  publisher: { '@id': `${siteUrl}#organization` },
};

const breadcrumbsJsonLd = buildBreadcrumbsJsonLd(siteUrl, [
  { name: 'Home', url: `${siteUrl}/en` },
  { name: 'Legal', url: pageUrl },
  { name: 'Privacy Policy', url: pageUrl },
]);

export default function PrivacyPolicyPage() {
  return (
    // <section> without aria-labelledby — nested-region landmarks
    // removed across the legal-page cluster.
    <section className="mx-auto max-w-3xl px-6 py-24">
      <JsonLd data={webPageJsonLd} />
      <JsonLd data={breadcrumbsJsonLd} />
      <h1 className="text-fg-default text-4xl font-semibold">Privacy Policy</h1>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Privacy at a glance</h2>
      <ul className="text-fg-muted mt-4 list-disc space-y-2 pl-6">
        <li>
          We <strong className="text-fg-default">do not sell</strong> your personal data.
        </li>
        <li>
          We <strong className="text-fg-default">honor the GPC signal</strong> at the edge — if your
          browser sends <code className="text-fg-default">Sec-GPC: 1</code> we treat that as an
          opt-out of any sale or sharing for cross-context advertising, automatically.
        </li>
        <li>
          Quilty is <strong className="text-fg-default">HIPAA-aligned</strong>. The website tier
          carries no protected health information; clinical data lives in a separate, audited
          backend account under an executed Business Associate Agreement.
        </li>
        <li>
          Our published rights-fulfillment SLA is{' '}
          <strong className="text-fg-default">45 days</strong> — the conservative floor across GDPR,
          CCPA, WA MHMDA, and Quebec Law 25.
        </li>
      </ul>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Who we are</h2>
      <p className="text-fg-muted mt-4">
        Quilty Inc. is the controller of personal data described in this policy. Our designated
        point of contact for privacy matters is our{' '}
        <strong className="text-fg-default">Privacy Lead</strong> at{' '}
        <a
          href="mailto:privacy@my-quilty.com"
          className="text-fg-default underline underline-offset-2"
        >
          privacy@my-quilty.com
        </a>
        . We do not employ a designated Data Protection Officer — our processing does not currently
        meet any of the criteria under GDPR Article 37(1) that would mandate appointment (we are not
        a public authority; our core activities do not require regular + systematic large-scale
        monitoring of data subjects on the website tier; and our core activities do not consist of
        large-scale processing of special-category data on the website tier, which is non-PHI by
        architectural seal).
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Data we collect</h2>
      <p className="text-fg-muted mt-4">
        <strong className="text-fg-default">Account + identity:</strong> email address, account
        identifier, authentication state, and the device + browser metadata necessary to keep your
        session secure.
      </p>
      <p className="text-fg-muted mt-4">
        <strong className="text-fg-default">Subscription + billing:</strong> when subscription
        activates, payment-method metadata (held by our payment processor) and billing-event
        records.
      </p>
      <p className="text-fg-muted mt-4">
        <strong className="text-fg-default">Operational telemetry:</strong> error reports +
        performance metrics, designed to be free of identifying user content per our sanitizer
        chokepoint discipline.
      </p>
      <p className="text-fg-muted mt-4">
        Vaping cessation interactions (craving logs, quit-streak, trigger tags, in-app coaching
        conversations) are processed by the mobile product against a separate, audited backend, not
        by the website tier.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Sensitive data classes</h2>
      <p className="text-fg-muted mt-4">
        Consumer health data is a <strong className="text-fg-default">sensitive data class</strong>{' '}
        under CCPA §1798.140, GDPR Article 9, and the Washington My Health My Data Act. We treat all
        sale or sharing of sensitive data as opt-in only, irrespective of jurisdiction. The
        standalone Washington policy is at{' '}
        <Link
          href="/en/legal/consumer-health-data-privacy"
          className="text-fg-default underline underline-offset-2"
        >
          /legal/consumer-health-data-privacy
        </Link>
        .
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">How we use it</h2>
      <p className="text-fg-muted mt-4">
        We use the data above to provide the service: keep your account secure, route your
        communications, process your subscription, and operate the mobile clinical product. We do
        not use your data to train any external model. We do not sell or share your personal data
        for cross-context behavioral advertising.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Sub-processors</h2>
      <p className="text-fg-muted mt-4">
        We publish the current list of vendors that process data on our behalf, with BAA status + a
        30-business-day change-notice cadence, at{' '}
        <Link
          href="/en/legal/subprocessors"
          className="text-fg-default underline underline-offset-2"
        >
          /legal/subprocessors
        </Link>
        .
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Your rights</h2>
      <p className="text-fg-muted mt-4">
        Depending on where you live, you have rights of access, correction, deletion, portability,
        objection to profiling, and (under CCPA) opt-out of sale or sharing. We summarise and
        operationalise these rights on our{' '}
        <Link
          href="/en/legal/privacy-choices"
          className="text-fg-default underline underline-offset-2"
        >
          privacy choices
        </Link>{' '}
        page.
      </p>
      <p className="text-fg-muted mt-4">
        <strong className="text-fg-default">Identity verification.</strong> For signed-in requests,
        your existing authenticated session is sufficient. For unsigned requests we verify identity
        via a single-use email-link token (24-hour expiry). We do{' '}
        <strong className="text-fg-default">not</strong> require government-issued photo ID for
        routine privacy requests — EDPB Guidelines 01/2022 + the Dutch DPA&apos;s €525K DPG Media
        fine flag photo-ID-as-routine-DSAR-friction as an anti-pattern.
      </p>
      <p className="text-fg-muted mt-4">
        <strong className="text-fg-default">Response window.</strong> We respond to privacy requests
        within 45 days. For complex requests we may extend by the additional window the relevant
        statute permits — up to 60 additional days for GDPR (Article 12(3)) and up to 45 additional
        days for CCPA — with notice. Per-jurisdiction internal targets are tighter than the
        published floor.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Retention</h2>
      <p className="text-fg-muted mt-4">
        We retain personal data for the duration of your account + the minimum window required by
        law thereafter. Some records (consent demonstrability under GDPR Article 7(1) + tax +
        billing records under applicable national law) are retained under the Article 17(3)(b)
        legal-obligation exception even after an erasure request; these are pseudonymised within 30
        days of the request.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Cookies</h2>
      <p className="text-fg-muted mt-4">
        See our{' '}
        <Link href="/en/legal/cookies" className="text-fg-default underline underline-offset-2">
          cookie policy
        </Link>{' '}
        for the categories of cookies we use + the consent surface.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Accessibility</h2>
      <p className="text-fg-muted mt-4">
        See our{' '}
        <Link
          href="/en/legal/accessibility"
          className="text-fg-default underline underline-offset-2"
        >
          accessibility statement
        </Link>{' '}
        for our WCAG 2.2 AA conformance posture + reporting channel.
      </p>

      <h2 id="gpc" className="text-fg-default mt-12 text-2xl font-semibold">
        Your Privacy Choices
      </h2>
      <p className="text-fg-muted mt-4">
        California residents can exercise the right to opt out of sale or sharing of personal data
        under Civil Code §1798.135 + 11 CCR §7025(c)(6). We honor the Global Privacy Control (GPC)
        signal at the edge: a browser sending <code className="text-fg-default">Sec-GPC: 1</code> is
        treated as opting out automatically. The visible confirmation indicator appears in the
        footer when the signal is detected.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Contact</h2>
      <p className="text-fg-muted mt-4">
        Privacy Lead — Quilty Inc.,{' '}
        <a
          href="mailto:privacy@my-quilty.com"
          className="text-fg-default underline underline-offset-2"
        >
          privacy@my-quilty.com
        </a>
        .
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Last updated</h2>
      <p className="text-fg-muted mt-4">
        This policy was last updated on{' '}
        <time dateTime={LAST_REVIEWED}>{formatReviewDate(LAST_REVIEWED)}</time>.
      </p>
    </section>
  );
}
