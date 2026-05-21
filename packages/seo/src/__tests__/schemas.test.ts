import { describe, expect, it } from 'vitest';
import {
  buildBreadcrumbsJsonLd,
  buildFAQPageJsonLd,
  buildMedicalWebPageJsonLd,
  buildOrganizationJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebSiteJsonLd,
} from '../schemas.js';

const SITE = 'https://my-quilty.com';

describe('Organization JSON-LD', () => {
  it('emits a graph-connected Organization node with brand fields', () => {
    const ld = buildOrganizationJsonLd(SITE);
    expect(ld['@type']).toBe('Organization');
    expect(ld['@id']).toBe(`${SITE}#organization`);
    expect(ld['name']).toBe('Quilty');
    expect(ld['legalName']).toBe('Quilty Inc.');
    expect(ld['url']).toBe(SITE);
  });
});

describe('WebSite JSON-LD', () => {
  it('cross-references the Organization node by @id', () => {
    const ld = buildWebSiteJsonLd(SITE);
    expect(ld['@type']).toBe('WebSite');
    expect(ld['@id']).toBe(`${SITE}#website`);
    expect(ld['publisher']).toEqual({ '@id': `${SITE}#organization` });
  });
});

describe('SoftwareApplication JSON-LD', () => {
  it('declares HealthApplication category + cross-references Organization', () => {
    const ld = buildSoftwareApplicationJsonLd(SITE);
    expect(ld['@type']).toBe('SoftwareApplication');
    expect(ld['applicationCategory']).toBe('HealthApplication');
    expect(ld['publisher']).toEqual({ '@id': `${SITE}#organization` });
  });
});

describe('BreadcrumbList JSON-LD', () => {
  it('numbers items from position 1', () => {
    const ld = buildBreadcrumbsJsonLd(SITE, [
      { name: 'Home', url: SITE },
      { name: 'Science', url: `${SITE}/science` },
    ]);
    const items = ld['itemListElement'] as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[0]?.['position']).toBe(1);
    expect(items[1]?.['position']).toBe(2);
    expect(items[0]?.['name']).toBe('Home');
  });

  it('handles an empty crumbs array', () => {
    const ld = buildBreadcrumbsJsonLd(SITE, []);
    expect(ld['itemListElement']).toEqual([]);
  });
});

describe('MedicalWebPage JSON-LD', () => {
  it('emits an AI-overview-ready node with patient audience', () => {
    const ld = buildMedicalWebPageJsonLd({
      siteUrl: SITE,
      url: `${SITE}/science`,
      name: 'The Science Behind Quilty',
      description: 'Evidence-informed mental health support.',
      lastReviewed: null,
      reviewedBy: null,
    });
    expect(ld['@type']).toBe('MedicalWebPage');
    // Patient subclass per schema.org canonical (AI-overview grounding).
    expect(ld['medicalAudience']).toEqual({ '@type': 'Patient' });
    expect(ld['publisher']).toEqual({ '@id': `${SITE}#organization` });
    expect(ld['isPartOf']).toEqual({ '@id': `${SITE}#website` });
  });

  it('omits lastReviewed + reviewedBy when null (no Person stub)', () => {
    const ld = buildMedicalWebPageJsonLd({
      siteUrl: SITE,
      url: `${SITE}/science`,
      name: 'X',
      description: 'Y',
      lastReviewed: null,
      reviewedBy: null,
    });
    expect(ld['lastReviewed']).toBeUndefined();
    expect(ld['reviewedBy']).toBeUndefined();
  });

  it('includes Person reviewer when provided', () => {
    const ld = buildMedicalWebPageJsonLd({
      siteUrl: SITE,
      url: `${SITE}/science`,
      name: 'X',
      description: 'Y',
      lastReviewed: '2026-05-19',
      reviewedBy: 'Dr. Reviewer',
    });
    expect(ld['lastReviewed']).toBe('2026-05-19');
    expect(ld['reviewedBy']).toEqual({ '@type': 'Person', name: 'Dr. Reviewer' });
  });
});

describe('FAQPage JSON-LD', () => {
  it('cross-references the containing page via @id + isPartOf', () => {
    const pageUrl = `${SITE}/science`;
    const ld = buildFAQPageJsonLd({
      pageUrl,
      entries: [{ question: 'Q1', answer: 'A1' }],
    });
    expect(ld['@id']).toBe(`${pageUrl}#faq`);
    expect(ld['isPartOf']).toEqual({ '@id': `${pageUrl}#webpage` });
    const main = ld['mainEntity'] as Record<string, unknown>[];
    expect(main).toHaveLength(1);
    expect(main[0]?.['name']).toBe('Q1');
  });
});
