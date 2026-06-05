import { buildBreadcrumbsJsonLd, buildOpenGraphMetadata, JsonLd } from '@quilty/seo';
import Link from 'next/link';
import { env } from '@/lib/env';
import { formatReviewDate, toIsoDateTime } from '@/lib/format-date';
import type { Metadata } from 'next';

/**
 * Washington My Health My Data Act — Consumer Health Data Privacy
 * Policy (D150).
 *
 * RCW 19.373.020 + 19.373.030 require a STANDALONE policy distinct
 * from a general privacy policy. The policy must enumerate the
 * categories of consumer health data collected, the purposes,
 * sources, sharing, consumer rights + how to exercise them, and
 * publish the page as a conspicuous link on the home page.
 *
 * Two structural items the law makes specifically load-bearing:
 *   1. Catch-22 disclosure (D154 — Hintze Law canonical phrasing):
 *      the law prohibits sharing consumer health data without
 *      explicit consent even for service-provider routing, AND
 *      RCW 19.373.040 grants an erasure right, BUT vendor-erasure
 *      orchestration itself requires sharing the user's identifier
 *      with each vendor — creating the operational tension the
 *      Hintze Law guidance documents.
 *   2. Geofencing-ban acknowledgment — RCW 19.373.060 bans
 *      geofences of 2,000 feet around healthcare facilities for
 *      consumer-health-data collection / inference. Independent of
 *      Quilty's pixel-free posture, the policy must disclose the
 *      ban applies + the company commits to it.
 *
 * Marked for the lawyer-review milestone. The structural shape + load-bearing
 * wording (Catch-22 verbatim, sensitive-data-class language per
 * D153, geofencing-ban acknowledgment) is locked here.
 */

const siteUrl = env.NEXT_PUBLIC_SITE_URL;
const pageUrl = `${siteUrl}/en/legal/consumer-health-data-privacy`;

const PAGE_TITLE = 'Consumer Health Data Privacy Policy (Washington)';

// Description front-loads the statutory citation (RCW 19.373) so
// supervisory-authority + legal-research queries that grep for the
// section reference surface this page; stays inside the ~160-char
// SERP truncation window.
const PAGE_DESCRIPTION =
  'Washington My Health My Data Act (RCW 19.373) standalone policy. Consumer health data we collect, how we use it, your rights, and how to exercise them.';

const LAST_REVIEWED = '2026-05-22';

