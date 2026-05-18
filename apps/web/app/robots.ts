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

const CITATION_BOTS = [
  'OAI-SearchBot',
  'Claude-SearchBot',
  'PerplexityBot',
] as const;

interface AllowRule {
  userAgent: string;
  allow: string;
  disallow: string[];
}

interface BlockRule {
  userAgent: string;
  disallow: string;
}

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const allowRule = (userAgent: string): AllowRule => ({
    userAgent,
    allow: '/',
    disallow: ['/account/', '/api/'],
  });

  const blockRule = (userAgent: string): BlockRule => ({
    userAgent,
    disallow: '/',
  });

  return {
    rules: [
      allowRule('*'),
      ...CITATION_BOTS.map(allowRule),
      ...TRAINING_BOTS.map(blockRule),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
