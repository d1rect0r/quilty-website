/**
 * Schema.org JSON-LD builders.
 *
 * Per D27 (Round-5 revised) — Organization + SoftwareApplication + WebSite +
 * BreadcrumbList carry SERP weight. MedicalWebPage on /science +
 * FAQPage for AI-overview citations only (Google retired FAQPage rich-result
 * eligibility 2026-05-07; MedicalWebPage was never Google-rich-result-supported).
 *
 * Output: serializable JSON-LD objects, rendered by <JsonLd> with a CSP nonce
 * (portal) or static-hash allowlist (marketing) per ADR-0005.
 */

type JsonLd = Record<string, unknown>;

const BRAND_NAME = 'Quilty';
const BRAND_LEGAL_NAME = 'Quilty Inc.';

export function buildOrganizationJsonLd(siteUrl: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl}#organization`,
    name: BRAND_NAME,
    legalName: BRAND_LEGAL_NAME,
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    sameAs: [],
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

export function buildBreadcrumbsJsonLd(
  siteUrl: string,
  crumbs: Breadcrumb[],
): JsonLd {
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
  url: string;
  name: string;
  description: string;
  lastReviewed: string | null;
  reviewedBy: string | null;
}

/**
 * MedicalWebPage. Per D27 Round-5: Google does not rich-result MedicalWebPage;
 * ship for AI-overview citation graphs (ChatGPT/Claude/Perplexity read JSON-LD
 * heavily in 2026) + semantic clarity. `lastReviewed` and `reviewedBy` are
 * null at M1 until /science has a named clinical advisor — fill in M3+.
 */
export function buildMedicalWebPageJsonLd(input: MedicalWebPageInput): JsonLd {
  // Spread-conditional pattern (safer under exactOptionalPropertyTypes than
  // post-declaration mutation — Round-5 TS reviewer finding).
  //
  // `medicalAudience: Patient` per Round-5 SEO reviewer — schema.org spec
  // recommends this for AI-overview grounding (ChatGPT/Claude/Perplexity
  // weigh medicalAudience when deciding whether to cite). Quilty's clinical
  // content is patient-facing, not clinician-facing.
  return {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    '@id': input.url,
    url: input.url,
    name: input.name,
    description: input.description,
    inLanguage: 'en-US',
    medicalAudience: { '@type': 'MedicalAudience', audienceType: 'Patient' },
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

export function buildFAQPageJsonLd(entries: FaqEntry[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}
