import { z } from 'zod';

/**
 * Typed block library (D24 + D29 + D65). Discriminated-union shape so:
 *   - `<BlockRenderer block={block} />` exhaustively dispatches by `type`
 *   - TypeScript catches missing-case bugs at compile time
 *   - Velite's MDX frontmatter parser uses these schemas to validate at
 *     build time — malformed content fails the build, not production
 *   - CMS migration to Sanity Portable Text (D30 trigger) is a script,
 *     not a content rewrite — the typed shape maps cleanly to Portable
 *     Text blocks
 *
 * Adding a new block type:
 *   1. Add the Zod schema below
 *   2. Add to the BlockSchema discriminated union
 *   3. Add a switch case in <BlockRenderer>
 *   4. Add a React component in src/components/
 * TypeScript catches missing steps at compile time.
 */

/** Image descriptor — re-used across Hero / TestimonialQuote / future
 * blocks. `alt` is REQUIRED at the schema layer mirroring the
 * ImagePipeline port's compile-time contract: every author-supplied
 * image MUST provide non-text-content per WCAG 1.1.1. Decorative
 * images pass `alt: ""` (the explicit author decision).
 */
export const ImageDescriptorSchema = z.object({
  src: z.string().min(1),
  alt: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type ImageDescriptor = z.infer<typeof ImageDescriptorSchema>;

/** Hero — top-of-page headline + supporting copy + optional CTA pair
 * + optional hero image. The hero image renders through OptimizedImage
 * (the ImagePipeline-backed seam); authors supply alt text inline so
 * the rendered <h1>-anchored section never ships a decorative image
 * without an accessibility opt-in.
 */
export const HeroBlockSchema = z.object({
  type: z.literal('Hero'),
  heading: z.string().min(1).max(200),
  subheading: z.string().min(1).max(400).optional(),
  image: ImageDescriptorSchema.optional(),
  primaryCta: z
    .object({
      label: z.string().min(1).max(50),
      href: z.string().min(1),
    })
    .optional(),
  secondaryCta: z
    .object({
      label: z.string().min(1).max(50),
      href: z.string().min(1),
    })
    .optional(),
});
export type HeroBlock = z.infer<typeof HeroBlockSchema>;

/** ValueProp — single value-proposition card. */
export const ValuePropBlockSchema = z.object({
  type: z.literal('ValueProp'),
  heading: z.string().min(1).max(120),
  body: z.string().min(1).max(600),
  icon: z.string().optional(),
});
export type ValuePropBlock = z.infer<typeof ValuePropBlockSchema>;

/** Icon descriptor — discriminated union of the two icon-source roles.
 *
 *   - `lucide`: a Lucide React icon name (D19). Renderer maps the
 *     string to a Lucide component at runtime; unknown names fall
 *     back to no-render with a development-tier warning.
 *   - `image`: a URL-shaped icon (typically a brand logo or
 *     non-Lucide pictogram). Routed through OptimizedImage so the
 *     ImagePipeline applies; alt is REQUIRED per WCAG 1.1.1.
 *
 * The discriminator is `kind` rather than `type` to avoid collision
 * with the parent block's `type` discriminator at the union level.
 */
export const IconDescriptorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('lucide'),
    name: z.string().min(1).max(80),
  }),
  z.object({
    kind: z.literal('image'),
    src: z.string().min(1),
    alt: z.string(),
    // REQUIRED for image-kind icons: an icon-image without explicit
    // dimensions cannot render through the sized OptimizedImage variant
    // (the fill variant is not appropriate for an inline grid cell).
    // Authors who don't know the intrinsic dimensions should use the
    // `lucide` kind or supply matching width/height (typically 24 / 32 /
    // 40 for icon-sized assets).
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
]);
export type IconDescriptor = z.infer<typeof IconDescriptorSchema>;

/** FeatureGrid — 2-3-4 column grid of named features.
 *
 * `heading` is REQUIRED (not optional) — without it, the per-item `<h3>`
 * elements would render directly under the page's `<h1>` (from a Hero
 * block), skipping h2 and breaking the heading hierarchy (WCAG 1.3.1 +
 * 2.4.6). Authors who want a section with no visible heading should
 * use a different block (ValueProp, CTABanner) — the FeatureGrid is
 * inherently a "named group of features" pattern.
 */
export const FeatureGridBlockSchema = z.object({
  type: z.literal('FeatureGrid'),
  heading: z.string().min(1).max(120),
  items: z
    .array(
      z.object({
        heading: z.string().min(1).max(120),
        body: z.string().min(1).max(400),
        icon: IconDescriptorSchema.optional(),
      }),
    )
    .min(1)
    .max(12),
});
export type FeatureGridBlock = z.infer<typeof FeatureGridBlockSchema>;

/** FAQ — Q+A entries, rendered with FAQPage JSON-LD (D27). */
export const FAQBlockSchema = z.object({
  type: z.literal('FAQ'),
  heading: z.string().min(1).max(120).optional(),
  entries: z
    .array(
      z.object({
        question: z.string().min(1).max(300),
        answer: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});
export type FAQBlock = z.infer<typeof FAQBlockSchema>;

/** TestimonialQuote — customer testimonial. The optional `avatar`
 * descriptor renders through OptimizedImage when present (unlocked by
 * the ImagePipeline + alt-required contract). Authors who omit it
 * render a text-only attribution.
 */
export const TestimonialQuoteBlockSchema = z.object({
  type: z.literal('TestimonialQuote'),
  quote: z.string().min(1).max(800),
  attribution: z.string().min(1).max(120),
  role: z.string().min(1).max(120).optional(),
  avatar: ImageDescriptorSchema.optional(),
});
export type TestimonialQuoteBlock = z.infer<typeof TestimonialQuoteBlockSchema>;

/** CTABanner — full-width call-to-action panel. */
export const CTABannerBlockSchema = z.object({
  type: z.literal('CTABanner'),
  heading: z.string().min(1).max(200),
  body: z.string().min(1).max(400).optional(),
  primaryCta: z.object({
    label: z.string().min(1).max(50),
    href: z.string().min(1),
  }),
});
export type CTABannerBlock = z.infer<typeof CTABannerBlockSchema>;

/** Discriminated union of every block type. */
export const BlockSchema = z.discriminatedUnion('type', [
  HeroBlockSchema,
  ValuePropBlockSchema,
  FeatureGridBlockSchema,
  FAQBlockSchema,
  TestimonialQuoteBlockSchema,
  CTABannerBlockSchema,
]);
export type Block = z.infer<typeof BlockSchema>;

/** Page content shape — what every MDX frontmatter parses to. */
export const PageContentSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(400),
    slug: z.string().min(1),
    locale: z.string().min(2).max(10),
    blocks: z.array(BlockSchema).min(0).max(50),
    // Optional clinical-content fields (D27): lastReviewed + reviewedBy
    // land on /science when a named clinical advisor is named. ISO 8601
    // date format enforced — must match Velite's `s.isodate()` constraint
    // on the legal collection.
    lastReviewed: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/)
      .optional(),
    reviewedBy: z.string().optional(),
  })
  // Upper-bound only: at most one Hero per page (D24 + WCAG 2.4.6). The
  // schema does NOT enforce a minimum Hero — pages whose <h1> comes
  // from the route layout (outside the block library) are valid; the
  // route file holds the page-h1 contract in that composition pattern.
  .refine((page) => page.blocks.filter((b) => b.type === 'Hero').length <= 1, {
    message: 'A page may contain at most one Hero block (single <h1> per page).',
  });
export type PageContent = z.infer<typeof PageContentSchema>;
