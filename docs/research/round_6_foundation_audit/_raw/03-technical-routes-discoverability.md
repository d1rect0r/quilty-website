# Round 6 — Track 2 / Agent A

## Technical Routes & Discoverability — Independent Audit

**Date:** 2026-05-19
**Scope:** Discoverability surfaces a 2026-grade enterprise consumer site ships under `/.well-known/`, the favicon/icon family, sitemap depth, `robots.txt` AI-crawler policy, OpenSearch, verification files, manifest depth, MTA-STS surfaces, AI-readable surfaces (llms.txt), domain-verification files for payments (Apple Pay / Stripe).
**Peer survey set (May 2026):** Stripe, Linear, Cal.com, Plain, Vercel, Sentry, Resend, PostHog, Anthropic, Cloudflare on the dev-tools side; Headspace, Calm, BetterHelp, Talkspace, Cerebral on the consumer mental-health side.
**Author:** `technical-routes-and-discoverability` review pass.

---

## 1. Executive summary

The Round-5 lock-down already gave us the difficult-to-retrofit pieces: per-route CSP, `robots.ts` with U4 AI-crawler policy, locale-aware `sitemap.ts`, `manifest.ts` skeleton, AASA + assetlinks for the existing iOS/Android deeplink contract. What is still missing — and what 2026-grade consumer-health peers ship as table-stakes — falls into three clean tiers.

Tier A (M1.5): `favicon.ico` + multi-size icon family + `apple-icon`, `/.well-known/security.txt` (RFC 9116; expires must be < 1y), `/.well-known/change-password` redirect (Chrome 86+, Safari 2019+), `/.well-known/gpc.json` (pairs with our existing `GpcHonoredIndicator` and is a CCPA/CPRA compliance signal regulators actually check), an OG default image at `/og-default.png`, and the Cloudflare `Content-Signal: ai-train=no` line in `robots.ts` (Sept 2025 standard, CC0-licensed, complements U4 not redundant with it).

Tier B (Mx-distributed): Apple Pay/Stripe payment-method-domain association file at M7, MTA-STS + TLS-RPT surfaces alongside the email-infra agent's findings, blog sub-sitemap + image sitemap at M4 when content lands, `llms.txt` + `llms-full.txt` at M4 when MDX content stabilises, `humans.txt` if/when we want to (low-priority signal).

Tier C (skip with reason): `browserconfig.xml` / `mstile-*.png` (Windows 8.x dead), Privacy Sandbox attestations (we run no ad-tech), Naver/Baidu/Yandex verification (no APAC focus), OpenSearch (Chrome inactive-by-default kills the UX), FedCM `web-identity` (we are not an IdP).

Net delta vs. M1: roughly 8 new files in `apps/web/public/.well-known/` + `apps/web/app/`, one new `MetadataRoute` (we may want `app/.well-known/security.txt/route.ts` to read from a single typed source so the Expires date is enforced in CI), and ~6 lines of supplementary Content-Signal output appended to `robots.ts`.

---

## 2. Inventory — what 2026 consumer-grade sites actually ship

### 2.1 `/.well-known/` directory

What peers consistently serve (existence check via WebFetch, May 2026):

| File                                            | Stripe                 | Linear       | Anthropic       | Vercel       | PostHog      | Cloudflare      | Resend       | Cal.com                 | BetterHelp                        | Headspace                | Calm                               |
| ----------------------------------------------- | ---------------------- | ------------ | --------------- | ------------ | ------------ | --------------- | ------------ | ----------------------- | --------------------------------- | ------------------------ | ---------------------------------- |
| `security.txt`                                  | yes (HackerOne)        | yes (mailto) | yes (HackerOne) | yes (mailto) | yes (mailto) | yes (HackerOne) | yes (mailto) | yes (GitHub advisories) | yes (mailto + Expires 2026-07-01) | **no (404)**             | **no (404)**                       |
| `apple-app-site-association`                    | n/a                    | n/a          | n/a             | n/a          | n/a          | n/a             | n/a          | n/a                     | yes                               | yes (Headspace + Ginger) | yes (Calm + Calm Sleep + Iterable) |
| `assetlinks.json`                               | n/a                    | n/a          | n/a             | n/a          | n/a          | n/a             | n/a          | n/a                     | likely                            | likely                   | yes (production + dev + staging)   |
| `change-password` (redirect)                    | n/a                    | n/a          | n/a             | n/a          | n/a          | n/a             | n/a          | n/a                     | n/a                               | n/a                      | n/a                                |
| `gpc.json`                                      | n/a                    | n/a          | n/a             | n/a          | n/a          | n/a             | n/a          | n/a                     | n/a                               | no (verified)            | n/a                                |
| `mta-sts.txt`                                   | unverified             | unverified   | unverified      | unverified   | unverified   | likely          | unverified   | unverified              | unverified                        | unverified               | unverified                         |
| `apple-developer-merchantid-domain-association` | yes (hosted on /files) | n/a          | n/a             | n/a          | n/a          | n/a             | n/a          | n/a                     | likely                            | likely                   | yes (subscription flow)            |

Key observations:

