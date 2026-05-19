# Research: Content + i18n + SEO Architecture

> Source: general-purpose research agent, 2026-05-14 (Round 2).
> Lens: CORE / ADDITIVE / TRAP.

---

## 1. Content model: MDX-now, CMS-later is the dominant pragmatic path

The Web Almanac 2025 reports CMS-driven sites at 54% of the web, but the headless slice is still small relative to WordPress. Consumer companies almost universally start in-repo and migrate to a headless CMS at the inflection point where **non-engineers need to publish without a deploy** ([Watershed engineering blog](https://watershed.com/inside/evolving-mdx-publishing-with-a-headless-cms), [Stop Using Headless CMS for Small Projects](https://medium.com/@shakeef.rakin321/stop-using-headless-cms-for-small-projects-662eeb769ec2)). The structural decision that makes that migration painless is **modeling pages as ordered arrays of typed content blocks** from day one — even in MDX — rather than as monolithic prose. A `page = { hero, valueProps[], faq[], cta }` shape ports cleanly to Sanity's portable text or Contentful's reference fields; a free-form `.mdx` blob does not.

The other structural choice is **localizable-by-field intent even if you don't localize yet**: tag every user-visible string with a stable key (or live in an `en` directory) so the diff to add a locale is a copy, not a refactor. Sanity defaults to document-level i18n (separate document per locale, joined by reference), Contentful defaults to field-level (one document, per-locale values per field) ([Sanity docs](https://www.sanity.io/docs/localization), [iLangL on Contentful](https://ilangl.com/blog/expert-tips-for-contentful-website-localization/)). Field-level keeps translated copy collocated (easier for marketers); document-level lets locales diverge in structure (easier when EN ≠ DE page exists). For Quilty's likely path (translated, not divergent), **field-level is the structurally simpler choice** — pick Contentful or Sanity-with-internationalized-array-plugin.

## 2. i18n: next-intl + path-prefix is the unanimous 2025–2026 stack

Across multiple 2026 surveys, **next-intl is now the default for Next.js App Router** ([next-intl.dev](https://next-intl.dev/), [SimpleLocalize comparison](https://simplelocalize.io/blog/posts/the-most-popular-react-localization-libraries/), [BuildPilot 2026](https://trybuildpilot.com/910-next-intl-vs-i18next-vs-lingui-2026)). Lingui wins on bundle size via compile-time extraction; next-translate is fading. URL strategy: **subdirectory `/en/`, `/de/` is the consensus SEO winner** because it inherits root-domain authority ([better-i18n guide](https://better-i18n.com/en/blog/i18n-seo-hreflang-locale-urls-guide/), [digidop](https://www.digidop.com/blog/seo-international-2-strategies-url)). Subdomains split authority; ccTLDs are only worth it for legal/market reasons.

The "design for i18n minimum" without paying the full tax: (a) reserve the `/[locale]/` route segment now even with one locale, (b) set `<html lang>` dynamically, (c) emit self-referencing `hreflang` with `x-default` once you go multi-locale (missing self-reference invalidates the whole cluster — common mistake), (d) keep all user-visible strings in a translation file, never inline JSX. That's it. **Adding the first non-EN locale becomes 1–2 weeks of translation + QA rather than a 3-month refactor.**

## 3. SEO: small Next.js metadata surface, huge structural payoff

Day-one essentials with the Next.js App Router are cheap: `app/sitemap.ts`, `app/robots.ts`, `metadataBase` in root layout, per-route `generateMetadata`, canonical absolute URLs, and one trailing-slash convention enforced globally ([Next.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots), [JSDevSpace Next.js 16 guide](https://jsdevspace.substack.com/p/how-to-configure-seo-in-nextjs-16)).

For consumer mental health specifically, **schema.org `MedicalWebPage` is the structurally correct type** for any condition/symptom/treatment content, supplemented by `Organization`, `SoftwareApplication` (for the app itself), and `FAQPage` ([schema.org/MedicalWebPage](https://schema.org/MedicalWebPage), [Schema App healthcare guide](https://www.schemaapp.com/schema-markup/value-of-schema-markup-to-healthcare-organizations/)). Schema App's 2025 data shows AI-search citation rates rising 78–94% for sites with connected schema graphs — this matters more in 2026 than ranking does. Add `lastReviewed` and `reviewedBy` to clinical content; HIPAA-aligned mental-health sites that don't are leaving E-E-A-T signal on the table.

INP replaced FID as a Core Web Vital on **March 12, 2024**; threshold is **≤200 ms at p75** for "good" ([web.dev/inp](https://web.dev/articles/inp)). Only 48% of mobile pages pass all three CWVs in the 2025 Web Almanac — Quilty starting from a clean Next.js + Cloudfront build should clear this trivially if it tracks RUM from day one (set up `next/third-parties` or Vercel Speed Insights).

Headspace's traffic story (722k monthly organics from 143k+ keywords via a hub-and-spoke topical-authority model — [Grizzle case study](https://grizzle.io/blog/headspace)) is the proof point for content-led growth in this category. The structural enabler is **templated content types with stable URL conventions** (e.g., `/meditation-for/{topic}`), not bespoke pages.

## 4. Marketing pages: component-block templates, not bespoke

Atomic Design ([Brad Frost](https://atomicdesign.bradfrost.com/)) is the canonical vocabulary, though 2025 frontend communities note it's now usually subsumed into Feature-Sliced or Modular Architecture. The structurally important thing: **define a fixed library of marketing blocks** (Hero, ValueProp, FeatureGrid, FAQ, TestimonialQuote, CTABanner) so a non-engineer can compose a new landing page from the CMS without a deploy. This is the same decision as §1 — model pages as block arrays.

## 5. Blog: pick a permalink pattern now

Even with no blog, **decide `/blog/{slug}` vs `/learn/{topic}/{slug}` vs `/articles/{year}/{slug}` before launch**. Date-based URLs age poorly for evergreen wellness content; topic-based or flat-slug is preferred for hub-and-spoke SEO. Lock it; redirects later are debt.

## 6. Sitewide search: ADDITIVE, not CORE

Pagefind ($0, runs in browser, MIT) is sufficient for sub-1000-page static sites; Algolia earns its $0.50/1k records when you need typo tolerance, synonyms, analytics, multi-language ranking ([Static Signal Pagefind writeup](https://staticsignal.io/posts/static-site-search-with-pagefind/), [DanLevy](https://danlevy.net/you-might-not-need-algolia/)). Defer entirely until you have >50 indexable pages.

## 7. Content governance: codify the seam, not the process

The CORE seam is the **block schema** (what types of content exist, with what required fields). The ADDITIVE part is the editorial calendar, style guide, review workflow.

## 8. Redirects: maintain a redirect table from URL #1

Enterprise pattern: a versioned `redirects.json` (or `next.config.js` `redirects()`) treated as a load-bearing artifact. **301 when authority should move; 410 when content is gone with no replacement** — never blanket-301 to homepage (Google detects soft-404).

---

## CORE / ADDITIVE / TRAP table

| Decision                                                  | Verdict      | Notes                                                                 |
| --------------------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| Pages-as-typed-block-arrays (even in MDX)                 | **CORE**     | Enables painless CMS migration; same shape ports to Sanity/Contentful |
| `/[locale]/` route segment reserved, single-locale launch | **CORE**     | Adding 2nd locale becomes copy job, not refactor                      |
| next-intl on App Router                                   | **CORE**     | Dominant 2026 choice; switching costs later are real                  |
| Subdirectory (`/de/`) vs subdomain/ccTLD                  | **CORE**     | SEO authority compounding; reversal is painful                        |
| Trailing-slash convention enforced globally               | **CORE**     | Cheap now, expensive to flip after indexing                           |
| Absolute canonical URLs + `metadataBase`                  | **CORE**     | Prevents duplicate-content debt                                       |
| Schema.org `MedicalWebPage` + `Organization` baseline     | **CORE**     | Drives AI-search citation, HIPAA-credibility signal                   |
| Sitemap.ts + robots.ts at launch                          | **CORE**     | 30 min of work; gate to indexing                                      |
| Redirect table as versioned artifact                      | **CORE**     | Compounds; SEO debt is asymmetric                                     |
| Permalink pattern for blog (even unused)                  | **CORE**     | Painful to change post-indexing                                       |
| RUM for INP/LCP/CLS from day one                          | **CORE**     | Can't fix what you don't measure; 200ms p75 INP gate                  |
| Component library = marketing block library               | **CORE**     | Single design system, two surfaces                                    |
| Headless CMS at launch (no content yet)                   | **TRAP**     | Pay $100–500/mo + setup time for nothing                              |
| Full hreflang + multi-locale at launch                    | **TRAP**     | Hreflang is fragile; add with first real locale                       |
| Algolia at launch                                         | **TRAP**     | Pagefind/none until >50 pages                                         |
| Atomic Design as formal methodology                       | **TRAP**     | Vocabulary useful; ceremony slows shipping                            |
| A/B testing platform pre-traffic                          | **TRAP**     | Statistical noise <10k weekly visitors                                |
| Field-level vs document-level i18n choice                 | **ADDITIVE** | Decide at CMS-migration time, not launch                              |
| CMS choice (Sanity vs Contentful vs Storyblok)            | **ADDITIVE** | Made trivial by block-array model if shape is typed                   |
| Actual translated content                                 | **ADDITIVE** | Per-locale rollout                                                    |
| Sitewide search                                           | **ADDITIVE** | Pagefind when needed                                                  |
| Blog content cadence                                      | **ADDITIVE** | Process, not structure                                                |
| Smart app banners (iOS/Android)                           | **ADDITIVE** | Meta tags; trivial later                                              |

**Bottom line for Quilty:** the working hypothesis (MDX in repo → Sanity/Contentful later; English-only with i18n-ready scaffolding) is exactly correct. The structural work for launch is roughly two days of decisions — block-array page shape, `/[locale]/` segment, trailing-slash convention, sitemap/robots/canonical setup, `MedicalWebPage` schema baseline, redirect table, INP RUM — and everything else can be additive.

## Sources

- [next-intl docs](https://next-intl.dev/)
- [Sanity localization docs](https://www.sanity.io/docs/localization)
- [Web Almanac 2025 — CMS](https://almanac.httparchive.org/en/2025/cms)
- [web.dev INP](https://web.dev/articles/inp)
- [Schema App healthcare guide](https://www.schemaapp.com/schema-markup/value-of-schema-markup-to-healthcare-organizations/)
- [schema.org/MedicalWebPage](https://schema.org/MedicalWebPage)
- [Grizzle: Headspace SEO case study](https://grizzle.io/blog/headspace)
- [Atomic Design — Brad Frost](https://atomicdesign.bradfrost.com/)
- [Next.js metadata docs](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots)
- [Pagefind writeup — Static Signal](https://staticsignal.io/posts/static-site-search-with-pagefind/)
- [Better-i18n: hreflang and locale URLs guide](https://better-i18n.com/en/blog/i18n-seo-hreflang-locale-urls-guide/)
- [BuildPilot 2026: next-intl vs i18next vs Lingui](https://trybuildpilot.com/910-next-intl-vs-i18next-vs-lingui-2026)
- [Watershed: evolving MDX publishing with a headless CMS](https://watershed.com/inside/evolving-mdx-publishing-with-a-headless-cms)
