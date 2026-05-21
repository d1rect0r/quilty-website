# @quilty/content

Typed block-library content layer + BlockRenderer + Velite config.

## Architecture

Pages consume content as a typed array of blocks. Each block is a Zod-validated discriminated union variant; `<BlockRenderer>` dispatches by `type` and renders the matching React component. The discriminated union means:

- TypeScript catches missing-case bugs at compile time
- Velite parses MDX frontmatter against the same Zod schemas at build time — malformed content fails the build, not production
- A future CMS migration (Sanity Portable Text, Contentful) is a typed-shape script, not a content rewrite

## Public API

```ts
import {
  // Components
  BlocksRenderer, // renders an array of blocks in document order (preferred page-route consumer)
  BlockRenderer, // renders a single block (escape-hatch for custom assembly)
  Hero,
  ValueProp,
  FeatureGrid,
  FAQ,
  TestimonialQuote,
  CTABanner,
  // Schemas
  BlockSchema,
  PageContentSchema,
  HeroBlockSchema,
  ValuePropBlockSchema,
  FeatureGridBlockSchema,
  FAQBlockSchema,
  TestimonialQuoteBlockSchema,
  CTABannerBlockSchema,
  // Types
  type Block,
  type PageContent,
  type HeroBlock,
  type ValuePropBlock,
  type FeatureGridBlock,
  type FAQBlock,
  type TestimonialQuoteBlock,
  type CTABannerBlock,
} from '@quilty/content';
```

Most page routes should use `<BlocksRenderer blocks={page.blocks} pageUrl={…}/>` rather than calling `<BlockRenderer>` directly; the wrapper handles per-block `instanceId` generation + threading `pageUrl` for JSON-LD cross-references.

## FAQ-block page-author contract

When a page renders a `FAQ` block, the FAQ component emits a `FAQPage` JSON-LD node whose `isPartOf` cross-reference points to `${pageUrl}#webpage`. The page route is responsible for emitting a complementary WebPage-shaped JSON-LD node (either `buildMedicalWebPageJsonLd` from `@quilty/seo` for clinical pages, or a future generic `buildWebPageJsonLd`) whose `@id` is `${pageUrl}#webpage`. Without that complementary node, the FAQPage's `isPartOf` resolves to a non-existent graph entity and AI-overview citation graphs (ChatGPT/Claude/Perplexity) devalue the FAQ entries as dangling — silent SEO regression.

The contract is asymmetric on purpose: not every page needs an FAQPage, but every page that emits one must own the parent WebPage node.

Deep imports into `src/` are forbidden by `.dependency-cruiser.cjs` rule `cross-package-imports-must-use-barrel`.

## Velite config

`velite.config.ts` at the repo root is a thin re-export of `@quilty/content/velite-config`. The config defines four content collections (`blog`, `customers`, `changelog`, `legal`) that read MDX source from `apps/web/content/` and emit typed output to `apps/web/.velite/`. App-specific content lives in `apps/web/content/`; the package exports the schema + loader contract.

## Adding a new block type

1. Add the Zod schema in `src/schemas.ts`
2. Append to the `BlockSchema` discriminated union
3. Add a React component in `src/components/`
4. Add a switch case in `src/components/BlockRenderer.tsx`
5. Export from `src/index.ts`

TypeScript catches missing steps at compile time.

## Tests

Run with `pnpm --filter @quilty/content test`. The contract test (`__tests__/BlockRenderer.test.tsx`) covers the discriminated-union dispatch + schema validation paths.

Coverage targets ≥85% / ≥80% (utility-package floor; raise to ≥90% when MDX content lands and the block renderer becomes the load-bearing path for marketing surfaces).