1. **`security.txt` is universal on B2B dev-tools** and adopted at BetterHelp on the consumer-health side. Headspace and Calm don't serve one as of May 2026 — a real gap vs. their B2B peers, and one we can beat on day one. Compliance with RFC 9116 expires-field discipline matters: a 2024 study of the top 1M domains found only 19% of those with a security.txt are RFC-compliant; 18% are already expired and 23% set the date too far in the future (RFC recommends < 1 year). Our implementation needs an explicit refresh cycle.
2. **Two patterns for `Contact:`** — HackerOne hosted (Stripe, Anthropic, Cloudflare) or `mailto:security@…` (Linear, Vercel, PostHog, BetterHelp). HackerOne is overkill at M1 for our scale; `mailto:` is the right starting point. Move to a hosted bounty platform only when (a) we have revenue (M7+) and (b) we are seeing inbound disclosure volume.
3. **`change-password` is not ubiquitous** but is in the Chrome credential-manager "compromised-password" remediation flow since v86 (Oct 2020) and Safari since 2019. Google, GitHub, Facebook, Twitter and WordPress all serve it. For an account-portal product where credential hygiene is part of the trust story, this is a low-cost signal worth shipping at M5 (when the password-change route exists). Spec: respond with `302 / 303 / 307` to the actual change-password page. W3C CG Working Draft, "WICG/change-password-url".
4. **`gpc.json`** — neither Headspace nor Calm serve it, but the W3C `gpc.json` resource is the file that automated GPC-compliance scanners (used by CPPA staff and class-action plaintiff firms post-Sephora) and the GPC Inspector browser extension look for. Format: `{"gpc": true, "lastUpdate": "2026-05-19"}`. Required to be served as `application/json`, HTTP 200, unauthenticated. Pairs with — does not replace — our existing edge-honored `Sec-GPC: 1` header detection.
5. **`apple-developer-merchantid-domain-association`** — Stripe ships the canonical file at `stripe.com/files/apple-pay/apple-developer-merchantid-domain-association`; we download it from our Stripe dashboard at M7 and host it at the exact path the file demands. Common pitfall: Let's Encrypt's certbot uses `/.well-known/` for ACME challenges, so the Next.js public static handler must coexist with that path (Vercel/SST static asset routing handles this natively, no conflict expected). The file is **not Stripe's anymore but Apple's** — registering the same domain twice can cause Apple to invalidate the association.
6. **Privacy Sandbox attestations** — only relevant if we directly call Topics, Protected Audience, Attribution Reporting, Shared Storage. We don't. Skip with rationale.
7. **Cloudflare `agents.json`** — emerging convention pointed at by `cloudflare.com/robots.txt`. Not yet a standard; skip for now and revisit if/when an MCP agent surface becomes part of the product.

### 2.2 Favicon + icon family (2026)

