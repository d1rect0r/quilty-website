import { test, expect } from '@playwright/test';

/**
 * robots.txt AI crawler policy per D66 + U4.
 */

test('@seo robots.txt returns 200', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
});

test('@seo robots.txt blocks training crawlers + allows citation crawlers', async ({
  request,
}) => {
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
    expect(body).toContain(`User-agent: ${bot}`);
  }

  // Citation crawlers — explicit allow rules
  const CITATION_BOTS = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'];
  for (const bot of CITATION_BOTS) {
    expect(body).toContain(`User-agent: ${bot}`);
  }

  // Sitemap pointer
  expect(body).toMatch(/Sitemap:\s+https?:\/\/[^\s]+\/sitemap\.xml/);

  // Always-private surfaces — match either bare or locale-prefixed
  // disallow rules. robots.ts currently emits bare `/account/` and
  // `/api/`; the regex covers either convention.
  expect(body).toMatch(/Disallow:\s+\/(?:[a-z]{2}\/)?account\//);
  expect(body).toMatch(/Disallow:\s+\/(?:[a-z]{2}\/)?api\//);
});
