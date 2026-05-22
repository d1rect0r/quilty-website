import { buildOpenGraphMetadata, JsonLd } from '@quilty/seo';
import type { Metadata } from 'next';

/**
 * Responsible disclosure policy — the human-readable counterpart to
 * `/.well-known/security.txt` (RFC 9116). Researchers reach this page
 * via the `Policy:` field on the machine-readable file + via the
 * GitHub Security tab surface from `SECURITY.md`.
 *
 * Indexable on purpose. Search engines + research-tooling actively
 * look for `/security` URLs; suppressing indexing here would force
 * researchers to discover the policy via the well-known file only.
 *
 * Convergent shape from Stripe / Anthropic / Linear / Cloudflare
 * disclosure pages, plus a HIPAA-aligned "no PHI in reports" section
 * — peer disclosure pages routinely omit this and the omission is a
 * real exposure path for a consumer-health product.
 */

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const pageUrl = `${siteUrl}/en/security`;

// "Responsible Disclosure · Quilty" (32 chars under the template
// expansion `'%s · Quilty'` in the root layout) lands in the
// recommended 50-60 char SERP-title window AND signals the page's
// purpose to AI-citation crawlers (Perplexity / ChatGPT) more
// precisely than a bare "Security" ever could.
const PAGE_TITLE = 'Responsible Disclosure';

// 145-char description sits in the recommended 140-160 char window
// without truncation. Names the contact channel + scope hint so
// researchers scanning a SERP can decide whether to click in.
const PAGE_DESCRIPTION =
  'Quilty responsible-disclosure policy + safe-harbor commitment. Report security findings to security@my-quilty.com — three-business-day acknowledgement.';

const ogMetadata = buildOpenGraphMetadata({
  ogImage: new URL('/og-default.jpg', siteUrl).toString(),
  ogImageAlt: 'Quilty — responsible disclosure policy',
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
    canonical: '/en/security',
    languages: { en: '/en/security', 'x-default': '/en/security' },
  },
  ...ogMetadata,
};

// Inline WebPage JSON-LD anchors the page in the schema.org graph
// emitted by the root layout (Organization + WebSite). Without this
// node, the security page is a dangling URL in the graph — AI-
// citation crawlers (Perplexity / ChatGPT) downweight orphan nodes
// when deciding which URL to surface in answer text.
const webPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${pageUrl}#webpage`,
  url: pageUrl,
  name: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  inLanguage: 'en',
  isPartOf: { '@id': `${siteUrl}#website` },
  publisher: { '@id': `${siteUrl}#organization` },
} as const;

export default function SecurityPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24" aria-labelledby="security-heading">
      <JsonLd data={webPageJsonLd} />
      <h1 id="security-heading" className="text-fg-default text-4xl font-semibold">
        Security
      </h1>

      <p className="text-fg-muted mt-6">
        Quilty takes the security of user data seriously. If you believe you have found a security
        vulnerability in any Quilty-owned system, we encourage responsible disclosure.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">How to report</h2>
      <p className="text-fg-muted mt-4">
        Email{' '}
        <a
          href="mailto:security@my-quilty.com"
          className="text-fg-default underline underline-offset-2"
        >
          security@my-quilty.com
        </a>{' '}
        with a description of the issue, steps to reproduce, and supporting evidence (logs,
        screenshots, request captures). We will acknowledge receipt within three business days.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Scope</h2>
      <p className="text-fg-muted mt-4">
        In scope: <code className="font-mono">my-quilty.com</code> and its subdomains,
        Quilty-operated APIs, and the mobile applications published under bundle identifier{' '}
        <code className="font-mono">app.quilty.myquilty</code>.
      </p>
      <p className="text-fg-muted mt-4">
        Out of scope: social engineering, denial-of-service attacks, physical security, and
        third-party services we do not control (including content-delivery networks and
        sub-processors listed in our privacy policy). Volumetric or destructive testing is
        prohibited.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">
        No protected health information in reports
      </h2>
      <p className="text-fg-muted mt-4">
        Quilty is HIPAA-aligned. Do not include personally identifying information, clinical
        content, or other protected health information in your proof-of-concept payloads, screen
        captures, or written descriptions. If a finding inherently requires demonstrating exposure
        of such data, describe the class of data and the access path; do not transmit the data
        itself. Reports that include real user data may be redacted on receipt and the supplying
        copy destroyed.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Our commitments</h2>
      <p className="text-fg-muted mt-4">
        We will not pursue legal action against researchers acting in good faith under this policy.
        We will keep you informed of triage progress, coordinate disclosure timing with you, and
        credit your contribution publicly (with your consent) once the issue is resolved.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Safe harbor</h2>
      <p className="text-fg-muted mt-4">
        Activities conducted consistent with this policy — testing for, identifying, and reporting
        vulnerabilities — are considered authorized. We will not pursue civil action, initiate
        complaints to law enforcement, or support such actions taken by others, against good-faith
        researchers who follow this policy.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Machine-readable policy</h2>
      <p className="text-fg-muted mt-4">
        This policy is also published in RFC 9116 format at{' '}
        <a
          href="/.well-known/security.txt"
          className="text-fg-default underline underline-offset-2"
        >
          /.well-known/security.txt
        </a>
        .
      </p>
    </section>
  );
}