Modern minimum (per Next.js 16 file conventions, Evil Martians' favicon handbook, and what RealFaviconGenerator now emits):

1. `apps/web/app/favicon.ico` — multi-resolution ICO (16/32/48). Next.js auto-emits `<link rel="icon" href="/favicon.ico" sizes="any">`. Required for the legacy address-bar bookmark + Windows taskbar pin.
2. `apps/web/app/icon.svg` — single scalable monochrome. Next.js emits `<link rel="icon" href="/icon.svg" type="image/svg+xml" sizes="any">`. Inherits theme via CSS variables for dark/light without dual files.
3. `apps/web/app/icon.png` or `icon1.png` + `icon2.png` (96×96, 192×192, 512×512 PNGs; Next.js numbers them lexically).
4. `apps/web/app/apple-icon.png` (180×180) — Next.js auto-emits `<link rel="apple-touch-icon" sizes="180x180">`. iOS home-screen + Safari pinned-tab.
5. `manifest.webmanifest` icons (192×192, 512×512, including `purpose: "maskable"` and `purpose: "any"` variants). Already wired via `manifest.ts`, just stubbed.

**Deprecated (skip):** `mstile-*.png`, `browserconfig.xml`, `msapplication-TileImage`, `msapplication-TileColor` — Windows 8.x is EoL since Jan 2023; IE11 reached EoS June 2022; RealFaviconGenerator explicitly recommends omitting these in 2026.

**Active production bug:** Our current `manifest.ts` references `/icon-192.png` and `/icon-512.png` which do not exist in `apps/web/public/`. Lighthouse PWA audit, the `web_app_manifest_icons` test, and Chrome DevTools' Application > Manifest panel will all show "icons could not be loaded" on every deploy until we drop in stubs. **Tier A retrofit-hostile-zero-cost.**

### 2.3 Sitemap depth

What peers ship:

- **Stripe**: sitemap-index with 3 partitions (`/sitemap/partition-0.xml` … `partition-2.xml`). No image/news/video sub-sitemaps.
- **Anthropic, Linear, Headspace**: flat sitemap, ~750–1000 URLs each. No sub-sitemaps. Last-modified actively maintained.
- **Common pattern**: sitemap-index becomes necessary above ~5k URLs; below that, flat is fine. Google's hard ceiling is 50k URLs / 50MB per sitemap.

Specialized sub-sitemaps (image, news, video) are conspicuously **unused** by the dev-tools and mental-health peer set as of May 2026:

- **Image sitemap**: Google's docs still document the schema but consensus among 2025–2026 SEO sources is that proper `<img alt>` and Open Graph tags carry most of the signal; image sitemaps remain useful for image-heavy verticals (e-commerce catalog, stock photography) but not for marketing sites.
- **News sitemap**: only valuable if accepted into Google News Publisher Center, which has a 30-day rolling window — we are nowhere near that bar.
- **Video sitemap**: only if we host first-party video (we won't pre-M9).

Our current `sitemap.ts` already does the right things:

- Locale-aware (English-only at launch but ready for next-intl expansion per D14/D25).
- Excludes account routes + APIs + `.well-known`.
- Reserved 12 marketing routes per U2/U3 to prevent 301-chains later.
- Comment-flagged the `generateSitemaps()` migration point at 5k URLs.

What it doesn't do yet: emit `<xhtml:link rel="alternate" hreflang>` annotations once we add a second locale (D25 — defer until D25 triggers).

**IndexNow** (Bing + Yandex + Seznam + Yep, since 2021): 2025 adoption among dev-tool peers is uneven. Not shipped by Stripe, Linear, Vercel, Anthropic, PostHog. Headspace, Calm and BetterHelp don't appear to ship it. Adoption skews to e-commerce verticals where new-product-URL-discovery latency is part of the business case. For a marketing site that publishes ~1 blog post per week at steady-state (M9+), IndexNow's value is marginal vs. native Google Search Console submission. **Defer to M9.**

### 2.4 robots.txt depth

Our current `robots.ts` is competent for U4: it allows `OAI-SearchBot / Claude-SearchBot / PerplexityBot` (citation) and blocks `GPTBot / ClaudeBot / Google-Extended / Applebot-Extended / CCBot / Meta-ExternalAgent / Bytespider` (training).

2026 additions to consider:

1. **Cloudflare Content-Signals Policy** (Sept 24, 2025 — CC0). Adds a machine-readable line like `Content-Signal: search=yes, ai-input=yes, ai-train=no`. Three signals (`search`, `ai-input`, `ai-train`), each `yes` / `no` / omitted. Vercel and Resend both serve it. Cloudflare auto-injects for customers with managed robots.txt. This is **per-bot or global**; it expresses intent in a single line and is a useful belt-and-suspenders over our enumerated bot list because it covers crawlers we haven't enumerated yet. **Add at M1.5.**
2. **AI crawler delta** since U4 was written (Round 5, May 17):
   - `OAI-AdsBot` (OpenAI, April 2026) — only visits pages submitted as ad landing pages; we will never serve ads; skip.
   - `Claude-User`, `ChatGPT-User`, `Perplexity-User` (user-initiated fetchers) — these power "open this link in Claude / ChatGPT" UX flows where a logged-in user explicitly directs the model. **Allow these** because they imply explicit user request, not unattended scraping; blocking them breaks live citation behaviour that earns top-of-funnel traffic.
   - `Bytespider` (ByteDance/TikTok) — Hacker News-confirmed disregard for `robots.txt`. Real defence is WAF + UA-block at the edge; keep in the disallow list as a signal but understand it's symbolic.
   - `Amazonbot` (Amazon's AI) — emerging, low-volume; defer.
3. **`Crawl-delay`** — Google ignores it, Bing honours it weakly, Yandex actively reads it. For our traffic profile, skip.
4. **`Host` directive** — already emitted via `host: base` in our `robots.ts`. Originally Yandex-only; harmless for others.
5. **`Sitemap`** — already emitted at the bottom.

Perplexity has been observed (Cloudflare report, Aug 4, 2025) using undeclared crawlers that rotate UAs/IPs/ASNs to evade `robots.txt`. The robots.txt declaration is necessary-but-insufficient. The actual technical lock-down lives at the edge.

### 2.5 OpenSearch description (`opensearch.xml`)

Adoption among 2026 peer set: effectively zero. Chrome treats new OpenSearch registrations as "inactive" requiring manual activation. Firefox is shifting to WebExtensions. The cost/benefit doesn't pencil out for a B2C marketing site. **Skip with rationale.** Revisit if/when we build a hosted help-center with sitewide search (M9+); even then, in-product search delivers more value than browser-address-bar integration.

### 2.6 Verification files — Google Search Console, Bing, etc.

2026 best practice (validated against multiple SEO + DNS-ops sources):

| Engine                 | Recommended method                                          | Comment                                                       |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Google Search Console  | **DNS TXT** at apex, or CNAME on a Google-supplied hostname | File method is `google[hash].html` — fragile across redeploys |
| Bing Webmaster Tools   | **DNS TXT**                                                 | File method is `BingSiteAuth.xml` — same fragility            |
| Microsoft Clarity      | DNS or script tag                                           | We're not using Clarity (D42b — Amplitude/PostHog)            |
| Facebook domain        | DNS TXT (`facebook-domain-verification=…`)                  | Only matters if we run FB ads at scale                        |
| Pinterest              | DNS TXT                                                     | Defer                                                         |
| Brave Search           | RSS / sitemap                                               | Auto-discovered, no verification                              |
| Apple Search Ads       | DNS TXT                                                     | Only when mobile app ASA runs                                 |
| Yandex / Naver / Baidu | DNS TXT                                                     | **Skip** — no APAC focus                                      |

**Decision implication:** Verification files in `public/` are a fragility hazard (a junior dev deleting one to "clean up" un-verifies the property). Establish a precedent — and add to CLAUDE.md NEVER list — that all verification lives in the DNS layer (`quilty-aws/dns/`) so it travels with the domain across hosting migrations. Pattern A cross-account DNS coordination (D45) already supports this.

### 2.7 Domain reservation / subdomain strategy

Today (CLAUDE.md): `my-quilty.com`, `auth.my-quilty.com`, `help.my-quilty.com`, `app.my-quilty.com` (reserved).

Common peer subdomain patterns:

- `status.<domain>` — Stripe, Linear, Vercel, Cal.com, Sentry all run a status page. **Useful at M1.5 onward** because uptime monitoring is part of the trust story for a consumer-health product; cheap to ship via Better Stack / Statuspage / hosted Cachet.
- `trust.<domain>` — Vercel, Linear, Stripe ship trust centers (Drata/Vanta-hosted). **Defer to M8** — empty trust center hurts more than no trust center.
- `docs.<domain>` — only meaningful when we have public docs. **Defer.**
- `help.<domain>` — already reserved (U3). Activate when M9 help center triggers.
- `blog.<domain>` — discouraged; subdirectory `/blog/` consolidates SEO authority. Don't reserve.
- `careers.<domain>` — U2 defers careers indefinitely.
- `status.<domain>` and `auth.<domain>` are the only ones that _meaningfully_ matter at M1.5.

### 2.8 Email-as-discoverability files

These are website-domain files but their consumer is the email infrastructure. Coordinate with the email-infra agent's findings:

| File / Record    | Path / Type                                             | Purpose                                      |
| ---------------- | ------------------------------------------------------- | -------------------------------------------- |
| `mta-sts.txt`    | `https://mta-sts.my-quilty.com/.well-known/mta-sts.txt` | RFC 8461 — declares enforce-mode TLS         |
| `_mta-sts` TXT   | DNS TXT at `_mta-sts.my-quilty.com`                     | Policy ID pointer                            |
| `_smtp._tls` TXT | DNS TXT at `_smtp._tls.my-quilty.com`                   | RFC 8460 — TLS-RPT aggregate-report endpoint |

Best practice (2025): start in `mode: testing`, monitor 2–6 weeks of TLS-RPT, then switch to `mode: enforce`. Increment the `id:` tag every time the policy changes (cached otherwise). The `mta-sts.<domain>` subdomain pattern needs to be a separate HTTPS-served origin; for our SST + CloudFront setup this is a small extra distribution. Co-owned with the email-infra agent — flag for hand-off rather than design here.

### 2.9 Web app manifest depth

Our `manifest.ts` today is 4 lines of substance. 2026 best-practice manifest for a consumer-health product:

```ts
{
  name: 'Quilty',
  short_name: 'Quilty',
  description: '...',
  start_url: '/',
  scope: '/',
  id: '/',                          // stable PWA identity (avoids "different PWA" reinstall on path change)
  display: 'standalone',
  display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
  orientation: 'portrait-primary',
  background_color: '#…',
  theme_color: '#…',
  lang: 'en',
  dir: 'ltr',
  categories: ['health', 'lifestyle', 'medical'],   // PWA store discoverability
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  screenshots: [
    { src: '/screenshots/home-mobile.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow' },
    { src: '/screenshots/home-desktop.png', sizes: '1920x1080', type: 'image/png', form_factor: 'wide' },
  ],
  shortcuts: [                       // app-icon long-press shortcuts (Android home screen)
    { name: 'Account', url: '/account', icons: [/*…*/] },
    { name: 'Pricing', url: '/pricing', icons: [/*…*/] },
  ],
  related_applications: [
    { platform: 'play', url: 'https://play.google.com/store/apps/details?id=app.quilty.myquilty' },
    { platform: 'itunes', url: 'https://apps.apple.com/app/idXXXX' },
  ],
  prefer_related_applications: false,   // critical — IF true, browser suppresses PWA install in favour of native
}
```

`prefer_related_applications: false` is the right call for us — the website is meant to be a marketing surface that can install as a PWA for users without a native app, while not actively diverting visitors to the App Store. We want both surfaces to coexist.

`share_target`, `protocol_handlers`, `file_handlers`, `edge_side_panel`, `launch_handler` — all unnecessary for a marketing + account-portal site. They're for utility apps (Twitter as `web+share`, file viewers, etc.). Skip.

Calm and Headspace do not ship installable PWAs (verified by trying to fetch their manifest.json/webmanifest — both 404). The consumer-health peer set is overwhelmingly native-mobile-first. Our advantage: shipping an installable PWA-shell at M2 costs essentially zero (Next.js 16 manifest convention) and gives us optionality for users who can't / won't install the native app.

### 2.10 `X-Robots-Tag` HTTP header

For non-HTML responses that should never be indexed (API JSON, sitemap.xml itself is fine to be indexed, but any `/.well-known/openid-configuration` or `/api/og/*` opengraph images probably shouldn't be):

```
X-Robots-Tag: noindex
```

Lives in `proxy.ts` (Next.js 16 renamed `middleware.ts` per Round-5 S4). Apply selectively to `/api/*` responses — already protected by route handling, but the header is the belt-and-suspenders for someone landing on a JSON URL via direct link in a search snippet.

### 2.11 PWA + Service Worker

Next.js 16 does not ship a service worker by default. Common patterns:

1. **No SW + manifest only** — gives you install banner + home-screen icon but no offline. This is the default Lighthouse-installable bar in 2026.
2. **`next-pwa` / Serwist** — registers a Workbox-generated SW with stale-while-revalidate caching. Adds bundle complexity and CSP headaches (SW + `worker-src` directive). Wait until we have a clear offline-first use case.
3. **App Router native serviceWorker** — not yet idiomatic.

For our threat model (HIPAA-adjacent; service workers cache responses and we MUST NOT cache anything PHI-touching), a service worker introduces failure-mode complexity that doesn't pay back at M1–M5. **Defer SW to a triggered decision** — when (and if) a content-rich offline experience becomes a real user need post-M9.

### 2.12 Atom / RSS / JSON Feed

Convention as of 2026: a marketing site with a blog ships `/blog/feed.xml` (RSS 2.0) and optionally `/blog/feed.json` (JSON Feed 1.1). Anthropic, Linear, Stripe all expose RSS at `/blog/feed.xml` or similar.

For us this is **M4 work** when the blog ships (D30 — MDX in-repo first, migrate to Sanity later). Velite (D64) generates the feed from typed MDX frontmatter; pre-decide the URL now so future inbound links don't 301-chain.

**Recommend URL contract:** `/blog/feed.xml` (RSS), `/blog/feed.json` (JSON Feed). Discoverable from `<link rel="alternate" type="application/rss+xml">` in the blog index `<head>`.

### 2.13 OpenAPI / API docs surface

D48 + M5: Rust backend exports an OpenAPI spec; website is the BFF. Where should the spec live publicly (if at all)?

Two viable patterns:

1. **Public** at `api.my-quilty.com/v1/openapi.json` (CORS-enabled), with optional Scalar/Stoplight UI at `developer.my-quilty.com`. Useful only if we offer a public API for third-party developers.
2. **Internal-only** — the OpenAPI spec stays in the `quilty-aws` repo as a build artifact, codegen'd into `packages/shared-types` (D49 → D69) and Flutter on each release. Not served publicly.

For a HIPAA-adjacent consumer product with no public-API GTM motion at this scale, option 2 is the obvious answer. **No website surface needed until a developer-portal product decision lands.**

### 2.14 Human-readable signals — `humans.txt`, security-policy HTML

`humans.txt` is a 2011-era convention (humanstxt.org). Adoption among 2026 peer set: effectively zero (Stripe used to host a fun ASCII-art version; Linear doesn't). Cost is low, signal is low; skip with the option to add later if the team wants a low-key flex page.

`security-policy.html` linked from `security.txt`'s `Policy:` field IS canonical and useful — Linear, Stripe, Vercel, Cloudflare all link to one. Pair it with our `security.txt` rollout: a single page at `/security` describing scope, in-scope/out-of-scope assets, safe-harbour language, and response SLA.

### 2.15 AI-specific surfaces — `llms.txt`, `llms-full.txt`

Status (May 2026, per multiple sources):

- ~10% of websites have adopted llms.txt; ~844k implementations (BuiltWith). Major adopters: Anthropic, Cloudflare, Stripe, Vercel, Next.js, Zapier, Supabase. Mintlify auto-generated for thousands of docs sites on Nov 14, 2025 — the inflection.
- Google publicly said no (Gary Illyes, John Mueller, July 2025): not supported, not planned. Mueller compared it to the discredited meta-keywords tag.
- Real consumer is **IDE-side coding agents** (Claude Code, Cursor, Windsurf) and increasingly Anthropic + OpenAI fetch flows for citation-time lookups.
- Format: H1 title, optional blockquote summary, H2-delimited markdown link lists; `llms-full.txt` is the concatenated full content.

For a consumer-health marketing site, llms.txt has lower value than for a dev-tools company — we're not optimising for IDE-agent retrieval. It does, however, pair cleanly with U4: we already allow citation crawlers; an llms.txt makes the citation-ready summary easy to grab.

**Defer to M4** (when MDX content lands and Velite can auto-generate llms.txt from frontmatter). Reserve `/llms.txt` and `/llms-full.txt` as URL contracts now.

---

## 3. Gap list against our M1 state

### TIER A — M1.5 (retrofit-hostile or near-zero cost to ship now)

| #   | Gap                                                                                                                                                                               | Why now                                                                                                                                                                                                                                                                 | Effort                                                                                                                                                                                                                  | New decision                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| A1  | **Favicon + icon family**                                                                                                                                                         | Manifest references icons that don't exist; Lighthouse PWA audit fails on every deploy; favicon broken in prod the moment we cut over DNS at M1.5.                                                                                                                      | 1 designer-hour for stub icons + 30 min wiring through Next.js 16 conventions. Final brand icons land at M3 identity.                                                                                                   | — (M1.5 scaffold task)                     |
| A2  | **`security.txt` (RFC 9116)**                                                                                                                                                     | Standard since 2022; missing on Headspace + Calm but ubiquitous in B2B peer set; sets a researcher disclosure expectation before the product is exposed.                                                                                                                | 1 file. `mailto:security@my-quilty.com` (we control the alias via Google Workspace already). Expires = 364 days. **Refresh procedure must be in CI** — a hook that fails the build if Expires is < 30 days out.         | **D75**                                    |
| A3  | **`/security` policy page** linked from security.txt `Policy:` field                                                                                                              | Standard companion. Defines scope + safe-harbour.                                                                                                                                                                                                                       | 1 MDX page.                                                                                                                                                                                                             | folded into D75                            |
| A4  | **`/.well-known/change-password`** redirect                                                                                                                                       | Chrome credential-manager UX hook since v86. Once an account portal exists (M5) we'll want it; the file itself is a 302 redirect, costs nothing to land early as a route that 302s to `/account/security/password` (currently 404 — fine, redirect target lands at M5). | 1 route handler. 5 lines.                                                                                                                                                                                               | **D76**                                    |
| A5  | **`/.well-known/gpc.json`**                                                                                                                                                       | Pairs with our existing `GpcHonoredIndicator`; what compliance scanners and CPPA staff actually check; consumer mental-health is exactly the vertical where post-Sephora regulators look.                                                                               | 1 file. `{"gpc": true, "lastUpdate": "2026-05-19"}`. Refresh discipline same as security.txt.                                                                                                                           | **D77**                                    |
| A6  | **Cloudflare Content-Signal in robots.ts**                                                                                                                                        | CC0 standard since Sept 2025; adds belt-and-suspenders coverage for crawlers we haven't enumerated in U4's bot list.                                                                                                                                                    | 1 line: `Content-Signal: search=yes, ai-input=yes, ai-train=no`. Next.js `MetadataRoute.Robots` doesn't natively typed-support this — emit via supplementing `robots.ts` to write to a custom route or extend the type. | **D78**                                    |
| A7  | **OG default image** at `/og-default.png`                                                                                                                                         | Referenced from per-page metadata as fallback; absent today; every social share will look broken.                                                                                                                                                                       | 1 designer asset (1200×630).                                                                                                                                                                                            | (M1.5 scaffold task)                       |
| A8  | **Add `Claude-User`, `ChatGPT-User`, `Perplexity-User` to citation-allow set**                                                                                                    | User-initiated fetchers should be allowed; blocking breaks first-class citation UX.                                                                                                                                                                                     | Update `CITATION_BOTS` array in `robots.ts`.                                                                                                                                                                            | folded into **D78**                        |
| A9  | **Web app manifest depth** — `id`, `scope`, `categories`, `lang`, `dir`, `display_override`, `related_applications`, `prefer_related_applications: false`, maskable icon variants | Standard PWA 2026 surface; reduces install-bug class; `id` stabilises PWA identity across path/start_url changes.                                                                                                                                                       | 20-line addition to `manifest.ts`.                                                                                                                                                                                      | **D79**                                    |
| A10 | **Verification-via-DNS-only policy** documented in CLAUDE.md NEVER list                                                                                                           | Prevents future regression where someone drops `google[hash].html` into `public/` and it gets deleted on the next refactor.                                                                                                                                             | Documentation only.                                                                                                                                                                                                     | folded into **D75** or new convention note |

### TIER B — Mx-distributed

| #   | Gap                                             | When                                             | Notes                                                                                                                                                                    |
| --- | ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | `apple-developer-merchantid-domain-association` | **M7** (Stripe + Apple Pay)                      | Download from Stripe dashboard, place at `apps/web/public/.well-known/`. Test against `curl -I` for content-type `application/pkcs7-mime` or `application/octet-stream`. |
| B2  | `mta-sts.txt` + DNS records                     | **M8 or sooner if email-infra agent recommends** | Coordinate with email-infra agent's findings. The website domain hosts mta-sts subdomain; SST adds CloudFront distribution.                                              |
| B3  | Blog sub-sitemap                                | **M4** when blog ships                           | Velite-driven; `app/blog/sitemap.ts` route. Reference from sitemap-index.                                                                                                |
| B4  | Image sitemap                                   | **defer to M9+**                                 | Low priority for a non-image-heavy marketing site.                                                                                                                       |
| B5  | `llms.txt` + `llms-full.txt`                    | **M4**                                           | Velite generates from MDX frontmatter; reserve URL contracts now.                                                                                                        |
| B6  | RSS / JSON Feed                                 | **M4**                                           | `/blog/feed.xml`, `/blog/feed.json`. URL contract locked now.                                                                                                            |
| B7  | `status.my-quilty.com` subdomain                | **M2 / M3**                                      | Better Stack or Statuspage. Trust-story signal.                                                                                                                          |
| B8  | `humans.txt`                                    | **optional, M3+**                                | Low-effort low-signal; team flex page if desired.                                                                                                                        |
| B9  | `IndexNow` ping                                 | **M9+**                                          | Marginal value at our publishing cadence.                                                                                                                                |
| B10 | `share_target` in manifest                      | **M9+ if app surface ships**                     | Only if we ever offer a sharing target action.                                                                                                                           |

### TIER C — Skip (with rationale)

| #   | Gap                                                         | Rationale                                                                                                                                    |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `browserconfig.xml`, `mstile-*.png`, `msapplication-*` meta | Windows 8.x + IE11 EoL since 2022–2023. Skip.                                                                                                |
| C2  | `privacy-sandbox-attestations.json`                         | We do not call Topics, Protected Audience, Attribution Reporting, Shared Storage. Google is phasing out the private-advertising APIs anyway. |
| C3  | Naver / Baidu / Yandex verification                         | No APAC market focus.                                                                                                                        |
| C4  | `opensearch.xml`                                            | Chrome inactive-by-default kills the value; Firefox shifting to WebExtensions.                                                               |
| C5  | `/.well-known/web-identity` / FedCM                         | We are not an IdP; we're an RP via Cognito Managed Login.                                                                                    |
| C6  | `/.well-known/openid-configuration`                         | Same — Cognito serves this on `auth.my-quilty.com`.                                                                                          |
| C7  | `apple-developer-domain-association` (App-Clip variant)     | Only if we ship App Clips. We don't.                                                                                                         |
| C8  | `ads.txt`, `app-ads.txt`                                    | We don't run ad inventory.                                                                                                                   |
| C9  | `agents.json` (Cloudflare emerging)                         | Not yet a standard; revisit when an MCP/agent surface becomes a product line.                                                                |
| C10 | OpenAPI public surface                                      | No public-API GTM at this stage; spec lives in quilty-aws + codegen.                                                                         |
| C11 | Service worker                                              | HIPAA-adjacent caching-of-responses risk; defer until offline-first is a real use case.                                                      |
| C12 | Microsoft Clarity verification                              | D42b chose Amplitude (web + mobile) + PostHog session-replay-only — no Clarity.                                                              |

---

## 4. Conflicts with existing decisions

1. **D66 (robots.ts AI crawler policy) + U4** — does NOT conflict, but **expands cleanly**. Add Content-Signal line + user-initiated fetcher allow-list. Frame as a Round-6 supplement rather than a revision.
2. **D42b (Amplitude web + mobile + PostHog session replay only)** + the manifest's `categories: ['health', 'lifestyle', 'medical']` — no conflict but worth noting in the gpc.json reasoning: the more we declare consumer-health intent in surfaces like the manifest, the more compliance scrutiny we attract. Net positive — we want to be visibly compliant — but it amplifies the need for D77 (gpc.json) and rigorous PHI boundary discipline (D31).
3. **D45 (cross-account DNS pattern)** — implication: our verification-via-DNS policy (A10) means all verification TXT records pass through the `quilty-aws/dns/` layer's two-step coordinated deploy. Document this in the cross-account runbook so future engineers don't add verification HTML to `apps/web/public/`.
4. **D31 (zero PHI in website runtime)** — service worker decision (C11) reinforces this. Document the defer + reasoning in an ADR if/when someone proposes `next-pwa`.
5. **D43 / U4 / D66 trio** plus this Track 2A's D78 (Content-Signal) — keep them mutually-consistent: U4 bot enumeration + D78 Content-Signal + future PostHog opt-out wiring all express the same policy at different layers.

No D-numbers need outright revision. D66/U4 get a supplement.

---

## 5. Recommended new D-decisions

**D75 — security.txt + /security policy page**

- Serve `apps/web/app/.well-known/security.txt/route.ts` (Route Handler so we can emit `Content-Type: text/plain` and compute `Expires:` from a single typed constant in `lib/security/disclosure.ts`).
- Fields: `Contact: mailto:security@my-quilty.com`, `Expires: <365d from build>`, `Preferred-Languages: en`, `Canonical: https://my-quilty.com/.well-known/security.txt`, `Policy: https://my-quilty.com/security`, `Hiring: https://my-quilty.com/careers` (only if/when careers ships — until then omit Hiring).
- CI check: fail build if `Expires` < 30 days out (forces annual renewal).
- Companion `/security` MDX page lands as part of D75.

**D76 — /.well-known/change-password redirect**

- `apps/web/app/.well-known/change-password/route.ts` issues `307` to `/account/security/password`.
- Until M5 ships the actual portal route, the redirect target 404s — fine; the well-known existence is what credential managers detect.

**D77 — /.well-known/gpc.json**

- `apps/web/app/.well-known/gpc.json/route.ts` returns `{ gpc: true, lastUpdate: BUILD_DATE }` with `application/json`.
- Required to be served HTTP 200, unauthenticated, no cache > 1d.
- Cross-link from the privacy policy page (M4) describing exactly how we honour GPC.

**D78 — robots.ts Content-Signal supplement + user-initiated fetcher allow**

- Add Content-Signal line via custom route (Next.js `MetadataRoute.Robots` type doesn't yet support this — emit via a separate Route Handler that wraps the rendered output, OR override by composing the string in `robots.ts` with a `// @ts-ignore` carefully scoped to the supplementary line).
- Add `Claude-User`, `ChatGPT-User`, `Perplexity-User` to `CITATION_BOTS` array.

**D79 — manifest.ts depth**

- Add `id`, `scope`, `categories`, `lang`, `dir`, `display_override`, `related_applications` (lazily — only when iOS/Android store URLs are available), `prefer_related_applications: false`, maskable icon variants.

**D80 — verification-files-via-DNS-only**

- Add to CLAUDE.md NEVER list: don't place engine verification files in `apps/web/public/`. All verification lives in `quilty-aws/dns/` layer TXT records or Google-supplied CNAMEs.

---

## 6. Open scope questions for the user

1. **`security@my-quilty.com` alias** — we don't currently have this on the Google Workspace tenant; needs to be created (and forwarded to whoever should triage). Decision: who's the responder at M1.5? Probably you + (later) a small dispatch group.
2. **`/security` page content tone** — Linear/Vercel/Cloudflare all have safe-harbour language. We'll need legal sign-off on safe-harbour wording at M8 (legal-review milestone). For M1.5 ship a placeholder + flag for M8 review.
3. **Status page (B7)** — Better Stack vs. Statuspage vs. Cachet-self-hosted vs. defer entirely. Recommend Better Stack ($29/mo) for the trust signal; defer if budget-constrained.
4. **`security.txt` Contact: mailto: vs HackerOne** — start mailto:, move to HackerOne at M7 (revenue). Acceptable?
5. **`Hiring:` field in security.txt** — omit until careers page exists (U2 defers careers). Or include and link to `mailto:careers@…` interim?
6. **PWA install prompt UX** — `prefer_related_applications: false` is the recommend default; do we want to override to `true` once the native apps ship, to actively divert installs to App Store / Play? This is a marketing strategy call, not a technical one.
7. **MTA-STS coordination** — confirm this is in scope for the email-infra agent's Round-6 pass, so we don't double-cover.
8. **llms.txt content surface** — when M4 lands, do we want the AI-readable surface to mirror the marketing-site content 1:1, or a curated summary (Stripe/Anthropic curate; Vercel curates around entry points)? Decision deferrable to M4 but worth flagging.

---

## Appendix A — Peer security.txt examples (verified May 19, 2026)

```
# Stripe
Contact: https://hackerone.com/stripe
Expires: 2025-12-31T23:59:00.000Z    # EXPIRED — RFC violation
Acknowledgments: https://hackerone.com/stripe/thanks
Preferred-Languages: en
Canonical: https://stripe.com/.well-known/security.txt
Policy: https://hackerone.com/stripe?type=team&view_policy=true
Hiring: https://stripe.com/jobs

# Linear
Contact: mailto:security@linear.app
Expires: 2026-12-31T08:00:00.000Z
Policy: https://linear.app/security/vulnerability

# Anthropic
Contact: https://hackerone.com/4f1f16ba-…/embedded_submissions/new
Expires: 2026-12-31T23:59:00.000Z
Preferred-Languages: en
Canonical: https://anthropic.com/.well-known/security.txt
Policy: https://www.anthropic.com/responsible-disclosure-policy
Hiring: https://www.anthropic.com/careers

# Vercel
Contact: mailto:responsible.disclosure@vercel.com
Expires: 2026-02-05T12:00:00.000Z    # EXPIRED — RFC violation
Preferred-Languages: en
Canonical: https://vercel.com/.well-known/security.txt
Hiring: https://vercel.com/careers/security-researcher-us-5401260004

# Cloudflare
Contact: https://hackerone.com/cloudflare
Contact: https://www.cloudflare.com/abuse/
Policy: https://www.cloudflare.com/disclosure/
Hiring: https://www.cloudflare.com/careers/jobs/
Preferred-Languages: en
Canonical: https://www.cloudflare.com/.well-known/security.txt
# NB: NO Expires field — RFC violation

# PostHog
Contact: mailto:security-reports@posthog.com
Preferred-Languages: en
Canonical: https://posthog.com/.well-known/security.txt
Policy: https://posthog.com/handbook/company/security
# NB: NO Expires field — RFC violation

# BetterHelp (the only sampled consumer-health peer with security.txt)
Contact: security-reports@betterhelp.com
Expires: 2026-07-01
Canonical: https://www.betterhelp.com/.well-known/security.txt
Preferred-Languages: en

# Cal.com
Contact: https://github.com/calcom/cal.com/security/advisories
Expires: 2030-06-01T00:00:00.000Z    # RFC violation — > 1y
Canonical: https://cal.com/.well-known/security.txt
Policy: https://cal.com/security

# Resend
Contact: security@resend.com
Policy: https://resend.com/security
# NB: NO Expires field — RFC violation
```

Note: roughly half of the surveyed peer set violates the RFC 9116 Expires field discipline (either expired, missing, or > 1y horizon). Our implementation must do better — D75's CI check enforces this.

---

## Appendix B — Sources

- RFC 9116 (security.txt) — https://www.rfc-editor.org/rfc/rfc9116.html
- RFC 8615 (well-known URIs) — https://datatracker.ietf.org/doc/html/rfc8615
- W3C change-password-url Working Draft — https://www.w3.org/TR/change-password-url/
- Web.dev change-password convention — https://web.dev/articles/change-password-url
- W3C Global Privacy Control — https://www.w3.org/TR/gpc/ + https://globalprivacycontrol.org/implementation
- Cloudflare Content Signals Policy (Sept 24, 2025) — https://blog.cloudflare.com/content-signals-policy/
- Cloudflare Perplexity undeclared-crawlers report (Aug 4, 2025)
- Next.js 16 metadata file conventions — https://nextjs.org/docs/app/api-reference/file-conventions/metadata/{app-icons,manifest,sitemap,robots,manifest}
- llms.txt — https://llmstxt.org/ + Mintlify/Anthropic Nov 14, 2025 launch
- AI crawler survey (May 2026) — humansecurity.com, evolveamz.com, nohacks.co, arclightdigital.com.au, lumina-seo.com
- MTA-STS (RFC 8461) + TLS-RPT (RFC 8460) — best-practice synthesis from powerdmarc.com, mailmonitor.com, captaindns.com, mimecastsupport.zendesk.com
- Apple Pay merchant domain verification — https://developer.apple.com/documentation/applepaywebmerchantregistrationapi/preparing-merchant-domains-for-verification + Stripe pmd-registration docs
- IndexNow — https://www.indexnow.org/documentation
- OpenSearch (status 2025) — MDN + rsdoiel.github.io Aug 2025
- RealFaviconGenerator FAQ — https://realfavicongenerator.net/faq (mstile/browserconfig deprecated)
- Privacy Sandbox attestations — https://privacysandbox.google.com/private-advertising/enrollment
- Peer site .well-known/\* directories sampled May 19, 2026 (Stripe, Linear, Cal.com, Vercel, PostHog, Anthropic, Cloudflare, Resend, Headspace, Calm, BetterHelp)
