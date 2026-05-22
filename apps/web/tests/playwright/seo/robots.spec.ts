import { test, expect } from '@playwright/test';

/**
 * robots.txt crawler-policy assertions per D66 + the Cloudflare
 * `Content-Signal` directive. The body is emitted by the Route
 * Handler at `/api/robots` and surfaced at `/robots.txt` via the
 * `next.config.ts` rewrite.
 */

const TRAINING_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Meta-ExternalAgent',
  'Bytespider',
  'TikTokSpider',
  'YandexBot',
];

const CITATION_BOTS = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'];

const USER_FETCH_BOTS = ['ChatGPT-User', 'Claude-User', 'Perplexity-User'];

test('@seo /robots.txt returns 200 + text/plain', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type'] ?? '').toContain('text/plain');
});

test('@seo /robots.txt names every training crawler with Disallow: /', async ({ request }) => {
  const response = await request.get('/robots.txt');
  const body = await response.text();
  for (const bot of TRAINING_BOTS) {
    // Paired User-agent + Disallow assertion: a regression that
    // accidentally emits `Allow: /` under a training bot would
    // unblock every training crawler. Match the User-agent line and
    // require a `Disallow: /` within the next 50 chars (the line
    // immediately under the User-agent). `[\s\S]` allows newlines.
    expect(body).toMatch(
      new RegExp(`^User-agent:\\s*${bot}\\s*[\\s\\S]{0,50}?Disallow:\\s*/\\s*$`, 'mi'),
    );
  }
});

test('@seo /robots.txt names every citation crawler with explicit Allow', async ({ request }) => {
  const response = await request.get('/robots.txt');
  const body = await response.text();
  for (const bot of CITATION_BOTS) {
    expect(body).toMatch(new RegExp(`^User-agent:\\s*${bot}\\s*$`, 'mi'));
  }
});

test('@seo /robots.txt names every user-fetch crawler with explicit Allow', async ({ request }) => {
  const response = await request.get('/robots.txt');
  const body = await response.text();
  for (const bot of USER_FETCH_BOTS) {
    expect(body).toMatch(new RegExp(`^User-agent:\\s*${bot}\\s*$`, 'mi'));
  }
});

test('@seo /robots.txt declares Content-Signal in the wildcard block', async ({ request }) => {
  const response = await request.get('/robots.txt');
  const body = await response.text();

  // Exact directive form per the Cloudflare proposal — must appear
  // verbatim. A typo in `ai-train` / `ai-input` would be silently
  // ignored by every crawler that honors the signal.
  const contentSignalLine = 'Content-Signal: search=yes, ai-input=yes, ai-train=no';
  expect(body).toContain(contentSignalLine);

  // The directive must appear EXACTLY ONCE — duplicates across
  // user-agent blocks are spec-undefined behavior.
  const occurrences = body.split(contentSignalLine).length - 1;
  expect(occurrences).toBe(1);

  // The directive must sit inside the wildcard block (not a
  // bot-specific one) — the wildcard `User-agent: *` line precedes
  // it within a contiguous block (no blank line between them).
  // Placement is end-of-block (after all Disallow rules) per RFC
  // 9309 + Cloudflare reference robots.txt — unrecognized in-record
  // lines are dropped by strict parsers, so the directive sits past
  // the rule-line region the strict parsers consume.
  const wildcardWithSignal = /User-agent:\s*\*[\s\S]{0,500}?Content-Signal:/;
  expect(body).toMatch(wildcardWithSignal);
});

test('@seo /robots.txt splits Applebot from Applebot-Extended', async ({ request }) => {
  const response = await request.get('/robots.txt');
  const body = await response.text();

  // Applebot (Spotlight + Siri retrieval) must NOT have a standalone
  // disallow block — it's covered by the wildcard allow. A standalone
  // `User-agent: Applebot` line would shadow the wildcard and trigger
  // a strict-parser denial.
  expect(body).not.toMatch(/^User-agent:\s*Applebot\s*$/im);

  // Applebot-Extended (Apple Intelligence training) MUST appear with
  // Disallow: /. Already covered by the training-bot User-agent
  // matrix above; this assertion documents the Applebot-split intent
  // explicitly so a future bot-list edit cannot silently drop it.
  expect(body).toMatch(/^User-agent:\s*Applebot-Extended\s*$/im);
});

test('@seo /robots.txt has no duplicate user-agent lines', async ({ request }) => {
  const response = await request.get('/robots.txt');
  const body = await response.text();

  const userAgentLines = body.match(/^User-agent:\s*\S+/gim) ?? [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const line of userAgentLines) {
    const normalized = line.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(normalized)) {
      duplicates.push(line);
    }
    seen.add(normalized);
  }
  expect(duplicates).toEqual([]);
});

test('@seo /robots.txt drops the Yandex-specific Host directive', async ({ request }) => {
  const response = await request.get('/robots.txt');
  const body = await response.text();

  // `Host:` is a Yandex-specific extension; Google Search Console
  // raises a warning on its presence. No reference shop ships it.
  expect(body).not.toMatch(/^Host:\s*/m);
});

test('@seo /robots.txt blocks portal + api + dev paths', async ({ request }) => {
  const response = await request.get('/robots.txt');
  const body = await response.text();

  // RFC 9309 §2.2.3 wildcard form `/account*` covers both the bare
  // path AND every subpath; the trailing-slash-only form leaves the
  // bare path crawlable per the spec's prefix-match definition.
  expect(body).toMatch(/^Disallow:\s*\/account\*/im);
  expect(body).toMatch(/^Disallow:\s*\/en\/account\*/im);
  expect(body).toMatch(/^Disallow:\s*\/\*\/account\*/im);
  expect(body).toMatch(/^Disallow:\s*\/api\//im);
  expect(body).toMatch(/^Disallow:\s*\/dev\*/im);
});

test('@seo /robots.txt declares a Sitemap pointer', async ({ request }) => {
  const response = await request.get('/robots.txt');
  const body = await response.text();
  expect(body).toMatch(/^Sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml\s*$/im);
});
