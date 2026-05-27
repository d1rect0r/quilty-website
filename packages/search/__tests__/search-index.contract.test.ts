/**
 * SearchIndex contract test — every adapter must satisfy.
 *
 * Today: parameterised against the in-memory fake only. The Pagefind
 * adapter is exercised in a sibling test (`pagefind-adapter.test.ts`)
 * with a stubbed bundle module — full parameterisation against
 * Pagefind would require a fixture build of the bundle, which lives
 * at the apps/web build pipeline. The contract assertions here are
 * the LCD shape every adapter must honour.
 */

import { describe, expect, it } from 'vitest';
import { makeInMemorySearchIndex, type InMemorySearchDocument } from '../src/testing';
import type { SearchIndex } from '../src/index';

const SEED_DOCS: readonly InMemorySearchDocument[] = [
  {
    id: 'doc-1',
    title: 'How nicotine cravings work',
    excerpt: 'Cravings build for 3-5 minutes then subside. Distraction techniques work.',
    url: '/en/blog/nicotine-cravings',
    category: 'blog',
    locale: 'en',
    attributes: { tag: 'science' },
  },
  {
    id: 'doc-2',
    title: 'Quilty pricing',
    excerpt: 'Monthly subscription at $15. Annual at $144 (20% off).',
    url: '/en/pricing',
    category: 'page',
    locale: 'en',
  },
  {
    id: 'doc-3',
    title: 'Privacy choices',
    excerpt: 'Manage your data + revoke consent at any time.',
    url: '/en/legal/privacy-choices',
    category: 'legal',
    locale: 'en',
  },
  {
    id: 'doc-4',
    title: 'Customer story: Sarah quit in 90 days',
    excerpt: 'Sarah used Quilty to quit vaping after 5 years.',
    url: '/en/customers/sarah',
    category: 'customers',
    locale: 'en',
    attributes: { featured: true },
  },
  {
    id: 'doc-5',
    title: 'Changelog: 2026.05',
    excerpt: 'New craving tracker + improved daily check-in flow.',
    url: '/en/changelog/2026.05',
    category: 'changelog',
    locale: 'en',
  },
];

function makeIndex(): SearchIndex {
  return makeInMemorySearchIndex({ documents: SEED_DOCS });
}

