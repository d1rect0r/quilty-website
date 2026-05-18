# ADR-0006: Content layer — Velite + Zod-validated MDX frontmatter + typed discriminated-union block library → single `<BlockRenderer>`

- **Status:** Accepted
- **Date:** 2026-05-17 (locked via Round-5 audit)
- **Deciders:** Volodymyr Petrychenko + Round-5 i18n-SEO-content research agent
- **Related decisions:** D24 (pages as typed block arrays), D29 (marketing block library v1: Hero / ValueProp / FeatureGrid / FAQ / TestimonialQuote / CTABanner), D30 (MDX in repo initially → CMS at content-volume trigger), D64 (Velite + Zod content layer day-one; Sanity Enterprise CMS pick at trigger), D65 (typed discriminated-union block library + single `<BlockRenderer>`)
- **Related ADRs:** [ADR-0001 Monorepo shape](0001-monorepo-shape.md) (content lives in `apps/web/content/`)
- **Related research:** `docs/research/round_5_independent_review/06-i18n-seo-content.md`, `docs/research/content_i18n_seo.md` (round 2)

## Context

The website must scale to hundreds-to-thousands of pages without
architectural rebuild + accept non-engineer content authors later. We pick
the content shape now so the eventual migration to a CMS is a script, not
a content rewrite.

Forces:
- **ContentLayer is unmaintained** (last release 2024). Cal.com migrated
  off it in 2025.
- **Velite (Next.js-first content layer, Zod-native)** has emerged as the
  2026 default: build-time validation, generated TS types, MDX support,
  works with Next.js 16 App Router via static imports.
- **CMS migration regret is uniform** across teams that started with
  unstructured MDX: by the time they need a CMS, the content has drifted
  into freeform Markdown and migration is a content rewrite, not a script.
  Cal.com's MDX → ContentLayer → Sanity arc is the cautionary tale.
- **The "pages as typed block arrays" pattern (D24)** is the discipline
  that prevents drift: frontmatter declares an array of typed blocks
  (`{ type: 'Hero', props: {...} }`), MDX body is restricted to inline rich
  text within blocks. Sanity's Portable Text + Contentful's structured-text
  models match this shape natively.
- **Sanity Enterprise has BAA availability** (verified Round 5) and
  Portable Text is the closest 1:1 to our typed-block model — the eventual
  migration target.
- **Schema.org JSON-LD** must be emitted at the page level (Organization +
  WebSite + SoftwareApplication + BreadcrumbList for SERP weight; MedicalWebPage
  on /science + FAQPage for AI-overview citations only, per D27 Round-5
  revision — Google retired FAQPage rich-result eligibility 2026-05-07).
- **next-intl** (D25) handles i18n; the content layer must round-trip cleanly
  to Sanity's field-level i18n model. Velite + locale-suffixed file naming
  (`hero.en.mdx`, `hero.es.mdx`) ports cleanly.
- **AI crawler policy (D66)** is enforced in `robots.ts`, not in the
  content layer — but the content layer's typed shape lets us emit
  connected JSON-LD graphs (with stable `@id`s) that AI overviews actually
  cite.

What happens if we don't decide: ship freeform MDX (`/blog/intro.mdx`
contains arbitrary Markdown + JSX), realize at ~30 pages that we need
a CMS, discover the content rewrite is a 2-3 month project, then either
delay the CMS migration indefinitely or eat the rewrite.

## Decision

**We will author content as MDX files with Zod-validated frontmatter declaring a typed discriminated-union block array, compiled at build time by Velite, rendered by a single `<BlockRenderer>` — so the eventual CMS migration (Sanity Enterprise at trigger) is a script, not a content rewrite.**

Specifically:

