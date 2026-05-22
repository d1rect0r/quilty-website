import type { MetadataRoute } from 'next';

/**
 * AI crawler policy per D66 + U4.
 * Block training crawlers; allow live-search citation crawlers (ChatGPT,
 * Claude, Perplexity AI overviews). Account routes + APIs always private.
 */

const TRAINING_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Meta-ExternalAgent',
  'Bytespider',
] as const;

const CITATION_BOTS = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'] as const;

interface AllowRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
}

interface BlockRule {
  userAgent: string;
  allow: never[];
  disallow: string[];
}

/**
 * Both rule shapes use array-form `allow` + `disallow` for parser
 * consistency (SEO H4 — string-vs-array mixing in
 * `MetadataRoute.Robots` is permitted by Next.js types but some
 * crawler parsers do not coalesce a missing `Allow` line under a
 * `Disallow: /` rule the same way they coalesce an explicit
 * `Allow: ` line). The block rule emits an empty `allow: []` so the
 * rendered output is deterministic across user agents.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const allowRule = (userAgent: string): AllowRule => ({
    userAgent,
    allow: ['/'],
    // `/dev/` covers the dev-only `/dev/boom` throw route. Portal
    // routes are listed at both the locale-bare path (`/account/`)
    // and the locale-prefixed path (`/en/account/`) since the bare
    // entry would not match the actual `[locale]/` segment URLs;
    // `/*/account/` future-proofs additional locales.
    disallow: ['/account/', '/en/account/', '/*/account/', '/api/', '/dev/'],
  });

  const blockRule = (userAgent: string): BlockRule => ({
    userAgent,
    allow: [],
    disallow: ['/'],
  });

  return {
    rules: [allowRule('*'), ...CITATION_BOTS.map(allowRule), ...TRAINING_BOTS.map(blockRule)],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
