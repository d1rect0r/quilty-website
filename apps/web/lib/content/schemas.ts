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
 *   4. Add a React component in apps/web/components/blocks/
 * TypeScript catches missing steps at compile time.
 */

/** Hero — top-of-page headline + supporting copy + optional CTA pair. */
export const HeroBlockSchema = z.object({
  type: z.literal('Hero'),
  heading: z.string().min(1).max(200),
  subheading: z.string().min(1).max(400).optional(),
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

/** FeatureGrid — 2-3-4 column grid of named features. */
export const FeatureGridBlockSchema = z.object({
  type: z.literal('FeatureGrid'),
  heading: z.string().min(1).max(120).optional(),
  items: z
    .array(
      z.object({
        heading: z.string().min(1).max(120),
        body: z.string().min(1).max(400),
        icon: z.string().optional(),
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

/** TestimonialQuote — customer testimonial. */
export const TestimonialQuoteBlockSchema = z.object({
  type: z.literal('TestimonialQuote'),
  quote: z.string().min(1).max(800),
  attribution: z.string().min(1).max(120),
  role: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().min(1).optional(),
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
    // Optional clinical-content fields (D27): lastReviewed + reviewedBy land
    // on /science when the named clinical advisor is named (M3-M4). ISO 8601
    // date format enforced — must match Velite's `s.isodate()` constraint
    // on the legal collection (Round-5 SEO reviewer cross-check).
    lastReviewed: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/)
      .optional(),
    reviewedBy: z.string().optional(),
  })
  // Single-h1-per-page invariant (D24 + Round-5 SEO reviewer): only one
  // Hero block per page emits <h1>; pages with multiple Hero blocks would
  // violate WCAG 2.4.6 + page-titled semantics. Schema-level refine catches
  // this at content compile time, not in production HTML.
  .refine(
    (page) => page.blocks.filter((b) => b.type === 'Hero').length <= 1,
    { message: 'A page may contain at most one Hero block (single <h1> per page).' },
  );
export type PageContent = z.infer<typeof PageContentSchema>;