1. **Velite** (https://velite.js.org) as the build-time content compiler.
   `velite.config.ts` at repo root declares collections for `blog/`,
   `customers/`, `changelog/`, `legal/`, `science/`.
2. **Zod schemas** at `apps/web/lib/content/schemas.ts` define the typed
   block discriminated union:
   ```ts
   const HeroBlock = z.object({ type: z.literal('Hero'), props: HeroProps })
   const ValuePropBlock = z.object({ type: z.literal('ValueProp'), props: ValuePropProps })
   // ... FeatureGrid, FAQ, TestimonialQuote, CTABanner
   const Block = z.discriminatedUnion('type', [HeroBlock, ValuePropBlock, ...])
   const PageContent = z.object({
     hero: HeroBlock.optional(),
     blocks: z.array(Block),
     faq: FAQBlock.optional(),
     // page-level metadata: title, description, canonical, lastReviewed, reviewedBy, ogImage, schema
   })
   ```
3. **MDX frontmatter** is the only place blocks are declared. MDX body
   inside each block is restricted to inline rich text — no top-level
   prose outside the block array.
4. **Single `<BlockRenderer>`** in `apps/web/components/blocks/BlockRenderer.tsx`
   accepts a `Block` and dispatches to the right component via
   `switch (block.type)`. Adding a new block type = adding a Zod variant +
   a component + a switch case.
5. **Block library v1 (D29 + D65):** Hero, ValueProp, FeatureGrid, FAQ,
   TestimonialQuote, CTABanner. Skeletons at `apps/web/components/blocks/`.
6. **JSON-LD emission** is page-level, derived from typed schema (Zod
   parses the frontmatter, JSON-LD builders at `apps/web/lib/seo/schemas.ts`
   consume the typed `PageContent`). `<JsonLd>` component renders
   `<script type="application/ld+json" nonce={nonce}>`.
7. **CMS migration target (D64):** Sanity Enterprise (BAA on request) at
   trigger. Portable Text is the closest 1:1 to our discriminated-union
   block shape. Migration script: `mdx → JSON via Zod → Sanity import API`.

## Consequences

### Positive

- **Type-safe content** — Velite generates TypeScript types from Zod schemas;
  build fails if frontmatter is malformed.
- **CMS migration is a script** — `mdx → Zod-validated JSON → Sanity import`
  is a single-day exercise vs a multi-month content rewrite.
- **AI-overview citations** improved by connected JSON-LD graphs with stable
  `@id`s — typed schema makes this mechanically correct.
- **Schema discipline is enforced at build time** — drift is impossible.
- **Block library grows incrementally** — adding a block type touches three
  places (Zod schema, component, switch case) and no other code.
- **Velite is Next.js 16 + App Router compatible** + Zod-native + actively
  maintained (vs ContentLayer's stagnation).

### Negative

- **MDX-as-content-CMS isn't a great authoring experience** — non-engineer
  authors will hit the limits at ~30 pages. The trigger to migrate to
  Sanity is well-defined; we accept the gap.
- **Velite generates a `.velite/` directory** that lives in `apps/web/` and
  is gitignored. CI must run `velite build` before `next build` (Turborepo
  pipeline handles this).
- **JSON-LD emission requires nonce propagation** — `<JsonLd>` component
  must receive the per-request nonce from `(await headers()).get('x-nonce')`
  on portal routes (per ADR-0005 two-tier CSP). Marketing routes use
  static CSP so the JSON-LD inline-script hash is pre-computed.
- **Sanity Portable Text is a Sanity-specific format.** If we ever decide to
  migrate AWAY from Sanity (to Contentful, Storyblok, Payload, or a custom
  CMS), the typed-block discriminated union → Portable Text → other-CMS
  conversion is a non-trivial migration. The discipline we adopt (typed
  blocks in MDX) gives us the best portability of any of the available
  patterns, but we accept that "first CMS pick" is itself a sticky decision.

### Neutral

- **Some marketing pages (like landing pages with bespoke layouts) will
  outgrow the block library** — these can be hand-coded React components
  outside `BlockRenderer`. The discipline is "block-array first; bespoke
  only when justified."

## Alternatives considered

### Alternative A: Raw MDX with no schema validation

- **What it is:** Author MDX files freeform; Next.js's built-in MDX support
  handles rendering.
- **Why rejected:** Drifts into freeform Markdown within a sprint. Migration
  to any CMS becomes a content rewrite.

### Alternative B: ContentLayer

- **What it is:** Pre-Velite content layer for Next.js with similar shape.
- **Why rejected:** Unmaintained since 2024; community migrated to Velite
  or contentlayer2 fork. Wrong direction.

### Alternative C: contentlayer2 (community fork)

- **What it is:** Forked ContentLayer with patches.
- **Why rejected:** Fragmented maintenance, smaller ecosystem than Velite.
  Velite's Zod-native model is closer to our typed-block discipline.

### Alternative D: Headless CMS from day 1 (Sanity / Contentful / Payload)

- **What it is:** Skip MDX entirely; author all content in Sanity from
  M1.
- **Why rejected:** Sanity Enterprise BAA costs are significant; pre-launch
  content volume is too low to justify the operational overhead; we don't
  have non-engineer content authors yet. D30 explicitly defers CMS to a
  trigger. Velite + Zod is the bridge.

### Alternative E: TinaCMS (Git-backed CMS UI over MDX)

- **What it is:** Visual editor over the same MDX files, no migration needed.
- **Why rejected:** Adds a runtime UI surface + auth model for editors. For
  a 1-eng team with no non-engineer authors yet, the operational cost
  outweighs the benefit. Reconsider if the trigger shifts to "authors want
  visual editing" rather than "content volume justifies CMS migration."

### Alternative F: Astro Content Collections

- **What it is:** Astro has a similar Zod-validated content collection
  feature.
- **Why rejected:** We're on Next.js 16 (D1). Migrating to Astro is a
  framework change, not a content layer change.

### Alternative G: Single React tree (no MDX, no content layer)

- **What it is:** Author every page as a React component; content is in
  the JSX.
- **Why rejected:** Doesn't scale past ~20 pages. Future CMS migration is
  a content rewrite. Doesn't let non-engineer authors contribute.

## Compliance / Verification

- `velite.config.ts` is the single source of truth for content collection
  definitions.
- `lib/content/schemas.ts` exports the Zod block union; new block types
  must be added here (PR review enforces).
- `BlockRenderer.tsx` switch exhaustiveness is enforced by TypeScript
  (`never` check on default case).
- Build-time validation: `velite build` fails if any frontmatter doesn't
  match the schema.
- Playwright e2e at M2 asserts `/en/`, `/en/science/`, `/en/legal/privacy/`
  each emit valid JSON-LD that passes Google's Rich Results Test schema.
- Unit tests on JSON-LD builders cover Organization + WebSite +
  SoftwareApplication + BreadcrumbList + MedicalWebPage + FAQPage shapes.
- CI fails if Velite's generated `.velite/` directory is committed
  (gitignored; presence in git is a regression).

## References

- Velite (Zod-native content layer for Next.js): https://velite.js.org/
- ContentLayer (unmaintained — verify last release date at repo): https://github.com/contentlayerdev/contentlayer
- contentlayer2 community fork: https://github.com/timlrx/contentlayer2
- Zod (schema declaration + validation): https://zod.dev/
- Sanity Portable Text (the CMS migration target's content shape): https://www.sanity.io/docs/portable-text
- Sanity Enterprise (BAA-available tier): https://www.sanity.io/enterprise
- Google retired FAQPage rich-result eligibility 2026-05-07: https://developers.google.com/search/blog/2023/08/howto-faq-changes (historical announcement; 2026-05 update extended to all sites)
- schema.org MedicalWebPage type: https://schema.org/MedicalWebPage
- next-intl (i18n for App Router): https://next-intl.dev/

## Revisit triggers

- **Non-engineer content author needs to publish** → activate Sanity
  Enterprise; run the `mdx → Portable Text` migration script.
- **Content volume exceeds ~30 long-form pages** → same as above; the
  cognitive cost of managing 30+ MDX files outweighs the CMS overhead.
- **Field-level i18n becomes urgent** (we need to ship a non-EN locale
  partially while leaving the rest in EN) → Sanity's field-level i18n
  shines here.
- **AI-overview citation rate drops** → re-evaluate the JSON-LD graph
  connectivity; verify stable `@id` discipline.
- **Velite ships a breaking change** → pin major version + evaluate
  alternatives at re-evaluation point. Velite is actively maintained as of
  May 2026.
- **A page-type taxonomy beyond marketing+account+legal+blog emerges**
  (e.g., interactive tools, programmatic content) — add a Velite collection
  + schema; the block library may grow new types.
