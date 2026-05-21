/**
 * Public barrel for @quilty/content.
 *
 * Two consumer surfaces:
 *   1. Schemas + types — every page route that parses MDX frontmatter
 *      runs the payload through PageContentSchema (D24 + D29 + D65).
 *   2. React block components — the BlocksRenderer dispatches the
 *      typed-block array into rendered sections.
 *
 * Velite config lives at the subpath export `@quilty/content/velite-config`
 * so the root `velite.config.ts` can re-export it as a one-line shim;
 * Velite CLI resolves from CWD and needs the config at the repo root.
 */

export {
  BlockSchema,
  CTABannerBlockSchema,
  FAQBlockSchema,
  FeatureGridBlockSchema,
  HeroBlockSchema,
  PageContentSchema,
  TestimonialQuoteBlockSchema,
  ValuePropBlockSchema,
} from './schemas.js';

export type {
  Block,
  CTABannerBlock,
  FAQBlock,
  FeatureGridBlock,
  HeroBlock,
  PageContent,
  TestimonialQuoteBlock,
  ValuePropBlock,
} from './schemas.js';

export { BlockRenderer, BlocksRenderer } from './components/BlockRenderer.js';
export type { BlockRendererProps, BlocksRendererProps } from './components/BlockRenderer.js';

export { CTABanner } from './components/CTABanner.js';
export type { CTABannerProps } from './components/CTABanner.js';

export { FAQ } from './components/FAQ.js';
export type { FAQProps } from './components/FAQ.js';

export { FeatureGrid } from './components/FeatureGrid.js';
export type { FeatureGridProps } from './components/FeatureGrid.js';

export { Hero } from './components/Hero.js';
export type { HeroProps } from './components/Hero.js';

export { TestimonialQuote } from './components/TestimonialQuote.js';
export type { TestimonialQuoteProps } from './components/TestimonialQuote.js';

export { ValueProp } from './components/ValueProp.js';
export type { ValuePropProps } from './components/ValueProp.js';
