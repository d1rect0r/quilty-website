import { buildBreadcrumbsJsonLd, buildOpenGraphMetadata, JsonLd } from '@quilty/seo';
import { CheckCircle2, Clock, Minus } from 'lucide-react';
import Link from 'next/link';
import { formatReviewDate, toIsoDateTime } from '@/lib/format-date';
import type { Metadata } from 'next';

/**
 * Sub-processors list (D102).
 *
 * Stripe 5-column convention — Name / Data Processed / Purpose /
 * Country / BAA Status — is the peer pattern (Stripe, Vercel, Linear,
 * Anthropic). Lists are republished within 30 business days of any
 * change so customers can object before the change takes effect; that
 * cadence is documented in the page footer + tracked operationally in
 * `docs/runbook/baa-inventory.md`.
 *
 * Vendor erasure orchestration spec lives in
 * `docs/runbook/vendor-erasure-matrix.md` (D175) — that file is the
 * authoritative per-vendor API + identity + retention-exception spec
 * the Rust orchestrator implements against. This page is the
 * public-facing summary.
 *
 * Email subscription is the canonical pattern (CSRF + honeypot +
 * time-trap + Turnstile + sanitizer + Server Action + Result envelope).
 * The disabled placeholder is the scaffold form; the active form
 * lands when the email-platform adapter activates.
 */

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const pageUrl = `${siteUrl}/en/legal/subprocessors`;

const PAGE_TITLE = 'Sub-processors';

const PAGE_DESCRIPTION =
  'Vendors that process data on behalf of Quilty. We notify customers at least 30 business days before any change to this list.';

const LAST_REVIEWED = '2026-05-22';

interface SubProcessor {
  readonly name: string;
  readonly dataProcessed: string;
  readonly purpose: string;
  readonly country: string;
  readonly baaStatus: 'Executed' | 'Required before use' | 'Not applicable';
}

// Snapshot matches `docs/runbook/baa-inventory.md`. When that file
// changes, this list MUST be updated within the same change-set —
// the 30-business-day customer-notice clock starts on the public
// publish, not the inventory change.
const SUB_PROCESSORS: readonly SubProcessor[] = [
  {
    name: 'Amazon Web Services (AWS)',
    dataProcessed:
      'Account identifiers, authentication tokens, session records, server logs (zero-PHI by design)',
    purpose:
      'Serverless compute (Lambda), managed login (Cognito), content delivery (CloudFront), session + consent storage (DynamoDB), static asset hosting (S3)',
    country: 'United States',
    baaStatus: 'Executed',
  },
  {
    // SES is tracked as a discrete row because the AWS BAA is
    // per-service AND per-account: SES coverage requires both the
    // SES-eligibility BAA acceptance + the production-access sandbox
    // lift before the `@quilty/email` adapter activates. Until both
    // are in force the row stays Required-before-use even though the
    // umbrella AWS BAA is executed (per the baa-inventory.md
    // distinction at the AWS-SES row).
    name: 'Amazon Web Services — SES',
    dataProcessed:
      'Recipient email address + transactional content (identity, auth, billing only; no clinical content)',
    purpose: 'Transactional email send',
    country: 'United States',
    baaStatus: 'Required before use',
  },
  {
    name: 'Sentry',
    dataProcessed:
      'Error stack traces, performance metrics, error-triggered session replays (mask-all by default per replay defaults)',
    purpose: 'Error monitoring + real-user metrics + error-triggered replay',
    country: 'United States',
    baaStatus: 'Required before use',
  },
  {
    name: 'Amplitude',
    dataProcessed: 'Event-level product analytics, feature-flag + experiment evaluations',
    purpose: 'Web + mobile analytics, feature flags, experiments',
    country: 'United States',
    baaStatus: 'Required before use',
  },
  {
    name: 'Cloudflare Turnstile',
    dataProcessed: 'Request IP, browser fingerprint signals, CAPTCHA challenge tokens',
    purpose: 'CAPTCHA on authentication + sign-up forms',
    country: 'United States',
    baaStatus: 'Required before use',
  },
];

const ogMetadata = buildOpenGraphMetadata({
  ogImage: new URL('/og-default.jpg', siteUrl).toString(),
  ogImageAlt: 'Quilty — sub-processors',
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
    canonical: '/en/legal/subprocessors',
    languages: {
      'en-US': '/en/legal/subprocessors',
      'x-default': '/en/legal/subprocessors',
    },
  },
  ...ogMetadata,
};