const ogMetadata = buildOpenGraphMetadata({
  ogImage: new URL('/og-default.jpg', siteUrl).toString(),
  ogImageAlt: 'Quilty — consumer health data privacy policy (Washington)',
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
    canonical: '/en/legal/consumer-health-data-privacy',
    languages: {
      'en-US': '/en/legal/consumer-health-data-privacy',
      'x-default': '/en/legal/consumer-health-data-privacy',
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
  // AI-citation crawlers (Bing Deep Research, Perplexity, ChatGPT
  // grounding) use datePublished + dateModified jointly to assess
  // regulatory-document recency. For first publication both fields
  // carry the same value; the dateModified moves forward on each
  // meaningful edit while datePublished stays anchored.
  datePublished: toIsoDateTime(LAST_REVIEWED),
  dateModified: toIsoDateTime(LAST_REVIEWED),
  isPartOf: { '@id': `${siteUrl}#website` },
  publisher: { '@id': `${siteUrl}#organization` },
};

const breadcrumbsJsonLd = buildBreadcrumbsJsonLd(siteUrl, [
  { name: 'Home', url: `${siteUrl}/en` },
  { name: 'Legal', url: `${siteUrl}/en/legal/privacy` },
  { name: 'Consumer Health Data Privacy (WA)', url: pageUrl },
]);

export default function ConsumerHealthDataPrivacyPage() {
  return (
    // <section> without aria-labelledby — nested-region landmarks
    // removed across the legal-page cluster.
    <section className="mx-auto max-w-3xl px-6 py-24">
      <JsonLd data={webPageJsonLd} />
      <JsonLd data={breadcrumbsJsonLd} />
      <h1 className="text-fg-default text-4xl font-semibold">
        Consumer Health Data Privacy Policy (Washington)
      </h1>

      <p className="text-fg-muted mt-6">
        This standalone policy applies to Washington residents and addresses our handling of
        &ldquo;consumer health data&rdquo; as defined by the Washington My Health My Data Act (RCW
        Chapter 19.373). It is separate from our general{' '}
        <Link href="/en/legal/privacy" className="text-fg-default underline underline-offset-2">
          privacy policy
        </Link>{' '}
        because the statute requires a distinct, conspicuous policy for this data class.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Scope</h2>
      <p className="text-fg-muted mt-4">
        This policy applies if you are a Washington resident or your data was collected while you
        were physically present in Washington. It does not displace our obligations under federal
        law (HIPAA, where applicable), GDPR, CCPA / CPRA, or other state regimes.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">
        Categories of consumer health data
      </h2>
      <p className="text-fg-muted mt-4">
        Consumer health data under the Act includes information that is linked or reasonably
        linkable to a consumer and that identifies the consumer&apos;s past, present, or future
        physical or mental health status. The categories we may process within the website tier are
        limited; the mobile product processes more.
      </p>
      <ul className="text-fg-muted mt-4 list-disc space-y-2 pl-6">
        <li>
          <strong className="text-fg-default">Vaping cessation engagement inferences</strong> —
          derived from your interaction patterns with the mobile product (craving logs, quit-streak,
          trigger tags). These inferences are derived + held exclusively in the mobile product + its
          dedicated backend account. The website tier carries no derivative of these inferences —
          not raw, not aggregated, not pseudonymised.
        </li>
        <li>
          <strong className="text-fg-default">
            Device + interaction signals in clinical context
          </strong>{' '}
          — biometric or device signals only where they originate in the mobile product&apos;s
          clinical surface; the website tier itself does not collect biometric data.
        </li>
        <li>
          <strong className="text-fg-default">Account + billing identifiers</strong> — email,
          account ID, and subscription state, which are personal data but constitute &ldquo;consumer
          health data&rdquo; only where they link to a clinical interaction.
        </li>
      </ul>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">How we use it</h2>
      <p className="text-fg-muted mt-4">
        We process consumer health data to deliver the service you signed up for — provide your
        account, route your communications, and operate the clinical mobile product against a
        separate, audited backend. We do <strong className="text-fg-default">not</strong> sell
        consumer health data, and we do not share it for advertising. Sharing for service-provider
        routing requires your explicit consent.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">
        Sensitive-data classification
      </h2>
      <p className="text-fg-muted mt-4">
        Consumer health data is treated as a{' '}
        <strong className="text-fg-default">sensitive data class</strong> under CCPA §1798.140, GDPR
        Article 9, and the Washington My Health My Data Act. We treat all sale or sharing as opt-in
        only, irrespective of jurisdiction.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">
        Catch-22 disclosure on erasure + authorization retention
      </h2>
      <p className="text-fg-muted mt-4">
        The Washington My Health My Data Act prohibits sharing consumer health data without
        affirmative, explicit consent — even with a service-provider for routing — while RCW
        19.373.040 grants consumers a right of erasure. Our orchestration of erasure across the
        vendors that hold your data necessarily passes a vendor-side identifier to each vendor to
        direct the deletion, and we must retain a record of the authorization + the deletion request
        itself to demonstrate compliance with the consent + erasure obligations. We disclose this
        operational tension as required by the Act and resolve it by minimising the identifier
        passed (a pseudonymised token, never the original identifier where avoidable), retaining
        only the audit-trail records the Act requires + permits, and pseudonymising those records
        within 30 days of erasure.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Geofencing ban</h2>
      <p className="text-fg-muted mt-4">
        RCW 19.373.060 prohibits implementing a geofence within 2,000 feet of any in-person
        healthcare service location for the purpose of identifying or tracking consumers, collecting
        consumer health data from them, or sending notifications + advertisements. We acknowledge
        this ban applies to us + commit to it. We do not implement geofences around healthcare
        facilities; we do not load advertising-network SDKs or third-party location-tracking SDKs
        that could compute geofence-based inferences; and our marketing surface carries no
        location-targeting pixels.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Your rights</h2>
      <ul className="text-fg-muted mt-4 list-disc space-y-2 pl-6">
        <li>
          <strong className="text-fg-default">Confirm (RCW 19.373.040(1)(a))</strong> — confirm
          whether Quilty is collecting, sharing, or selling your consumer health data, independent
          of requesting a copy.
        </li>
        <li>
          <strong className="text-fg-default">Access</strong> — receive a copy of your consumer
          health data.
        </li>
        <li>
          <strong className="text-fg-default">Deletion</strong> — request deletion of your consumer
          health data. Some records are retained under legal-obligation exceptions (audit + tax) +
          pseudonymised within 30 days of the request.
        </li>
        <li>
          <strong className="text-fg-default">Consent revocation</strong> — revoke your previously-
          granted consent at any time; this stops further collection + sharing.
        </li>
        <li>
          <strong className="text-fg-default">Renewal</strong> — we obtain renewed, affirmative
          consent before processing for any purpose not covered by your original consent.
        </li>
      </ul>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">How to exercise these rights</h2>
      <p className="text-fg-muted mt-4">
        See our{' '}
        <Link
          href="/en/legal/privacy-choices"
          className="text-fg-default underline underline-offset-2"
        >
          privacy choices
        </Link>{' '}
        page for the canonical exercise path (signed-in self-serve at{' '}
        <Link href="/en/account/privacy" className="text-fg-default underline underline-offset-2">
          your privacy settings
        </Link>{' '}
        or email-link verification for the unsigned path). We do not require government-issued photo
        ID for routine requests.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Contact</h2>
      <p className="text-fg-muted mt-4">
        Quilty&apos;s designated point of contact for privacy matters is our{' '}
        <strong className="text-fg-default">Privacy Lead</strong> at{' '}
        <a
          href="mailto:privacy@my-quilty.com"
          className="text-fg-default underline underline-offset-2"
        >
          privacy@my-quilty.com
        </a>
        .
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Last reviewed</h2>
      <p className="text-fg-muted mt-4">
        This policy was last reviewed on{' '}
        <time dateTime={LAST_REVIEWED}>{formatReviewDate(LAST_REVIEWED)}</time>. We review on every
        meaningful change + at least annually.
      </p>
    </section>
  );
}