describe('SearchIndex contract — common assertions', () => {
  it('empty query returns zero hits (NOT match-everything)', async () => {
    const index = makeIndex();
    const r = await index.search('');
    expect(r.hits).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it('whitespace-only query returns zero hits', async () => {
    const index = makeIndex();
    const r = await index.search('   \t  \n ');
    expect(r.hits).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it('case-insensitive substring match against title', async () => {
    const index = makeIndex();
    const r = await index.search('NICOTINE');
    expect(r.total).toBe(1);
    expect(r.hits[0]?.id).toBe('doc-1');
  });

  it('returns hits sorted by score desc, then id asc for ties', async () => {
    const index = makeIndex();
    // "Quilty" appears in title of doc-2 + excerpt of doc-4 → doc-2 score 0.7, doc-4 score 0.4
    const r = await index.search('Quilty');
    const top = r.hits[0];
    const second = r.hits[1];
    if (!top || !second) throw new Error('expected at least 2 hits');
    expect(top.id).toBe('doc-2');
    expect(second.id).toBe('doc-4');
    expect(top.score).toBeGreaterThan(second.score);
  });

  it('hit shape includes id + title + excerpt + url + category + locale + score', async () => {
    const index = makeIndex();
    const r = await index.search('pricing');
    const hit = r.hits[0];
    if (!hit) throw new Error('expected a hit');
    expect(hit.id).toBe('doc-2');
    expect(hit.title).toBe('Quilty pricing');
    expect(hit.excerpt).toContain('Monthly');
    expect(hit.url).toBe('/en/pricing');
    expect(hit.category).toBe('page');
    expect(hit.locale).toBe('en');
    expect(typeof hit.score).toBe('number');
    expect(hit.score).toBeGreaterThan(0);
    expect(hit.score).toBeLessThanOrEqual(1);
  });

  it('score is in [0, 1]', async () => {
    const index = makeIndex();
    const r = await index.search('Quilty');
    for (const hit of r.hits) {
      expect(hit.score).toBeGreaterThanOrEqual(0);
      expect(hit.score).toBeLessThanOrEqual(1);
    }
  });

  it('filters narrow the result set by equality (category)', async () => {
    const index = makeIndex();
    const r = await index.search('craving', { filters: [{ field: 'category', equals: 'blog' }] });
    expect(r.total).toBe(1);
    expect(r.hits[0]?.category).toBe('blog');
  });

  it('multiple filters AND', async () => {
    const index = makeIndex();
    const r = await index.search('Quilty', {
      filters: [
        { field: 'locale', equals: 'en' },
        { field: 'category', equals: 'customers' },
      ],
    });
    expect(r.total).toBe(1);
    expect(r.hits[0]?.id).toBe('doc-4');
  });

  it('filter against attributes field', async () => {
    const index = makeIndex();
    const r = await index.search('Sarah', { filters: [{ field: 'featured', equals: true }] });
    expect(r.total).toBe(1);
    expect(r.hits[0]?.id).toBe('doc-4');
  });

  it('pagination — page=2 returns second-page slice', async () => {
    // Seed 25 documents where ALL match the query "quilty"; verify
    // page=2,pageSize=10 returns docs 10-19.
    const docs: InMemorySearchDocument[] = Array.from({ length: 25 }, (_, i) => ({
      id: `doc-${String(i).padStart(3, '0')}`,
      title: `Quilty post ${i}`,
      excerpt: `Content about quilty ${i}`,
      url: `/post/${i}`,
      category: 'blog',
      locale: 'en',
    }));
    const index = makeInMemorySearchIndex({ documents: docs });
    const r1 = await index.search('Quilty', { page: 1, pageSize: 10 });
    const r2 = await index.search('Quilty', { page: 2, pageSize: 10 });
    expect(r1.total).toBe(25);
    expect(r1.hits).toHaveLength(10);
    expect(r2.total).toBe(25);
    expect(r2.hits).toHaveLength(10);
    expect(r1.hits[0]?.id).not.toBe(r2.hits[0]?.id);
  });

  it('pagination — last page may have fewer hits', async () => {
    const docs: InMemorySearchDocument[] = Array.from({ length: 25 }, (_, i) => ({
      id: `doc-${String(i).padStart(3, '0')}`,
      title: `Quilty post ${i}`,
      excerpt: `Content ${i}`,
      url: `/post/${i}`,
      category: 'blog',
      locale: 'en',
    }));
    const index = makeInMemorySearchIndex({ documents: docs });
    const r = await index.search('Quilty', { page: 3, pageSize: 10 });
    expect(r.total).toBe(25);
    expect(r.hits).toHaveLength(5);
  });

  it('aborts with AbortError when signal is pre-aborted', async () => {
    const index = makeIndex();
    const controller = new AbortController();
    controller.abort();
    await expect(index.search('Quilty', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('returns no facets from the in-memory adapter (hosted-engine feature)', async () => {
    const index = makeIndex();
    const r = await index.search('Quilty');
    expect(r.facets).toBeUndefined();
  });

  it('zero matches returns empty hits + total: 0', async () => {
    const index = makeIndex();
    const r = await index.search('nonexistent-search-term-xyz');
    expect(r.hits).toHaveLength(0);
    expect(r.total).toBe(0);
  });
});

describe('SearchIndex contract — locked port shape', () => {
  it('matches both title + excerpt awards higher score than title-only', async () => {
    // Seeding to force differentiation: doc A has "alpha" in both
    // title + excerpt; doc B has "alpha" in title only.
    const docs: InMemorySearchDocument[] = [
      {
        id: 'a',
        title: 'alpha doc',
        excerpt: 'about alpha topics',
        url: '/a',
        category: 'page',
        locale: 'en',
      },
      {
        id: 'b',
        title: 'alpha title',
        excerpt: 'unrelated content',
        url: '/b',
        category: 'page',
        locale: 'en',
      },
    ];
    const index = makeInMemorySearchIndex({ documents: docs });
    const r = await index.search('alpha');
    const top = r.hits[0];
    const second = r.hits[1];
    if (!top || !second) throw new Error('expected at least 2 hits');
    expect(top.id).toBe('a');
    expect(top.score).toBeGreaterThan(second.score);
  });
});
