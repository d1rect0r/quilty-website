import { test, expect } from '@playwright/test';

/**
 * robots.txt AI crawler policy per D66 + U4.
 */

test('@seo robots.txt returns 200', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
});

test('@seo robots.txt blocks training crawlers + allows citation crawlers', async ({ request }) => {
  const response = await request.get('/robots.txt');
  const body = await response.text();

  // Training crawlers — must be Disallow: /
  const TRAINING_BOTS = [
    'GPTBot',
    'ClaudeBot',
    'Google-Extended',
    'Applebot-Extended',
    'CCBot',
    'Meta-ExternalAgent',
    'Bytespider',
  ];
  for (const bot of TRAINING_BOTS) {
    // Next.js 16's MetadataRoute.Robots emits `User-Agent` (capital A);
    // robots.txt directive names are case-insensitive per RFC 9309.
    expect(body).toMatch(new RegExp(`^User-[Aa]gent:\\s*${bot}`, 'mi'));
  }

  // Citation crawlers — explicit allow rules
  const CITATION_BOTS = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'];
  for (const bot of CITATION_BOTS) {
    // Next.js 16's MetadataRoute.Robots emits `User-Agent` (capital A);
    // robots.txt directive names are case-insensitive per RFC 9309.
    expect(body).toMatch(new RegExp(`^User-[Aa]gent:\\s*${bot}`, 'mi'));
  }

  // Sitemap pointer
  expect(body).toMatch(/Sitemap:\s+https?:\/\/[^\s]+\/sitemap\.xml/);

  // Always-private surfaces — match either bare or locale-prefixed
  // disallow rules. robots.ts currently emits bare `/account/` and
  // `/api/`; the regex covers either convention.
  expect(body).toMatch(/Disallow:\s+\/(?:[a-z]{2}\/)?account\//);
  expect(body).toMatch(/Disallow:\s+\/(?:[a-z]{2}\/)?api\//);
});
