# Content / i18n / SEO / Metadata / Structured-Data / CMS Architecture Review

> Scope: M1 scaffold of `quilty-website` (Next.js 16 App Router + Tailwind v4 + SST on AWS, English-only at launch with `/[locale]/` reserved, MDX in repo, HIPAA-aligned consumer mental-health peer-set). 18 question areas, then top-7 retrofit-hostile gaps, then locked decisions and human-review items.

Evidence is anchored to real URLs (Next.js docs, SE Land, Cloudflare blog, Hostinger study, Schema.org, official robots.txt vendor docs, Velite/Sanity docs, GitHub issues). Citations inline.

---

## 1. i18n library winner 2026 for Next.js 16 App Router

**Current 2026 enterprise practice.** Two libraries dominate App Router work: `next-intl` and Paraglide. `next-intl` is purpose-built for App Router with first-class RSC support, ICU formatting, middleware-based locale negotiation, navigation-API wrappers (`<Link>` knows the locale), type-safe message keys, and a runtime cost of roughly 2 KB (server-rendered messages add zero client bytes). Paraglide takes the inverse approach — every message becomes a typed function (`m.signInTitle()`), bundles are tree-shaken per-locale, and it shines on URL-localised pathnames (`/de/ueber-uns`) but its React integration is younger than `next-intl`. LinguiJS is the smallest runtime but requires Babel/SWC macros, has weaker out-of-box autocompletion, and a smaller community. `react-i18next` is the legacy choice — it carries ~25 KB of i18next core, is context-driven (RSC-hostile without workarounds), and is the default only when React Native code is shared.

