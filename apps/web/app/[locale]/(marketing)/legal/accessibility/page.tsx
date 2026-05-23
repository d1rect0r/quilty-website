import { buildOpenGraphMetadata, JsonLd } from '@quilty/seo';
import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Accessibility Statement (D101).
 *
 * Per the European Accessibility Act (EAA, EU 2019/882) — enforcement
 * deadline 2025-06-28 — every consumer-facing service offered to EU
 * residents must publish a statement of conformance. The peer
 * convention (Stripe, Anthropic, Linear, GitHub) is a hand-written
 * ~500-word self-asserted policy with a feedback channel + a
 * supervisory-authority pointer. We follow that shape, lead with
 * WCAG 2.2 AA, and explicitly cite EN 301 549 v3.2.1 — the EU
 * standard most peers skip even though it is the EAA's conformance
 * basis.
 *
 * The page is indexable. Researchers + auditors discover the
 * statement via search; a noindex would push them through brittle
 * deep links.
 *
 * `/accessibility` is a `next.config.ts` redirect to this URL so the
 * shorter alias travels well on business cards + email signatures.
 */

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const pageUrl = `${siteUrl}/en/legal/accessibility`;

const PAGE_TITLE = 'Accessibility Statement';

const PAGE_DESCRIPTION =
  'Quilty targets WCAG 2.2 Level AA and EN 301 549. Report accessibility issues to accessibility@my-quilty.com — fifteen-business-day acknowledgement.';

const LAST_REVIEWED = '2026-05-22';

const ogMetadata = buildOpenGraphMetadata({
  ogImage: new URL('/og-default.jpg', siteUrl).toString(),
  ogImageAlt: 'Quilty — accessibility statement',
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
    canonical: '/en/legal/accessibility',
    languages: {
      // 'en-US' (BCP 47) matches inLanguage on the WebSite +
      // Organization graph anchors in @quilty/seo; bare 'en' diverges
      // from the cross-page anchor consistency the AI-citation
      // crawlers normalise against.
      'en-US': '/en/legal/accessibility',
      'x-default': '/en/legal/accessibility',
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

export default function AccessibilityStatementPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24" aria-labelledby="accessibility-heading">
      <JsonLd data={webPageJsonLd} />
      <h1 id="accessibility-heading" className="text-fg-default text-4xl font-semibold">
        Accessibility Statement
      </h1>

      <p className="text-fg-muted mt-6">
        Quilty is designed to support every user — including those who rely on assistive technology
        — in finding the support and information they need. This statement describes the
        accessibility standards we hold ourselves to, the known gaps we are working on, and how to
        reach us if you encounter a barrier.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Our commitment</h2>
      <p className="text-fg-muted mt-4">
        We design and build Quilty to be perceivable, operable, understandable, and robust for the
        widest possible audience. We treat accessibility as a continuous practice — not a checkbox —
        and we measure ourselves against the most recent WCAG guidance rather than a frozen
        snapshot. We do not use accessibility-overlay vendors; overlay products do not deliver WCAG
        conformance and have been the subject of repeated regulatory action and class-action
        complaints.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Standards we follow</h2>
      <p className="text-fg-muted mt-4">
        Quilty is designed to meet <strong className="text-fg-default">WCAG 2.2 Level AA</strong>,
        the conformance standard referenced by the European Accessibility Act (EU 2019/882) and{' '}
        <strong className="text-fg-default">EN 301 549 v3.2.1</strong>. We test with axe-core in
        continuous integration, run manual screen-reader passes with VoiceOver (macOS, iOS), NVDA
        (Windows), and TalkBack (Android), and keep keyboard-only navigation parity with
        pointer-driven interactions. Our color tokens are designed to meet the 4.5:1 contrast floor
        at AA; we are tightening the palette toward the 7:1 AAA floor at the brand-identity
        milestone.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Known limitations</h2>
      <p className="text-fg-muted mt-4">
        We track every known gap in our accessibility backlog and resolve them on a rolling cadence.
        Today&apos;s outstanding items include:
      </p>
      <ul className="text-fg-muted mt-4 list-disc space-y-2 pl-6">
        <li>
          Some color-contrast tokens sit at the AA 4.5:1 floor rather than the AAA 7:1 ceiling. A
          tightened palette is planned at the brand-identity milestone.
        </li>
        <li>
          Marketing illustrations carry generic alternative-text strings. Designer-authored,
          context-rich alt text replaces them when the visual identity locks.
        </li>
        <li>
          Several stub pages reuse the same placeholder copy. Real content authored against our
          plain-language guidelines lands at the content milestone.
        </li>
        <li>
          We have not yet engaged an external accessibility audit firm. We will, and we will prefer
          audit-class partners (e.g., Accessible by Design) over overlay-class vendors.
        </li>
      </ul>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Last reviewed</h2>
      <p className="text-fg-muted mt-4">
        This statement was last reviewed on <time dateTime={LAST_REVIEWED}>{LAST_REVIEWED}</time>.
        We review at least annually and on every meaningful UI change.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">How to report a barrier</h2>
      <p className="text-fg-muted mt-4">
        If you encounter an accessibility issue on Quilty — a missing label, a broken focus order, a
        keyboard trap, an unlabeled control, or anything else — please email{' '}
        <a
          href="mailto:accessibility@my-quilty.com"
          className="text-fg-default underline underline-offset-2"
        >
          accessibility@my-quilty.com
        </a>
        . Include the URL, a description of the issue, the assistive technology you were using (if
        any), and any screenshots or screen-recordings that help us reproduce. We acknowledge every
        report within <strong className="text-fg-default">fifteen business days</strong> and follow
        up with a remediation plan.
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Supervisory authority</h2>
      <p className="text-fg-muted mt-4">
        EU residents who are not satisfied with our response may escalate to the accessibility
        supervisory authority in their member state. Each member state publishes the relevant
        contact under the European Accessibility Act implementing legislation. We will provide the
        appropriate contact in response to any unresolved report.
      </p>
      <p className="text-fg-muted mt-4">
        For data-protection questions arising from accessibility correspondence, contact our{' '}
        <strong className="text-fg-default">Privacy Lead</strong> at{' '}
        <a
          href="mailto:privacy@my-quilty.com"
          className="text-fg-default underline underline-offset-2"
        >
          privacy@my-quilty.com
        </a>
        .
      </p>

      <h2 className="text-fg-default mt-12 text-2xl font-semibold">Cross-references</h2>
      <p className="text-fg-muted mt-4">
        See also our{' '}
        <Link href="/en/legal/privacy" className="text-fg-default underline underline-offset-2">
          privacy policy
        </Link>{' '}
        and{' '}
        <Link href="/en/security" className="text-fg-default underline underline-offset-2">
          security disclosure policy
        </Link>
        .
      </p>
    </section>
  );
}
