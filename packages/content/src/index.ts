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
  IconDescriptorSchema,
  ImageDescriptorSchema,
  PageContentSchema,
  TestimonialQuoteBlockSchema,
  ValuePropBlockSchema,
} from './schemas';

export type {
  Block,
  CTABannerBlock,
  FAQBlock,
  FeatureGridBlock,
  HeroBlock,
  IconDescriptor,
  ImageDescriptor,
  PageContent,
  TestimonialQuoteBlock,
  ValuePropBlock,
} from './schemas';

// ImagePipeline port + adapters (ADR-0014 Rule 5). The in-memory
// fake lives on the `@quilty/content/testing` subpath so it cannot
// reach a production import path.
export type { ImageInput, ImagePipeline, ResolvedImage } from './ports/image-pipeline';
export {
  makeNextImagePipeline,
  type NextImagePipelineOptions,
} from './adapters/next-image-pipeline';

export { OptimizedImage } from './components/OptimizedImage';
export type { OptimizedImageProps } from './components/OptimizedImage';

export { BlockRenderer, BlocksRenderer } from './components/BlockRenderer';
export type { BlockRendererProps, BlocksRendererProps } from './components/BlockRenderer';

export { CTABanner } from './components/CTABanner';
export type { CTABannerProps } from './components/CTABanner';

export { FAQ } from './components/FAQ';
export type { FAQProps } from './components/FAQ';

export { FeatureGrid } from './components/FeatureGrid';
export type { FeatureGridProps } from './components/FeatureGrid';

export { Hero } from './components/Hero';
export type { HeroProps } from './components/Hero';

export { TestimonialQuote } from './components/TestimonialQuote';
export type { TestimonialQuoteProps } from './components/TestimonialQuote';

export { ValueProp } from './components/ValueProp';
export type { ValuePropProps } from './components/ValueProp';