**Reference.** [SimpleLocalize 2026 round-up](https://simplelocalize.io/blog/posts/the-most-popular-react-localization-libraries/), [BuildPilot next-intl vs i18next vs Lingui](https://trybuildpilot.com/910-next-intl-vs-i18next-vs-lingui-2026), [next-intl routing docs](https://next-intl.dev/docs/routing), [Paraglide for Next.js](https://inlang.com/m/gerre34r). Stripe / Linear / Vercel / Cal.com do not publish their internal i18n choice; Cal.com's open repo uses `next-i18next` historically and is migrating piecewise; Vercel's marketing surfaces use `next-intl` patterns visible in `vercel/examples`.

**Recommendation.** **`next-intl` v4+** for Quilty. Reasons: RSC-native, smallest cognitive load, type-safe keys via TS plugin, has middleware + `<Link>` + `redirect()` wrappers, translated-pathname support if/when needed, and lowest retrofit cost (file layout already implies `/[locale]/`). Do not adopt Paraglide unless URL-localised pathnames become a hard requirement; do not adopt Lingui (macro toolchain conflicts with Turborepo + SWC tuning); do not adopt `react-i18next` (RSC-hostile).

**Retrofit cost if wrong.** **Medium**. Library swaps require touching every t-call site, the middleware, and the `[locale]` segment; mitigated by wrapping messages behind a thin internal `t()` facade from day-one.

---

## 2. Locale routing strategy

**Current 2026 enterprise practice.** Three options exist: sub-path `/[locale]/`, subdomain `en.<apex>`, ccTLD (`my-quilty.de`). Sub-path is canonical for SEO + dev ergonomics: it inherits a single domain's authority, plays well with `hreflang`, lets one CloudFront distribution serve all locales, and is Safari-ITP friendly (no cross-subdomain cookie shenanigans). Subdomain and ccTLD options exist for stronger geo-targeting but force per-domain certs, separate analytics properties, and break the BFF cookie model (`__Host-` is domain-scoped). Middleware-only rewriting (locale lives in a cookie, no URL segment) is well known to be RSC-hostile and brittle when combined with subdomain rewrites (see [Next.js Discussion #68114](https://github.com/vercel/next.js/discussions/68114) — "Unable to find next-intl locale because the middleware didn't run"). The historical [Next.js issue #23419](https://github.com/vercel/next.js/issues/23419) (auto locale-prefix UX) was the trigger for the App Router's "BYO i18n" stance; `next-intl` is the de-facto answer.

**Reference.** [Next.js i18n guide](https://nextjs.org/docs/app/guides/internationalization), [next-intl middleware docs](https://next-intl.dev/docs/routing/middleware), [Discussion #68114](https://github.com/vercel/next.js/discussions/68114).

**Recommendation.** **Sub-path `/[locale]/` with `localePrefix: 'as-needed'`** so English (the default) lives at bare `/`, future locales at `/de/`, `/es/`. Reserve the `[locale]` segment in M1 scaffold but expose only English routes. Emit `<link rel="alternate" hreflang="x-default" href="…/" />` even with one locale to lock the discipline in.

**Retrofit cost if wrong.** **High**. Switching from sub-path to subdomain (or vice versa) after launch is a 1:1 redirect-table + hreflang rewrite + analytics-property split exercise. Get it right at M1.

---

## 3. `metadataBase` + `generateMetadata` + canonical

**Current 2026 enterprise practice.** Root layout exports `export const metadata = { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL!) }`. Per-route metadata uses `export async function generateMetadata()` which returns `alternates: { canonical: './' }` — the relative form. The relative `'./'` is the only form that resolves to the _current_ path against `metadataBase`; using `'/'` always points at the homepage (frequent foot-gun), and absolute URLs in `canonical` defeat `metadataBase` and break preview deploys. Bug awareness: [Issue #83267](https://github.com/vercel/next.js/issues/83267) — when `alternates` + `openGraph.url` both set, Next.js 15.5.x moves tags into `<body>`; [Discussion #88315](https://github.com/vercel/next.js/discussions/88315) — streaming metadata can yield empty `<title>` to Googlebot; [Issue #54070](https://github.com/vercel/next.js/issues/54070) — trailing-slash on `metadataBase` root URL. Mitigation: always set a fallback `<title>` in root layout, and prefer non-streamed metadata for crawlers via `htmlLimitedBots` (next section).

**Reference.** [generateMetadata API ref](https://nextjs.org/docs/app/api-reference/functions/generate-metadata), [hreflang/canonical guide](https://www.buildwithmatija.com/blog/nextjs-advanced-seo-multilingual-canonical-tags).

**Recommendation.** Lock at M1:

- `metadataBase = new URL(env.NEXT_PUBLIC_SITE_URL)` in root layout (env-driven so previews differ from prod).
- Per-route `generateMetadata` returning `alternates: { canonical: './' }` and `openGraph: { url: './' }` — relative form throughout.
- Root layout `<title>` fallback to "Quilty" so Googlebot never sees an empty title under streaming.
- Do not embed absolute URLs in route metadata. All resolution flows through `metadataBase`.

**Retrofit cost if wrong.** **Medium**. Canonical fixes after the fact require a Search Console invalidation cycle (weeks) — cheap to do once, expensive to discover a problem from a CTR cliff six months in.

---

## 4. `htmlLimitedBots`

**Current 2026 enterprise practice.** `htmlLimitedBots` is a Next.js config option introduced alongside streaming metadata in 15.2 — it accepts a regex; user-agents matching it bypass streaming and receive fully-resolved metadata in the initial HTML. Default list covers Googlebot, Bingbot, Twitterbot, Slackbot, AdsBot-Google, Google-PageRenderer, Mediapartners-Google. Specifying your own regex **overrides** the default (advanced; not generally needed). Warning: combining `htmlLimitedBots: /.*/` with Next.js 16's `cacheComponents: true` triggers download regressions ([Discussion #85560](https://github.com/vercel/next.js/discussions/85560)) — use a specific regex if you must extend it.

**Reference.** [htmlLimitedBots docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots), [Discussion #76629 (disable streaming entirely)](https://github.com/vercel/next.js/discussions/76629).

**Recommendation.** **Accept the default at M1.** If/when AI crawlers misbehave on streamed metadata (Perplexity has been observed to bail on streamed `<title>`), extend with: `htmlLimitedBots: /googlebot|bingbot|baiduspider|lighthouse|perplexitybot|claudebot|gptbot|oai-searchbot/i`. Keep the default behaviour documented in an ADR so future engineers know the lever exists.

**Retrofit cost if wrong.** **Low**. One-line config; no migration cost.

---

## 5. `app/sitemap.ts` at scale

**Current 2026 enterprise practice.** Three patterns coexist: (a) single `app/sitemap.ts` for static + low-volume routes (≤500 URLs); (b) nested `sitemap.ts` per segment (`app/blog/sitemap.ts`, `app/features/sitemap.ts`) so each pipeline has its own revalidation cadence; (c) `generateSitemaps()` returning chunk IDs, with each chunk capped at Google's hard limit of 50,000 URLs / 50 MB. Native `generateSitemaps()` is the App Router winner for >1,000 pages — it auto-generates a sitemap index at `/sitemap.xml` referencing `/sitemap/0.xml`, `/sitemap/1.xml`, ... Enterprises typically chunk at 10k–25k for faster crawl-feedback loops. Use `MetadataRoute.Sitemap` type, key by ID range (`WHERE id BETWEEN`) not OFFSET, and set `revalidate` rather than fully-dynamic generation. `next-sitemap` (postbuild package) is a fallback only if you need `hreflang` alternates auto-emitted today; native `app/sitemap.ts` supports `alternates` natively in Next.js 15+.

**Reference.** [generateSitemaps API ref](https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps), [sitemap.xml file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap), [Next.js dynamic sitemap example](https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps#generating-a-sitemap-index).

**Recommendation.** M1 ships a single `app/sitemap.ts` enumerating the static marketing routes (homepage, /pricing, /science, /about, /contact, /privacy, /terms) with `lastModified` from the file's mtime via a small util. At M2-M4, add nested `app/blog/sitemap.ts` using `generateSitemaps` if blog ships. Always include `alternates.languages` in each entry once `/[locale]/` is active so it scales with i18n.

**Retrofit cost if wrong.** **Low**. Sitemap shape is rewriteable any session; the discipline of _having one_ matters more than which pattern.

---

## 6. `app/robots.ts`

**Current 2026 enterprise practice.** Use the file-convention `app/robots.ts` returning a `MetadataRoute.Robots` object — not a static `public/robots.txt` — so it can be environment-aware (staging returns `Disallow: /`, prod allows). 2026 has matured beyond binary allow-all/block-all: the dominant pattern (Hostinger 66.7B-request study, Cloudflare reports, Anthropic + OpenAI three-bot models) is **block training crawlers, allow search/retrieval crawlers**. Distinguish:

- **Training:** `GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, `Applebot-Extended`, `Meta-ExternalAgent`, `Bytespider`
- **Search/retrieval:** `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `ChatGPT-User`, `Claude-User`, `Perplexity-User`
- **Traditional:** `Googlebot`, `Bingbot`, `DuckDuckBot`

Always emit `Sitemap:` pointing at the absolute prod URL. Perplexity has been documented ignoring robots.txt — robots is advisory, pair with WAF/CloudFront rules if enforcement matters ([Cloudflare August 2025 report](https://blog.cloudflare.com/perplexity-is-using-stealth-undeclared-crawlers-to-evade-website-no-crawl-directives/)).

**Reference.** [robots.txt file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots), [Hostinger AI crawler data](https://www.hostinger.com/blog/ai-crawler-stats), [ALM Corp Anthropic three-bot framework](https://almcorp.com/blog/anthropic-claude-bots-robots-txt-strategy/).

**Recommendation.** M1 `app/robots.ts` that:

- Reads `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_ENV`.
- **Staging** (`vercel.app`, `*.dev.my-quilty.com`): `User-agent: * / Disallow: /` — full block.
- **Prod**:
  - Allow `*` on public routes; `Disallow: /account/`, `/api/`, `/_next/`, `/auth/callback`.
  - Allow `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` (we want AI citations as a peer of Calm/Headspace).
  - Disallow `GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, `Applebot-Extended`, `Meta-ExternalAgent`, `Bytespider` (HIPAA-aligned brand; no training on our content).
  - `Sitemap: https://my-quilty.com/sitemap.xml`.

**Retrofit cost if wrong.** **Low-Medium**. Adjustments are cheap; but a stale "Disallow: /" leaking to prod would deindex the site for days.

---

## 7. Schema.org strategy 2026

**Current 2026 enterprise practice.** The SERP-rich-results era is **shrinking**; the AI-citation era is **expanding**.

- **FAQPage:** **retired** by Google effective **May 7, 2026** ([Search Engine Land](https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957)). Rich-result reporting and the Rich Results Test drop FAQ support in June 2026; Search Console API in August 2026. The markup itself is still valid — AI engines (ChatGPT, Perplexity, Claude) continue to parse it. Keep emitting it for AI citations, do not expect blue-link enhancement.
- **MedicalWebPage:** valid Schema.org type; **does not** trigger dedicated Google rich results in 2026 (per [Google's Search Central forum thread](https://support.google.com/webmasters/thread/430307857/)). Still useful for entity disambiguation and AI overviews. Apply on `/science`, condition pages, methodology pages. **`lastReviewed` + `reviewedBy` (Person with credentials)** are the high-value properties for YMYL/health credibility.
- **Organization:** **mandatory** on every page via root layout. The single most-cited correlation with AI citation rates is connected `@id` graph (one `Organization` node with stable `@id`, all other types reference it via `publisher` / `provider`). Include `name`, `url`, `logo`, `sameAs` (LinkedIn, X, Crunchbase, App Store, Play Store), `foundingDate`, `description`.
- **SoftwareApplication / MobileApplication:** emit on `/`, `/features`, `/pricing` referencing both iOS bundle `app.quilty.myquilty` and Android equivalent, with `applicationCategory: "HealthApplication"`, `offers`, `aggregateRating` (when reviews exist).
- **WebApplication:** the `/account/*` shell can use this once the portal ships at M5; skip until then.
- **BreadcrumbList:** every non-root page. Audit case studies show ~22% CTR lift on appropriately marked-up pages.
- **Article / BlogPosting:** every blog/changelog entry. `author` (Person with credentials), `datePublished`, `dateModified`, `image`.
- **Person:** clinical advisors, founders. Cross-reference from `reviewedBy`, `author`, Organization `founder`.
- **MedicalEntity / MedicalCondition:** weak Google support; emit only where the page directly addresses a condition (anxiety, sleep, ADHD content). Low priority.
- **HowTo:** Google killed enhanced HowTo results in 2023. Skip.

AI-citation evidence: a dev.to study of 500+ sites identified JSON-LD as the #1 explanatory variable for AI citation; Perplexity in particular requires entity-name consistency between schema and page text.

**Reference.** [Schema.org MedicalWebPage](https://schema.org/MedicalWebPage), [Google FAQ deprecation notice](https://developers.google.com/search/docs/appearance/structured-data/faqpage), [ALM Corp May 2026 analysis](https://almcorp.com/blog/google-faq-rich-results-no-longer-supported/), [JSON-LD blueprint Medium](https://medium.com/@masebk1/the-json-ld-blueprint-that-gets-your-website-cited-by-ai-models-in-2026-6c71a5418ea9).

**Recommendation.** Ship in M1:

- `Organization` JSON-LD in root layout (stable `@id: https://my-quilty.com/#organization`).
- `WebSite` JSON-LD in root layout (`@id: https://my-quilty.com/#website`, `publisher` → Organization).
- `SoftwareApplication` JSON-LD on `/`, `/features`, `/pricing` referencing both mobile bundles.
- `BreadcrumbList` helper utility ready for use on all non-root pages from M2.
- `Article` helper for blog/changelog when M2-M4 enable them.
- `MedicalWebPage` + `lastReviewed` + `reviewedBy` helper ready for `/science` (M4).
- `FAQPage` helper ready but expect it as AI-citation signal only.

**Retrofit cost if wrong.** **Low** (cosmetic emission); **High** for entity-graph errors (mismatched `@id`s force a re-crawl cycle to repair Knowledge Graph entries).

---

## 8. AI-search optimisation 2026

**Current 2026 enterprise practice.** Empirical evidence on what moves AI citations:

- **Connected JSON-LD graph** (single `@id`-bound Organization, every type references it): documented 3-5x citation-rate lift (Stackmatix, Jonomor 2026 audits).
- **Server-side rendered schema** — Claude/non-JS scrapers cannot see JS-injected schema. RSC handles this for free; never use a client-side schema injector.
- **Entity-name consistency** — Perplexity discards schema when the JSON-LD `name` and visible page text disagree.
- **Semantic HTML** — `<article>`, `<section>`, `<header>`, `<footer>`, `<nav>`, descriptive heading hierarchy. Don't skip levels.
- **`llms.txt`** — over-hyped; the SE Ranking study of 300k domains shows ~10% adoption, GPTBot/ClaudeBot/PerplexityBot largely **ignore** it (408 fetches in 500M AI-bot visits, per Hostinger). An XGBoost model trained on citation data found `llms.txt` was noise, not signal. **However:** Anthropic, Stripe, Cloudflare, Zapier, Hugging Face all publish one as a hedge, and developer-tool agents (Cursor, Copilot, Claude Code, MCP servers) **do** consume it. Ship it as a half-day cost for optionality; don't expect citation lift.
- **Robots.txt allow-list** for `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` is the operationally most-cited high-leverage signal.

**Reference.** [limy.ai llms.txt 2026 guide](https://limy.ai/blog/llms.txt-in-2026-the-full-guide), [allmo.ai LLMs.txt 2026 report](https://www.allmo.ai/articles/llms-txt), [dev.to JSON-LD AI citation audit](https://dev.to/aivisbiz/i-audited-500-websites-json-ld-is-the-1-factor-for-ai-citation-29m4).

**Recommendation.** M1 ships:

- Connected Organization + WebSite JSON-LD graph in root layout.
- Robots.txt allow-listing AI search/retrieval bots.
- `public/llms.txt` and `public/llms-full.txt` as a half-day investment (skip if M1 budget is tight; add at M4 when content volume justifies).
- Entity-name lockdown in a single constant (`SITE_NAME = "Quilty"`) used by both schema and page text.
- Semantic HTML lint rule (`eslint-plugin-jsx-a11y` already in M1 catches most).

**Retrofit cost if wrong.** **Low** for tactical fixes; **Medium** for entity-graph rework.

---

## 9. Open Graph + Twitter cards at root + per-route

**Current 2026 enterprise practice.** Two-tier approach:

- **Root layout** defaults: `openGraph: { siteName, locale, type: 'website', images: ['/opengraph-image.png'] }` and `twitter: { card: 'summary_large_image', site: '@quilty' }`. The default `openGraph-image.png` is a 1200x630 PNG in `app/` root — Next.js file-convention.
- **Per-route** overrides via `opengraph-image.tsx` (file convention) generating dynamic images via `ImageResponse` from `next/og` (Edge runtime only, ≤500 KB bundle, flexbox-only CSS subset — Satori silently ignores grid/calc/CSS vars). Updated as of Next.js 16.1 + `@vercel/og` 0.6+. Static `opengraph-image.png` in a route folder is the simpler alternative for marketing pages with stable visuals.

Twitter cards: `summary_large_image` for almost everything; `summary` only for content lacking a hero image. The `twitter:` namespace inherits from `openGraph` defaults — only override fields that diverge.

**Reference.** [Next.js OG image docs](https://nextjs.org/docs/app/getting-started/metadata-and-og-images), [ImageResponse API](https://nextjs.org/docs/app/api-reference/functions/image-response).

**Recommendation.** M1:

- Static `app/opengraph-image.png` and `app/twitter-image.png` (1200x630) as global defaults.
- Per-route `opengraph-image.tsx` template (Edge runtime, flexbox, brand fonts via `fetch`) ready to drop into each marketing page.
- Root `metadata.openGraph` + `metadata.twitter` defaults set.
- For `/blog/[slug]`: dynamic `opengraph-image.tsx` pulling post `title` + `author` (M4 trigger).

**Retrofit cost if wrong.** **Low**. OG-image generation slots in any time.

---

## 10. MDX-as-content vs CMS day-1

**Current 2026 enterprise practice.** Three migration patterns observed:

- **Stay on MDX-in-repo:** Vercel marketing site, Stripe Sessions content, Anthropic docs, Resend docs. Works up to ~100-200 pages with ≤3 non-engineer authors. Trigger to move off: ≥3 non-engineer authors editing weekly, ≥200 pages, scheduled publishing required, marketing/legal/clinical workflow approval gates.
- **Hybrid (MDX + content collections):** Cal.com, PostHog, Dub. They moved off Contentlayer (sponsor Stackbit acquired by Netlify, project abandoned) to **Content Collections** (Sebastian Sdorra's successor — App Router + RSC native, Zod schema) or **Velite** (Zod schemas + extended `s` validators for `slug`, `isodate`, `mdx`).
- **Headless CMS day-1:** Headspace (Contentful Enterprise), Calm (Contentful), Oura (Contentful). Justified when launch volume already >100 pages with active marketing/clinical authors.

**Migration cost data:** PostHog's migration off Contentlayer → Content Collections is documented as a ~2-week engineering exercise on a ~300-page repo; Dub's similar. Migration MDX → headless CMS (Sanity/Contentful) is a 6-12 week effort at 100-300 pages — schema modeling alone is 1-2 weeks, then per-page rewrite, then editor-onboarding.

**Reference.** [Dub Contentlayer → Content Collections post](https://dub.co/blog/content-collections), [Velite docs](https://velite.js.org/), [Content Collections migration guide](https://www.content-collections.dev/docs/migration/contentlayer).

**Recommendation.** **MDX-in-repo at M1 with Velite (or Content Collections) as the build-time layer.** Lock the discipline of Zod-validated frontmatter from day-one so the page → CMS migration later is a one-time schema port, not a 100-file rewrite. Defer headless CMS until ≥3 non-engineer authors OR ≥150 pages OR scheduled publishing becomes a hard requirement. Per Quilty's CLAUDE.md the trigger is already documented as D30.

**Retrofit cost if wrong.** **Medium**. Hand-rolled MDX without frontmatter schema → CMS migration is High; with Velite/Content-Collections it's Medium (schema port). Going to CMS day-1 and finding it overkill is High (license, vendor lock-in, contract negotiation).

---

## 11. MDX schema enforcement at scaffold

**Current 2026 enterprise practice.** Velite or Content Collections are the two winners. Both consume Zod schemas; both compile to a JSON + .d.ts data layer; both fail the build on invalid frontmatter with file+field error reporting. Velite ships an extended `s` namespace (`s.slug()`, `s.isodate()`, `s.mdx()`, `s.image()`, `s.metadata()`) reducing boilerplate. Performance: Velite handles 1000 docs + 2000 assets in <8 s cold, <60 ms hot. Astro Content Collections is similar but framework-bound. Lightweight alternative: `zod-matter` (just frontmatter parse + validation, no build pipeline).

For "pages as typed block arrays" (matching the future Portable Text shape), the M1 discipline is: every MDX page exports a frontmatter that is Zod-validated, every embedded MDX component is registered in a single typed `components` map at the render site, and feature pages (`/features/...`) optionally expose a `blocks: BlockSchema[]` array in frontmatter to dry-run the Portable-Text-equivalent shape.

**Reference.** [Velite GitHub](https://github.com/zce/velite), [Velite extended schemas docs](https://velite.js.org/guide/velite-schemas), [zod-matter](https://github.com/HiDeoo/zod-matter), [Content Collections docs](https://www.content-collections.dev/).

**Recommendation.** **Velite** at M1 for `apps/web/content/**`. One `velite.config.ts` defining collections: `posts` (blog), `legal` (privacy/terms/baa-scope), `science` (research/methodology pages), `changelog` (later). Per-collection Zod schemas with `lastReviewed`, `reviewedBy` required on `science` and `legal`. Build output to `.velite/` consumed by route handlers.

**Retrofit cost if wrong.** **Low** at M1 (greenfield); **High** if skipped and added later (every existing MDX file gets touched).

---

## 12. CMS candidates 2026

**Current 2026 enterprise practice.** Trade matrix for HIPAA-aligned consumer-health zero-PHI marketing content:

| CMS            | HIPAA / BAA                                 | Editor UX                                                   | Dev model                                                       | When justified                                                                             |
| -------------- | ------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Sanity**     | BAA on request (Enterprise)                 | Studio is highly customisable; needs upfront dev investment | Schema-as-code TS, Portable Text, GROQ, real-time collab        | Multi-brand, structured-content discipline, editorial team ≥5, content ops as a discipline |
| **Contentful** | "HIPAA-ready," BAA via Enterprise sales     | Most polished out-of-box; enterprise default                | GraphQL/REST, Compose, Launch                                   | Procurement requires a "checkbox" CMS, marketing team large and non-technical              |
| **Payload**    | Self-host inside HIPAA-eligible AWS account | Strong, code-first                                          | MIT, Next.js-native (runs as a package); acquired by Figma 2025 | Maximum data control, willing to own infra, prefers open source, TS-native team            |
| **Strapi**     | Self-host responsibility                    | Decent                                                      | Self-host, plugin ecosystem                                     | Open-source preference, large content team, Node-shop                                      |
| **TinaCMS**    | Self-host responsibility                    | Visual MDX editing                                          | Git-backed, MDX-native                                          | Author count small but non-eng, Git-friendly authors                                       |
| **Builder.io** | Marketed for marketing teams                | Drag-and-drop with strong visual editing                    | Visual-builder model                                            | Marketing autonomy primary, dev velocity secondary                                         |
| **Kontent.ai** | Explicit HIPAA (BAA), SOC2, ISO27001        | Enterprise-grade                                            | API-first                                                       | Health/pharma compliance is the dominant constraint                                        |

**Reference.** [Headless CMS 2026 comparison](https://www.digitalapplied.com/blog/headless-cms-2026-sanity-contentful-payload-comparison), [Sanity HIPAA BAA notes](https://www.sanity.io/sanity-vs-payload), [Pooya Golchian Contentful vs Sanity vs Strapi vs Payload 2026](https://pooya.blog/blog/contentful-vs-sanity-vs-strapi-comparison-2026/).

**Recommendation.** **Defer CMS pick to D30 trigger.** When triggered:

- **Default Quilty pick: Sanity Enterprise.** Schema-as-code matches the M1 Velite discipline (Zod → Sanity schema port is mechanical), Portable Text is the typed-block target, BAA available, real-time collab handles clinical reviewers + marketing ops in parallel.
- **If procurement/marketing-velocity dominates:** Contentful Enterprise.
- **If max data control / no-vendor-BAA-risk:** Payload self-hosted in the `marketing-prod` account (post-Phase-1 trigger). Payload's Figma acquisition de-risks long-term viability.
- **Avoid** Strapi (smaller mindshare, self-host overhead without Payload's TS ergonomics), Builder.io (PHI-handling concerns under HIPAA), Kontent.ai (overkill unless PHI flows through CMS, which D31 forbids).

**Retrofit cost if wrong.** **High** — CMS migrations are 6-12 weeks at our scale.

---

## 13. Marketing block library taxonomy

**Current 2026 enterprise practice.** Two patterns:

- **Discriminated union `{ type, props }`** stored as JSON (Portable Text format) and rendered by a single `<PortableText components={...}>` switch. Sanity-native; ergonomic for CMS migration. `@portabletext/react` 3.x exposes `InferValue`, `InferComponents`, `InferStrictComponents` so the entire block array is inferred from your TypeGen-emitted query types. `InferStrictComponents` forces a handler per block type — perfect for "no block goes unrendered" discipline.
- **React-component-per-block** with hand-rolled MDX import paths. Faster initial DX, harder migration target (each block becomes an MDX shortcode, but the prop shape isn't centralised so the CMS port is per-block manual work).

**Reference.** [@portabletext/react docs](https://www.sanity.io/docs/portable-text-to-react), [react-portabletext GitHub](https://github.com/portabletext/react-portabletext/), [InferStrictComponents pattern](https://github.com/portabletext/react-portabletext/blob/main/MIGRATING.md).

**Recommendation.** M1-M4: **structure feature pages and pricing as a typed block array in MDX frontmatter** (Zod-discriminated union — `Hero | FeatureGrid | Pricing | Testimonial | CTA | LogoCloud | Stat`). One `<BlockRenderer blocks={...}>` component switches on `type`. When migrating to Sanity at the trigger, the same shape becomes a Portable Text custom-block schema and the renderer becomes the `components` map — near-zero rewrite. This is the "Stripe/Linear/Vercel block library" discipline.

**Retrofit cost if wrong.** **High** if you commit to per-page hand-rolled JSX. **Low** with the discriminated-union pattern from M1.

---

## 14. Permalink convention at scale

**Current 2026 enterprise practice.** Stripe (`stripe.com/blog/<slug>`), Linear (`linear.app/blog/<slug>`, `linear.app/method/<slug>`), Vercel (`vercel.com/blog/<slug>`), Resend (`resend.com/blog/<slug>`), PostHog (`posthog.com/blog/<slug>`). Universal pattern:

- `/blog/<kebab-case-slug>` — no date, no category prefix, no `/posts/` or `/articles/` or `/p/`.
- Short kebab-case slugs (4-6 words, stop-words removed).
- Distinct top-level paths only for evergreen-distinct content types: Linear's `/method/` for its public philosophy, Stripe's `/sessions/` for the conference, Vercel's `/changelog/`.
- Changelogs always at `/changelog` — first-class marketing surface in 2026.
- Customer stories at `/customers/<slug>` (Stripe, Linear, Vercel pattern).

**Slug collisions:** namespace by type — `/blog/<slug>` vs `/customers/<slug>` vs `/changelog/<slug>` cannot collide. Within a type, enforce uniqueness at the Velite build step (`s.slug({ unique: 'posts' })`).

**Reference.** Live inspection of stripe.com/blog, linear.app/blog, vercel.com/blog, resend.com/blog.

**Recommendation.** Lock now:

- `/blog/<slug>` — blog
- `/customers/<slug>` — case studies (M4+)
- `/changelog/<slug>` — changelog (M4+)
- `/legal/<slug>` — privacy, terms, BAA scope, cookie policy
- `/science/<slug>` — research/methodology pages
- `/account/*` — authenticated portal (M5)
- `/features/<slug>` or flat `/features` page? — decision below (Q15 human review).
- No date in slugs. No category prefix. Kebab-case. Velite enforces uniqueness.

**Retrofit cost if wrong.** **High** — slug rewrites trigger redirect-table sprawl, broken inbound links, lost link equity.

---

## 15. Redirect table

**Current 2026 enterprise practice.** Status codes:

- **301** = legacy "permanent moved," browsers may convert POST→GET (compatibility for very old clients).
- **308** = permanent, method-preserving. **Next.js default for `permanent: true`.** Use this unless you have an explicit legacy-client reason.
- **307** = temporary, method-preserving. Next.js default for `permanent: false`.
- **410** = Gone. Use for _intentionally retired_ URLs you want deindexed fast — not the same as 404. Cite: Search Engine Land, Google's own crawl guidance.
- **404** = Not found. Soft-404 risk if the body looks like a real page.

**Scale.** `next.config.ts` `redirects()` is fine up to ~100-200 entries; performance is array-iteration per request. Beyond that, push to CloudFront Functions (an SST/L@E layer) — pre-compiled hash-table lookup at the edge, microsecond latency. Migration trigger: the redirect table starts hurting cold-start or you need geo/header-based rules. **Anti-pattern:** blanket `/old/*` → `/` 301 (causes soft-404s in Google's eyes — Google treats high-volume redirects to a non-equivalent page as soft-404).

**Reference.** [Next.js redirects config](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects), [robertmarshall.dev 301 vs 308 in Next.js](https://robertmarshall.dev/blog/how-to-permanently-redirect-301-308-with-next-js/).

**Recommendation.** M1:

- `next.config.ts` `redirects()` array — but document the 200-entry policy in `docs/adr/`.
- Use `permanent: true` (308) by default for all permanent moves.
- Reserve 410 for deliberately retired pages (write a `gone()` helper that sets 410 status — useful when sunsetting a feature page).
- Document "no blanket redirects to /" rule.
- Trigger to migrate to CloudFront Functions: >150 entries, or first geo/header rule.

**Retrofit cost if wrong.** **Medium**. Migrations CloudFront-Functions are mechanical; status-code corrections after the fact require re-crawling.

---

## 16. Internal linking + breadcrumbs

**Current 2026 enterprise practice.** Three disciplines:

- **Visible breadcrumbs + matching `BreadcrumbList` JSON-LD** on every non-root page. Audits show 20-30% CTR lift on appropriately marked-up pages. Visible breadcrumbs **must** exactly mirror the schema (Google penalises mismatch).
- **Related-content panels** generated from frontmatter `tags` or explicit `related: [slug, slug]` in MDX frontmatter — manually curated for the top 50 pages, auto-suggested by tag for the rest.
- **Internal-link graph audit** at milestone boundaries (every non-trivial page should have ≥2 inbound internal links). Tools: Screaming Frog, Sitebulb, Ahrefs Site Audit. At Quilty scale (≤100 pages M1-M4), a Playwright-driven `pnpm audit:internal-links` script suffices.

**Reference.** [Google BreadcrumbList docs](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb), [Schema.org BreadcrumbList](https://schema.org/BreadcrumbList).

**Recommendation.** M1:

- `components/app/Breadcrumb.tsx` accepting an array `{ name, href }` and rendering both visible UI + `BreadcrumbList` JSON-LD.
- `lib/seo/breadcrumb.ts` deriving the path from a route map (one source of truth).
- Defer related-content + internal-link audit script to M4 when blog/changelog ship.

**Retrofit cost if wrong.** **Low**. Breadcrumb add-on is straightforward.

---

## 17. Page taxonomy for marketing IA

**Current 2026 enterprise practice.** Canonical enterprise IA observed across Stripe, Linear, Vercel, Resend, Notion, Cloudflare, Anthropic, plus health peers Calm, Headspace, Oura, Whoop:

| Section                              | Stripe             | Linear               | Vercel            | Calm                         | Headspace      | Oura        | At launch?                                                          |
| ------------------------------------ | ------------------ | -------------------- | ----------------- | ---------------------------- | -------------- | ----------- | ------------------------------------------------------------------- |
| Homepage `/`                         | ✓                  | ✓                    | ✓                 | ✓                            | ✓              | ✓           | **Yes**                                                             |
| Features `/features` (or `/product`) | ✓ products         | ✓ features           | ✓ features        | ✓ features                   | ✓ how-it-works | ✓ features  | **Yes**                                                             |
| Pricing `/pricing`                   | ✓                  | ✓                    | ✓                 | ✓ subscribe                  | ✓ subscribe    | ✓ shop      | **Yes**                                                             |
| Customers/Testimonials `/customers`  | ✓                  | ✓                    | ✓                 | partial                      | ✓              | partial     | **Trigger** (M4+; need real customer logos/quotes)                  |
| Science/Research `/science`          | n/a                | n/a                  | n/a               | ✓ /research                  | ✓ /science     | ✓ /research | **Yes** (health peer-set discipline)                                |
| Blog `/blog`                         | ✓                  | ✓                    | ✓                 | ✓                            | ✓              | ✓ /blog     | **Trigger** (M4+; ≥3 posts)                                         |
| Changelog `/changelog`               | ✓                  | ✓                    | ✓                 | partial                      | partial        | partial     | **Trigger** (M4+; product velocity proof)                           |
| Company `/company` or `/about`       | ✓                  | ✓                    | ✓                 | ✓                            | ✓              | ✓           | **Yes** (lightweight)                                               |
| Careers `/careers`                   | ✓                  | ✓                    | ✓                 | ✓                            | ✓              | ✓           | **Trigger** (hiring trigger)                                        |
| Contact `/contact`                   | partial            | ✓                    | partial           | ✓                            | ✓              | ✓           | **Yes**                                                             |
| Integrations `/integrations`         | ✓                  | ✓                    | ✓                 | partial (Apple Health, Oura) | partial        | ✓ partners  | **Trigger** (when integration count ≥3)                             |
| Docs `/docs`                         | ✓ docs.stripe.com  | ✓ docs sep subdomain | ✓ vercel.com/docs | n/a                          | n/a            | n/a         | **n/a** consumer health (no public API)                             |
| Security `/security` or `/trust`     | ✓ trust.stripe.com | ✓                    | ✓                 | partial                      | ✓              | ✓           | **Yes** (HIPAA-aligned; trust matters)                              |
| Legal `/legal/*`                     | ✓                  | ✓                    | ✓                 | ✓                            | ✓              | ✓           | **Yes** (privacy, terms, cookies, BAA scope, GPC)                   |
| Help `/help`                         | docs.stripe.com    | ✓                    | ✓                 | ✓                            | ✓              | ✓           | **Trigger** (volume + Zendesk/Intercom decision — see human review) |

Health peer-set adds `/science` as the credibility anchor. Stripe-class adds `/customers` and `/changelog` as velocity proof.

**Reference.** Live inspection May 2026 of stripe.com, linear.app, vercel.com, calm.com, headspace.com, ouraring.com, whoop.com.

**Recommendation.** **M2 launch IA (7 placeholder pages already in workflow_roadmap.md):**

- `/` (homepage)
- `/features` (or `/how-it-works`)
- `/science`
- `/pricing`
- `/about`
- `/contact`
- `/legal/privacy`, `/legal/terms`, `/legal/cookies`

**Add as triggers fire:**

- `/customers` at M4 (3+ named accounts or quotes)
- `/blog` at M4 (3+ posts)
- `/changelog` at M4
- `/careers` at hiring trigger
- `/integrations` at 3+ integrations
- `/help` at support-volume trigger (decision below)
- `/security` or `/trust` at M8 (formal HIPAA messaging)

**Retrofit cost if wrong.** **Medium**. Adding pages is cheap; removing or renaming after launch creates redirects + sitemap churn.

---

## 18. 404 / 500 page SEO

**Current 2026 enterprise practice.** Next.js 16 ships `not-found.tsx` (route-scoped) and `global-not-found.tsx` (app-wide, behind `experimental.globalNotFound`). Both **auto-inject `<meta name="robots" content="noindex">`** — manual emission is redundant. Key gotcha: response status locks to 200 if anything streams before `notFound()` is called. Avoid `loading.tsx` at the route level; use `<Suspense>` inside the page. Avoid premature `NextResponse.next()` in middleware. Cite: [Discussion #78288](https://github.com/vercel/next.js/discussions/78288).

For `/[locale]/`, add `app/[locale]/[...slug]/page.tsx` that calls `notFound()` so the localised 404 page actually renders on unmatched paths.

**Soft-404 prevention:**

- Never blanket-redirect old paths to `/` (Google treats as soft-404).
- Use 410 for _intentionally retired_ URLs (e.g., a sunset feature page).
- Sitemap must not contain URLs that return 404.
- Don't disallow `/_next/static/chunks/app/` (kills Googlebot's JS rendering — confirmed anti-pattern per Vercel CTO).
- Stagger deployments to reduce HTML-vs-chunks mismatch for in-flight Googlebot fetches.

500/error pages: `app/error.tsx` (route-scoped error boundary), `app/global-error.tsx` (app-wide, ignores CSS imports — inline styles only). Both should render brand-consistent UI, not the Next.js default frame. Neither indexed.

**Reference.** [not-found.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/not-found), [notFound() function](https://nextjs.org/docs/app/api-reference/functions/not-found), [Discussion #78288 soft-404s](https://github.com/vercel/next.js/discussions/78288).

**Recommendation.** M1:

- Custom `app/not-found.tsx` with branded design, search box, recovery links (`/`, `/features`, `/pricing`, `/help`).
- `app/error.tsx` and `app/global-error.tsx` with branded design.
- Enable `experimental.globalNotFound: true` if route groups are introduced.
- Sitemap generator filters 404-returning routes (will be relevant when blog/dynamic routes ship).
- `app/[locale]/[...slug]/page.tsx` calling `notFound()` for localised catch-all.
- Don't manually emit `noindex` on these — Next.js handles it.

**Retrofit cost if wrong.** **Low**. Branded error pages slot in any time.

---

## TOP-7 retrofit-hostile items (must land in M1 scaffold)

These are the items where a wrong default at M1 compounds into months of cleanup later — every other recommendation in this document is retrofit-Low to retrofit-Medium.

1. **Locale routing strategy — sub-path `/[locale]/` with `localePrefix: 'as-needed'`.** Switching to subdomain or ccTLD later is High retrofit. Reserve the segment in M1 even with English-only.
2. **`metadataBase` + relative `canonical: './'` discipline.** Wrong canonical strategy leaks for weeks before Search Console surfaces it.
3. **Permalink lockdown — `/blog/<slug>`, `/customers/<slug>`, `/changelog/<slug>`, `/legal/<slug>`, `/science/<slug>`, `/account/*`.** Slug changes after launch cause redirect-table sprawl + link-equity loss.
4. **Connected Organization + WebSite JSON-LD graph with stable `@id`s.** Knowledge Graph entries take weeks to repair if `@id`s change.
5. **Velite (or Content Collections) with Zod-validated MDX frontmatter from day-one.** Adding schema validation after 50+ MDX files exist is a per-file rewrite.
6. **Typed block-array discipline for feature/marketing pages** (discriminated union — `Hero | FeatureGrid | Pricing | …`). Without it, CMS migration is High; with it, Low.
7. **`app/robots.ts` env-aware + AI-bot category split.** A stale "Disallow: /" in staging or prod-leaked, or missing AI-allow-list, costs visibility silently for weeks.

---

## Decisions that change from baseline

| Decision                     | Baseline guess             | Locked recommendation                                                                                                                                                                                        |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `metadataBase`               | not set                    | **Set in root layout from `NEXT_PUBLIC_SITE_URL`**                                                                                                                                                           |
| Per-route `generateMetadata` | optional                   | **Required on every route with relative `canonical: './'`**                                                                                                                                                  |
| Canonical URL form           | absolute                   | **Relative `'./'`**                                                                                                                                                                                          |
| `app/sitemap.ts`             | single file                | **Single file at M1; nested + `generateSitemaps()` at trigger**                                                                                                                                              |
| `app/robots.ts`              | static `public/robots.txt` | **`app/robots.ts`, env-aware, AI-bot category split**                                                                                                                                                        |
| Schema.org types             | Article only               | **Organization + WebSite + SoftwareApplication + BreadcrumbList in M1; MedicalWebPage + `lastReviewed` + `reviewedBy` ready for `/science`; FAQPage ready as AI signal only (Google-deprecated May 7 2026)** |
| i18n library                 | "decide later"             | **`next-intl` v4+, sub-path routing, `localePrefix: 'as-needed'`**                                                                                                                                           |
| Content layer                | raw `next-mdx-remote`      | **Velite with Zod schemas in `apps/web/content/`**                                                                                                                                                           |
| Permalink convention         | `/blog/`, `/account/` only | **Full table: `/blog/`, `/customers/`, `/changelog/`, `/legal/`, `/science/`, `/account/`**                                                                                                                  |
| Redirect table               | none yet                   | **`next.config.ts` `redirects()` with 308 default, 410 for retired URLs, 200-entry policy documented in ADR, migrate to CloudFront Functions trigger documented**                                            |
| Block library                | per-page JSX               | **Typed discriminated-union block array, single `<BlockRenderer>`**                                                                                                                                          |
| OG images                    | static                     | **Static defaults + `opengraph-image.tsx` per route via `next/og` Edge runtime**                                                                                                                             |
| 404 / 500                    | default Next.js            | **Custom branded `not-found.tsx`, `error.tsx`, `global-error.tsx`; `[locale]/[...slug]` catch-all calling `notFound()`**                                                                                     |
| llms.txt                     | "AI hype, skip"            | **Ship `public/llms.txt` + `public/llms-full.txt` as half-day hedge at M4 when content volume justifies; do not expect citation lift**                                                                       |

---

## 5-10 UX/IA decisions needing human review

These are not retrofit-hostile; they're product decisions that need a non-engineer voice.

1. **Include `/science` at M2 (placeholder) or M4 (real content)?** Health peer-set (Calm, Headspace, Oura) all have one. Recommend: ship as placeholder at M2 with "Coming soon: peer-reviewed research underpinning Quilty" plus the methodology framework; flesh out at M4 once we have any first-party data or a clinical advisor named. Decision needed: do we have a named clinical advisor or research partner to credit at M2 launch?
2. **Include `/customers` or `/testimonials` at launch?** Stripe/Linear/Vercel all do; Calm uses logo wall + quote carousel. Decision needed: do we have ≥3 named users or B2B accounts willing to be quoted at launch? If no, defer to M4.
3. **Help center: self-host (Next.js + Velite + MDX) or Zendesk/Intercom subdomain?** Reserved `help.my-quilty.com` in CLAUDE.md D45 implies subdomain. Decision needed: when does support volume justify Zendesk/Intercom ($50-200/mo per agent), and do we want article SEO equity on the apex domain (self-host) or on a separate subdomain (Zendesk)? Recommendation: **self-host help center at launch + M2 as MDX**; migrate to Zendesk/Intercom only at support-volume trigger. Self-host preserves SEO equity and AI citation surface.
4. **Include `/careers` at launch?** Linear and Stripe both ship it from day-one as a brand signal even with zero open roles ("we're not hiring right now, but…"). Decision needed: do we want the brand signal? Recommendation: defer until first hire trigger; vacant `/careers` reads as ghost-town.
5. **AI overview opt-in/out: allow or block training crawlers?** Recommendation locked above is **allow AI search/retrieval bots, block AI training bots**. Decision needed: does Quilty want its content used to train OpenAI/Anthropic/Google Gemini/Apple/Meta models? HIPAA-aligned brand stance suggests no on training. Confirm.
6. **Changelog: marketing or product-led?** Stripe = one-line dated entries (product-led). Linear = long-form launch posts (marketing-led). Decision needed: which voice fits Quilty? Recommendation: **Linear-style long-form** matches the consumer-health peer-set tone and serves AI-citation goals better (more content per entry).
7. **`/integrations` at launch?** Mobile-only Quilty has minimal integrations today (Apple Health? Google Fit? Oura? Whoop?). Decision needed: which integrations exist or are on the roadmap that justify a marketing page? Recommendation: defer until 3+ integrations ship.
8. **Pricing page transparency: full price ladder + add-on stacking, or "Start free" + enterprise CTA only?** Stripe is famously transparent; consumer subscriptions (Calm, Headspace) lead with "free trial" + "$X/year" only. Recommendation: **consumer-subscription model** — lead with free trial + monthly/annual, hide add-ons until in-product.
9. **Trust / security surface at launch (`/security` or `/trust`)?** HIPAA-aligned brand will eventually need this. Recommendation: defer to M8 alongside legal/compliance work; at M2 ship `/legal/privacy` + cookie/GPC policy + a "How we protect your data" section on `/about`. Stripe-class `trust.stripe.com` subdomain is M9+ territory.
10. **Blog cadence + author model at first launch:** product-team-authored vs commissioned health writers vs hybrid? Recommendation: ship 3-5 high-quality posts (methodology, founders' note, why-we-built-this, science backgrounder) before public launch so the blog feels alive, not abandoned. Decision needed: who authors?

---

## Sources (anchor URLs)

- next-intl: https://next-intl.dev/docs/routing
- Paraglide: https://inlang.com/m/gerre34r
- Next.js generateMetadata: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Next.js htmlLimitedBots: https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots
- Next.js generateSitemaps: https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps
- Next.js robots.txt: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
- Next.js not-found: https://nextjs.org/docs/app/api-reference/file-conventions/not-found
- Next.js ImageResponse / next/og: https://nextjs.org/docs/app/api-reference/functions/image-response
- Next.js Issue #83267 (metadata in body): https://github.com/vercel/next.js/issues/83267
- Next.js Discussion #88315 (empty title streaming): https://github.com/vercel/next.js/discussions/88315
- Next.js Discussion #68114 (i18n + subdomain pain): https://github.com/vercel/next.js/discussions/68114
- Next.js Discussion #78288 (soft-404s): https://github.com/vercel/next.js/discussions/78288
- Next.js Discussion #85560 (htmlLimitedBots + cacheComponents): https://github.com/vercel/next.js/discussions/85560
- Google FAQ retirement: https://developers.google.com/search/docs/appearance/structured-data/faqpage
- Search Engine Land FAQ retirement: https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957
- Schema.org MedicalWebPage: https://schema.org/MedicalWebPage
- Schema.org BreadcrumbList: https://schema.org/BreadcrumbList
- Google BreadcrumbList docs: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
- ALM Corp three-bot framework (Anthropic): https://almcorp.com/blog/anthropic-claude-bots-robots-txt-strategy/
- Cloudflare Perplexity stealth crawler report: https://blog.cloudflare.com/perplexity-is-using-stealth-undeclared-crawlers-to-evade-website-no-crawl-directives/
- limy.ai llms.txt 2026: https://limy.ai/blog/llms.txt-in-2026-the-full-guide
- allmo.ai LLMs.txt report: https://www.allmo.ai/articles/llms-txt
- Velite: https://github.com/zce/velite
- Content Collections: https://www.content-collections.dev/
- Dub Content Collections migration: https://dub.co/blog/content-collections
- @portabletext/react: https://github.com/portabletext/react-portabletext
- Sanity vs Payload: https://www.sanity.io/sanity-vs-payload
- Digital Applied Headless CMS 2026: https://www.digitalapplied.com/blog/headless-cms-2026-sanity-contentful-payload-comparison
- JSON-LD AI citation audit (dev.to): https://dev.to/aivisbiz/i-audited-500-websites-json-ld-is-the-1-factor-for-ai-citation-29m4
- 2026 JSON-LD blueprint (Medium): https://medium.com/@masebk1/the-json-ld-blueprint-that-gets-your-website-cited-by-ai-models-i
