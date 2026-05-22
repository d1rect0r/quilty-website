import { buildOpenGraphMetadata, JsonLd } from '@quilty/seo';
import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Trust Center one-page summary (D103).
 *
 * Stripe + Sentry pattern — a single indexable page that surfaces
 * security posture + compliance status + encryption + sub-processor
 * pointer + incident-history pointer + responsible-disclosure pointer.
 * Migrates to a SafeBase Trust Center subdomain post-SOC 2 (M7-M8
 * trigger); this `/trust` path remains the entry point.
 *
 * Language discipline:
 *   - HIPAA-aligned, NEVER HIPAA-compliant (D104, Cerebral $7M FTC
 *     settlement precedent — claiming compliance without third-party
 *     audit attestation is the exact pattern the FTC charged Cerebral
 *     under).
 *   - SOC 2 Type II = readiness work, NOT in-force attestation. We
 *     name it as in-progress so procurement teams who scan for the
 *     ISMS-equivalent posture get an accurate signal rather than a
 *     deceptive one (D183 deferral, ~12 months post-launch).
 *   - Encryption claims are factual and conservative — TLS 1.2+ in
 *     transit + AWS KMS at rest are the executed baseline; CMK
 *     posture + rotation cadence + audit-log immutability await the
 *     quilty-aws/website-baseline/ Terraform layer.
 */

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const pageUrl = `${siteUrl}/en/trust`;

// Title carries the brand + the two highest-value procurement
// keywords ("Security" + "Trust") because enterprise vendor reviewers
// search for "<brand> security" or "<brand> SOC 2" before they reach
// the page directly. A minimal "Trust Center" string ranked poorly
// for those queries even though the body text covered them.
const PAGE_TITLE = 'Trust & Security';

// Description names SOC 2 + HIPAA explicitly so the SERP snippet
// resolves the click-through gate for procurement teams scanning a
// vendor's security posture. Stays inside the 140-160 char SERP
// truncation window.
const PAGE_DESCRIPTION =
  'Quilty security posture: HIPAA-aligned operations, SOC 2 Type II readiness, encryption-in-transit + at-rest, sub-processors, and responsible disclosure.';

const LAST_REVIEWED = '2026-05-22';