// `as const` here would deep-freeze the array to readonly literal tuples,
// which is structurally incompatible with `JsonLdProps.data: Record<string,
// unknown>`. Type-annotate explicitly so the shape is contract-checked
// against the JSON-LD consumer rather than inferred to a divergent
// readonly form.
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
  { name: 'Legal', url: `${siteUrl}/en/legal/privacy` },
  { name: 'Sub-processors', url: pageUrl },
]);

const itemListJsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  '@id': `${pageUrl}#sub-processor-list`,
  name: 'Quilty sub-processors',
  itemListOrder: 'https://schema.org/ItemListOrderAscending',
  numberOfItems: SUB_PROCESSORS.length,
  itemListElement: SUB_PROCESSORS.map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Organization',
      name: p.name,
      address: { '@type': 'PostalAddress', addressCountry: p.country },
    },
  })),
};

export default function SubprocessorsPage() {
  return (
    // <section> without aria-labelledby — see the accessibility-page
    // header comment; nested-region landmarks under <main> are removed
    // across the legal-page cluster.
    <section className="mx-auto max-w-4xl px-6 py-24">
      <JsonLd data={webPageJsonLd} />
      <JsonLd data={itemListJsonLd} />
      <JsonLd data={breadcrumbsJsonLd} />
      <h1 className="text-fg-default text-4xl font-semibold">Sub-processors</h1>

      <p className="text-fg-muted mt-6">
        A sub-processor is a third-party that processes data on behalf of Quilty. We use a small,
        deliberate set of vendors and keep the list current so customers can object before a change
        takes effect.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Current sub-processors</h2>
      <p className="text-fg-muted mt-4">
        The table below is the authoritative list as of{' '}
        <time dateTime={LAST_REVIEWED}>{formatReviewDate(LAST_REVIEWED)}</time>. &ldquo;BAA
        status&rdquo; tracks whether a HIPAA Business Associate Agreement is in force; vendors
        marked <em>Required before use</em> are evaluated but not yet wired into the runtime.
      </p>

      {/*
        The overflow wrapper becomes a horizontally-scrollable region on
        narrow viewports (the 5-column table is wider than mobile). Per
        WCAG 2.1.1 + ARIA 1.2 region-pattern guidance, a scrollable
        container must be reachable via Tab + announced as a landmark so
        keyboard-only + screen-reader users can scroll to the rightmost
        columns. `<section aria-label>` gives the implicit `role="region"`;
        `tabIndex={0}` is the WAI-ARIA Authoring Practices scrollable-
        region pattern and is intentionally an exception to the
        non-interactive-tabindex lint rule.
      */}
      {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
      <section
        aria-label="Sub-processor table, scrollable"
        tabIndex={0}
        className="focus-visible:outline-fg-default mt-6 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
        <table className="border-border-default min-w-full border-collapse border text-left text-sm">
          {/*
            Visible caption (not sr-only) — sighted low-vision users
            who magnify the page benefit from a structural description
            before they navigate into the table. WCAG 1.4.4 + 2.4.6
            both reward visible labels for complex tables.
          */}
          <caption className="text-fg-muted caption-top pb-3 pt-1 text-left text-sm">
            Quilty sub-processors: vendor name, data processed, purpose, country, and BAA status.
          </caption>
          <thead className="bg-bg-elevated">
            <tr>
              <th
                scope="col"
                className="border-border-default text-fg-default border px-4 py-3 font-semibold"
              >
                Name
              </th>
              <th
                scope="col"
                className="border-border-default text-fg-default border px-4 py-3 font-semibold"
              >
                Data processed
              </th>
              <th
                scope="col"
                className="border-border-default text-fg-default border px-4 py-3 font-semibold"
              >
                Purpose
              </th>
              <th
                scope="col"
                className="border-border-default text-fg-default border px-4 py-3 font-semibold"
              >
                Country
              </th>
              <th
                scope="col"
                className="border-border-default text-fg-default border px-4 py-3 font-semibold"
              >
                BAA status
              </th>
            </tr>
          </thead>
          <tbody>
            {SUB_PROCESSORS.map((p) => (
              <tr key={p.name}>
                <th
                  scope="row"
                  className="border-border-default text-fg-default border px-4 py-3 align-top font-medium"
                >
                  {p.name}
                </th>
                <td className="border-border-default text-fg-muted border px-4 py-3 align-top">
                  {p.dataProcessed}
                </td>
                <td className="border-border-default text-fg-muted border px-4 py-3 align-top">
                  {p.purpose}
                </td>
                <td className="border-border-default text-fg-muted border px-4 py-3 align-top">
                  {p.country}
                </td>
                <td className="border-border-default text-fg-muted border px-4 py-3 align-top">
                  <BaaStatusBadge status={p.baaStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Change notice</h2>
      <p className="text-fg-muted mt-4">
        We notify customers <strong className="text-fg-default">at least 30 business days</strong>{' '}
        before adding or replacing a sub-processor. Customers may object during the notice window;
        unresolved objections give the customer the right to terminate the affected service.
      </p>
      <p className="text-fg-muted mt-4">
        To receive sub-processor change notifications by email, subscribe below.
      </p>

      <form className="mt-6">
        {/*
          `<fieldset>` + `<legend>` group surfaces the "coming soon"
          context unconditionally — even when AT tab-skips the disabled
          controls, the legend is announced as the group label. This is
          load-bearing because native `disabled` removes inputs from the
          tab order, so `aria-describedby` on the controls is only
          consumed during arrow-key reading mode.
        */}
        <fieldset className="border-border-default bg-bg-elevated flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end">
          <legend className="text-fg-default px-2 text-sm font-semibold">
            Email subscription — activates when the email platform launches
          </legend>
          <div className="flex-1">
            <label
              htmlFor="subprocessor-email"
              className="text-fg-default block text-sm font-medium"
            >
              Email address
            </label>
            <input
              id="subprocessor-email"
              type="email"
              disabled
              aria-disabled="true"
              aria-label="Email address"
              aria-describedby="subprocessor-subscribe-status"
              placeholder="you@example.com"
              className="border-border-default bg-bg-elevated text-fg-default mt-2 block w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            disabled
            aria-disabled="true"
            aria-describedby="subprocessor-subscribe-status"
            className="bg-fg-default text-fg-inverse inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            Subscribe
          </button>
          {/*
            Status copy lives INSIDE the <fieldset> so the
            aria-describedby reference resolves within the same
            grouped-control context. The prior placement (outside
            </form>) was a valid forward cross-reference per ARIA 1.2
            but unreliable in NVDA + JAWS Forms Mode.
          */}
          <p
            id="subprocessor-subscribe-status"
            className="text-fg-muted basis-full pt-2 text-sm sm:pt-0"
          >
            Email subscription activates when the email platform launches. Until then, the canonical
            change record is this page — bookmark it to track updates.
          </p>
        </fieldset>
      </form>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Erasure + your rights</h2>
      <p className="text-fg-muted mt-4">
        When you exercise the right to erasure (GDPR Article 17, CCPA, Washington My Health My Data
        Act, Quebec Law 25), we orchestrate deletion across every sub-processor that holds your
        data. Some financial + audit records are retained under the Article 17(3)(b)
        legal-obligation exception (tax law, consent-demonstrability records); these are
        pseudonymised within 30 days of the erasure request and excluded from new processing.
      </p>
      <p className="text-fg-muted mt-4">
        See our{' '}
        <Link
          href="/en/legal/privacy-choices"
          className="text-fg-default underline underline-offset-2"
        >
          privacy choices
        </Link>{' '}
        page to exercise these rights.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Contact</h2>
      <p className="text-fg-muted mt-4">
        Questions about this list go to our{' '}
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
        This list was last reviewed on{' '}
        <time dateTime={LAST_REVIEWED}>{formatReviewDate(LAST_REVIEWED)}</time>. We review on every
        vendor change + at least quarterly.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Cross-references</h2>
      <p className="text-fg-muted mt-4">
        See also our{' '}
        <Link href="/en/legal/privacy" className="text-fg-default underline underline-offset-2">
          privacy policy
        </Link>{' '}
        and{' '}
        <Link href="/en/legal/cookies" className="text-fg-default underline underline-offset-2">
          cookie policy
        </Link>
        .
      </p>
    </section>
  );
}

/**
 * BAA-status pill — icon + text. The icon is aria-hidden so AT users
 * hear only the status string ("Executed" / "Required before use" /
 * "Not applicable") + the text retains the full semantic meaning per
 * WCAG 1.4.1 (no color-only signal — the icon is a visual scanning
 * aid for sighted procurement reviewers + the text label is the
 * actual data).
 */
function BaaStatusBadge({ status }: { status: SubProcessor['baaStatus'] }) {
  switch (status) {
    case 'Executed':
      return (
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="text-success-fg h-4 w-4" aria-hidden="true" />
          <span>{status}</span>
        </span>
      );
    case 'Required before use':
      return (
        <span className="inline-flex items-center gap-1.5">
          <Clock className="text-warning-fg h-4 w-4" aria-hidden="true" />
          <span>{status}</span>
        </span>
      );
    case 'Not applicable':
      return (
        <span className="inline-flex items-center gap-1.5">
          <Minus className="text-fg-subtle h-4 w-4" aria-hidden="true" />
          <span>{status}</span>
        </span>
      );
  }
}
