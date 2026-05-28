import type { NextRequest } from 'next/server';

/**
 * `/robots.txt` is rewritten to this endpoint via `next.config.ts`
 * so the response body can carry the Cloudflare-proposed
 * `Content-Signal` directive — a declarative AI-policy signal that
 * `MetadataRoute.Robots` cannot express today (the static-metadata
 * shape does not have a slot for per-block free-text directives;
 * Next.js #85382 tracks the gap). Directive spec:
 * https://developers.cloudflare.com/ai-audit/concepts/content-signal-policy/
 *
 * Policy (per D66 + the Vercel pattern):
 *   search=yes     live-search citation crawlers (OAI-SearchBot,
 *                  Claude-SearchBot, PerplexityBot) included in our
 *                  search index.
 *   ai-input=yes   AI assistants may quote our content with
 *                  attribution when answering a user's question
 *                  (the Perplexity / ChatGPT / Claude live-citation
 *                  path).
 *   ai-train=no    training crawlers blocked outright.
 *
 * Applebot (Spotlight + Siri retrieval) is covered by the wildcard
 * allow block; Applebot-Extended (Apple Intelligence training) stays
 * in TRAINING_BOTS. The split lets our content surface in
 * Spotlight + Siri without contributing to Apple's foundation model
 * training set.
 *
 * USER_FETCH_BOTS (ChatGPT-User, Claude-User, Perplexity-User) are
 * user-initiated fetches — explicit allow rules surface our policy
 * legibly even though the operators document that these user-fetch
 * agents may ignore robots.txt for direct on-demand queries. The
 * legibility is the point: a future enforcement-tooling sweep that
 * audits robots.txt will see we made the policy explicit.
 *
 * Deliberately NOT in TRAINING_BOTS:
 *   - Meta-ExternalFetcher — fetches OG metadata for link previews
 *     in WhatsApp / Facebook / Instagram DMs (NOT a training
 *     crawler). Blocking would render shared marketing links as
 *     blank cards on social surfaces.
 *   - Amazonbot — Amazon's general web crawler powering Alexa Q&A
 *     and Amazon Shopping (NOT the foundation-model trainer).
 *     Blocking would lose Alexa rank signals.
 *
 * ROBOTS_DENY=1 env var emits a global block-all instead — the
 * positive opt-in keeps the test suite simple (default behavior is
 * the full policy) while letting preview / staging deploys flip the
 * switch via the deploy environment without a code change.
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
  // YandexBot is not a foundation-model training crawler per se,
  // but a US-focused vaping cessation product has no Russian-market
  // intent. Blocking the general-index crawler keeps Quilty out of
  // a market we cannot legally + practically serve.
  'YandexBot',
] as const;

const CITATION_BOTS = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'] as const;

const USER_FETCH_BOTS = ['ChatGPT-User', 'Claude-User', 'Perplexity-User'] as const;

// RFC 9309 §2.2.1 defines path rules as prefix matches: `/account/`
// (12 chars with trailing slash) does NOT cover the bare `/account`
// (8 chars). The wildcard form `/account*` (RFC 9309 §2.2.3) covers
// both the bare landing path AND every subpath. Same applies to the
// locale-prefixed + dev variants. `/api/` is unambiguous because
// every Route Handler lives at `/api/<segment>/`.
const PRIVATE_PATHS = ['/account*', '/en/account*', '/*/account*', '/api/', '/dev*'] as const;

const CONTENT_SIGNAL = 'Content-Signal: search=yes, ai-input=yes, ai-train=no';

function originFromRequest(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit !== undefined && explicit !== '') {
    // Round-trip through `new URL` so a malformed env var (no scheme,
    // trailing-newline corruption, etc.) is caught here rather than
    // emitted as a broken `Sitemap:` line.
    try {
      return new URL(explicit).origin;
    } catch {
      // Fall through to the request-derived origin below.
    }
  }
  return new URL(request.url).origin;
}

function allowBlock(userAgent: string, extraDirectives: readonly string[] = []): string {
  // `extraDirectives` are appended AFTER the Allow + Disallow lines
  // rather than between User-agent and Allow. RFC 9309 §2.2 defines
  // a "record" as `User-agent` + rule lines (Allow / Disallow);
  // unrecognized directives in the middle of a record are silently
  // dropped by strict parsers (Googlebot, Bingbot). Placing the
  // directive as the LAST line of the record keeps it scoped to the
  // user-agent (the wildcard) while putting it past the strict
  // parser's rule-line region — Cloudflare's own reference robots.txt
  // uses this same end-of-record placement for `Content-Signal`.
  return [
    `User-agent: ${userAgent}`,
    'Allow: /',
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    ...extraDirectives,
  ].join('\n');
}

function disallowBlock(userAgent: string): string {
  // Training bots emit no `Allow:` line — RFC 9309 treats a sole
  // `Disallow: /` as a full block, and the empty-Allow noise some
  // parsers tolerate is omitted by every reference shop (Stripe,
  // Cloudflare, Anthropic robots.txt files all use the bare form).
  return `User-agent: ${userAgent}\nDisallow: /`;
}

export function GET(request: NextRequest): Response {
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    // The robots.txt body itself should not appear in search-engine
    // result pages (Google's own guidance) — belt-and-suspenders
    // against a stray index of the policy file. Pair `nofollow`
    // with `noindex` for consistency with the proxy.ts defense-in-
    // depth header on every other noindex surface.
    'X-Robots-Tag': 'noindex, nofollow',
    // 1h CDN TTL: short enough that a policy edit propagates within
    // the hour; long enough not to hammer origin on crawler revisits.
    'Cache-Control': 'public, max-age=3600',
  };

  if (process.env.ROBOTS_DENY === '1') {
    // Deny-path bypasses the 1h CDN TTL so flipping the gate
    // (typically a preview-deploy cut-over to allow indexing)
    // propagates immediately rather than waiting on edge expiry.
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { ...headers, 'Cache-Control': 'no-store' },
    });
  }

  const base = originFromRequest(request);

  const blocks = [
    allowBlock('*', [CONTENT_SIGNAL]),
    ...CITATION_BOTS.map((bot) => allowBlock(bot)),
    ...USER_FETCH_BOTS.map((bot) => allowBlock(bot)),
    ...TRAINING_BOTS.map(disallowBlock),
    `Sitemap: ${base}/sitemap.xml`,
  ];

  return new Response(blocks.join('\n\n') + '\n', { headers });
}