const ogMetadata = buildOpenGraphMetadata({
  ogImage: new URL('/og-default.jpg', siteUrl).toString(),
  ogImageAlt: 'Quilty — trust center',
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
    canonical: '/en/trust',
    languages: {
      en: '/en/trust',
      'x-default': '/en/trust',
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
  // 'en-US' (BCP 47) matches the inLanguage on the WebSite +
  // MedicalWebPage graph anchors in @quilty/seo schemas; using bare
  // 'en' here breaks the graph-consistency hint AI-citation crawlers
  // normalise against.
  inLanguage: 'en-US',
  // dateModified is a load-bearing freshness signal for a posture
  // page — AI-citation crawlers (Bing Deep Research, Perplexity) use
  // it to decide whether to quote claims. A stale Trust Center page
  // without dateModified is high-risk for misquotation.
  dateModified: LAST_REVIEWED,
  isPartOf: { '@id': `${siteUrl}#website` },
  publisher: { '@id': `${siteUrl}#organization` },
};

export default function TrustCenterPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24" aria-labelledby="trust-heading">
      <JsonLd data={webPageJsonLd} />
      <h1 id="trust-heading" className="text-fg-default text-4xl font-semibold">
        Trust Center
      </h1>

      <p className="text-fg-muted mt-6">
        Quilty operates as a HIPAA-aligned consumer mental-health product. This page summarises our
        security posture, compliance status, and where to find the details. We update it on every
        meaningful change.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Our security posture</h2>
      <p className="text-fg-muted mt-4">
        Quilty&apos;s architecture splits clinical handling from the website tier. The clinical
        backend — the Rust services + storage surfaces that process health-related data on behalf of
        the mobile product — runs in a dedicated AWS account under an executed Business Associate
        Agreement. The website tier (this site + the account portal) sits in a separate, non-PHI AWS
        account and is designed to carry zero protected health information.
      </p>
      <p className="text-fg-muted mt-4">
        The architectural seal between the two — distinct AWS accounts under organisation-level
        service-control policies, with the website account explicitly outside the HIPAA scope — is
        the load-bearing control that prevents the tracking-pixel exfiltration pattern that led to
        the 2023 Cerebral $7M FTC settlement + the 2023 Monument enforcement action.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Compliance status</h2>
      <p className="text-fg-muted mt-4">
        We design and operate Quilty to be{' '}
        <strong className="text-fg-default">HIPAA-aligned</strong>. We do not claim &ldquo;HIPAA
        compliance&rdquo; — HIPAA imposes administrative + physical + technical safeguards on
        Covered Entities and Business Associates, and the only authoritative verification is a
        third-party audit attestation against the rule.
      </p>
      <p className="text-fg-muted mt-4">
        Our <strong className="text-fg-default">SOC 2 Type II</strong> readiness work is in
        progress; target completion is the post-launch ~12-month milestone. We will publish the
        attestation report under NDA to enterprise customers once it lands. We do not consider
        readiness equivalent to attestation, and we will not represent it that way during sales or
        procurement.
      </p>
      <p className="text-fg-muted mt-4">
        Additional applicable frameworks: <strong className="text-fg-default">GDPR</strong> (EU/UK),{' '}
        <strong className="text-fg-default">CCPA / CPRA</strong> (California),{' '}
        <strong className="text-fg-default">WA MHMDA</strong> (Washington consumer health data),{' '}
        <strong className="text-fg-default">Quebec Law 25</strong>, and the{' '}
        <strong className="text-fg-default">European Accessibility Act</strong> (EAA / EN 301 549).
        Our{' '}
        <Link href="/en/legal/privacy" className="text-fg-default underline underline-offset-2">
          privacy policy
        </Link>{' '}
        + the{' '}
        <Link
          href="/en/legal/accessibility"
          className="text-fg-default underline underline-offset-2"
        >
          accessibility statement
        </Link>{' '}
        carry the per-jurisdiction obligations + remediation procedures.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Encryption</h2>
      <p className="text-fg-muted mt-4">
        All traffic to my-quilty.com is served over TLS 1.2+ with a phased HSTS ramp. We are
        deliberately conservative pre-launch: a short max-age during scaffold so any rollback
        propagates within minutes, ramping to longer max-age + includeSubDomains + preload as the
        underlying registrar + subdomain posture is verified. Data at rest is encrypted with AWS
        KMS-managed keys on the website-tier storage surface — session + consent DynamoDB tables, S3
        export buckets, Cognito user records (non-PHI). Customer-managed key (CMK) posture +
        rotation-cadence audit + audit-log immutability are tracked in the infrastructure-as-code
        repository and audited at the post-launch security milestone.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Sub-processors</h2>
      <p className="text-fg-muted mt-4">
        We publish a current list of vendors that process data on our behalf, including BAA status
        and 30-business-day change-notice cadence. See our{' '}
        <Link
          href="/en/legal/subprocessors"
          className="text-fg-default underline underline-offset-2"
        >
          sub-processors page
        </Link>
        .
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Responsible disclosure</h2>
      <p className="text-fg-muted mt-4">
        Security researchers may report vulnerabilities to{' '}
        <a
          href="mailto:security@my-quilty.com"
          className="text-fg-default underline underline-offset-2"
        >
          security@my-quilty.com
        </a>
        . Our published policy + PGP key + scope are at{' '}
        <Link href="/en/security" className="text-fg-default underline underline-offset-2">
          /en/security
        </Link>{' '}
        and machine-readable at <code className="text-fg-default">/.well-known/security.txt</code>{' '}
        per RFC 9116.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Incident history</h2>
      <p className="text-fg-muted mt-4">
        We will publish an external status page covering incident history + ongoing service health.
        The page is reserved at <strong className="text-fg-default">status.my-quilty.com</strong>{' '}
        and activates with the first incident-communication need.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Future: full Trust Center</h2>
      <p className="text-fg-muted mt-4">
        Once our SOC 2 Type II attestation is in force, we will migrate to a dedicated Trust Center
        with controls evidence + policy library + audit-report access. This page remains the entry
        point — bookmark it.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Last reviewed</h2>
      <p className="text-fg-muted mt-4">
        This page was last reviewed on <time dateTime={LAST_REVIEWED}>{LAST_REVIEWED}</time>. We
        review on every meaningful change + at least quarterly.
      </p>
    </section>
  );
}
