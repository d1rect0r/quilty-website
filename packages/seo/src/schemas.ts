/**
 * Schema.org JSON-LD builders.
 *
 * Per D27 (revised) — Organization + SoftwareApplication + WebSite +
 * BreadcrumbList carry SERP weight. MedicalWebPage on `/science` +
 * FAQPage for AI-overview citations only (Google retired FAQPage
 * rich-result eligibility 2026-05-07; MedicalWebPage was never
 * Google-rich-result-supported).
 *
 * Output: serializable JSON-LD objects, rendered by `<JsonLd>` with a
 * CSP nonce (portal) or static-hash allowlist (marketing) per ADR-0005.
 */

type JsonLd = Record<string, unknown>;

const BRAND_NAME = 'Quilty';
const BRAND_LEGAL_NAME = 'Quilty Inc.';

/**
 * Build the root Organization node. `sameAs` is omitted until real
 * entity URLs exist (App Store, LinkedIn, X, etc.) — an empty array
 * signals to AI citation graphs that no corroborating entity references
 * exist, reducing grounding weight. Callers with real entity URLs can
 * spread additional fields on top of the returned object before passing
 * to `<JsonLd>`.
 */
export function buildOrganizationJsonLd(siteUrl: string): JsonLd {
  // The Organization `logo` field points at the canonical raster asset
  // emitted by `apps/web/scripts/build-icons.mjs` (D109 — single SVG
  // source + sharp raster pipeline). Google's structured-data validator
  // 404-warns on this URL if it's missing, which suppresses the
  // knowledge-panel logo + drops AI-citation trust on the entity.
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl}#organization`,
    name: BRAND_NAME,
    legalName: BRAND_LEGAL_NAME,
    url: siteUrl,
    logo: `${siteUrl}/icon-512.png`,
  };
}

export function buildWebSiteJsonLd(siteUrl: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}#website`,
    name: BRAND_NAME,
    url: siteUrl,
    inLanguage: 'en-US',
    publisher: { '@id': `${siteUrl}#organization` },
  };
}

export function buildSoftwareApplicationJsonLd(siteUrl: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${siteUrl}#app`,
    name: BRAND_NAME,
    operatingSystem: 'iOS, Android',
    applicationCategory: 'HealthApplication',
    publisher: { '@id': `${siteUrl}#organization` },
  };
}

export interface Breadcrumb {
  name: string;
  url: string;
}

export function buildBreadcrumbsJsonLd(siteUrl: string, crumbs: Breadcrumb[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

export interface MedicalWebPageInput {
  siteUrl: string;
  url: string;
  name: string;
  description: string;
  lastReviewed: string | null;
  reviewedBy: string | null;
}

/**
 * MedicalWebPage. Per D27: Google does not rich-result MedicalWebPage;
 * ship for AI-overview citation graphs (ChatGPT/Claude/Perplexity read
 * JSON-LD heavily in 2026) + semantic clarity. `lastReviewed` and
 * `reviewedBy` are null until /science has a named clinical advisor.
 *
 * `publisher: { '@id': siteUrl#organization }` cross-references the
 * Organization node from the root layout so the JSON-LD graph stays
 * connected — AI crawlers reading an unaffiliated medical page without
 * organizational provenance discard it as low-trust.
 */
export function buildMedicalWebPageJsonLd(input: MedicalWebPageInput): JsonLd {
  // Spread-conditional pattern (safer under exactOptionalPropertyTypes
  // than post-declaration mutation). `medicalAudience: Patient` per
  // schema.org spec — AI-overview grounding weighs medicalAudience when
  // deciding whether to cite. Quilty's clinical content is patient-
  // facing, not clinician-facing.
  return {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    '@id': `${input.url}#webpage`,
    url: input.url,
    name: input.name,
    description: input.description,
    inLanguage: 'en-US',
    isPartOf: { '@id': `${input.siteUrl}#website` },
    publisher: { '@id': `${input.siteUrl}#organization` },
    // schema.org Patient subclass is the canonical form AI-overview
    // citation graphs (ChatGPT/Claude/Perplexity) ground against. The
    // freetext `audienceType: 'Patient'` on a MedicalAudience node is
    // also valid spec but less recognizable to citation heuristics.
    medicalAudience: { '@type': 'Patient' },
    ...(input.lastReviewed !== null && { lastReviewed: input.lastReviewed }),
    ...(input.reviewedBy !== null && {
      reviewedBy: { '@type': 'Person', name: input.reviewedBy },
    }),
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface FAQPageInput {
  pageUrl: string;
  entries: FaqEntry[];
}

/**
 * FAQPage. Includes `@id` + `isPartOf` so the node is graph-connected
 * to its containing page — orphan FAQPage nodes are devalued by
 * AI-overview citation graphs.
 *
 * Implicit contract for callers: the page rendering this FAQ block
 * MUST also render a WebPage-shaped node (e.g. `MedicalWebPage` on
 * `/science`, or a future generic WebPage builder) whose `@id` is
 * `${pageUrl}#webpage`. The FAQPage's `isPartOf` points there; if the
 * containing-page node is missing, AI citation graphs treat the
 * FAQPage as dangling and devalue it for grounding.
 */
export function buildFAQPageJsonLd(input: FAQPageInput): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${input.pageUrl}#faq`,
    isPartOf: { '@id': `${input.pageUrl}#webpage` },
    mainEntity: input.entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}
