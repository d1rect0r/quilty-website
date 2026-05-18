import { defineConfig, s } from 'velite';

/**
 * Velite content layer config per D64.
 *
 * Velite compiles MDX content under `apps/web/content/` at build time:
 *   - Validates frontmatter against Zod schemas (the canonical block
 *     schema lives at `apps/web/lib/content/schemas.ts` — Velite has its
 *     own `s` builder which we mirror here, then runtime-validate via
 *     the Zod schema at load time)
 *   - Emits typed JSON + TypeScript types to `apps/web/.velite/`
 *   - The `.velite/` directory is gitignored (already in .gitignore from
 *     Commit 3); CI runs `velite build` before `next build`
 *
 * At M1 we declare the four content collections (blog, customers,
 * changelog, legal) with minimal frontmatter shape. Each gets a
 * `.gitkeep` placeholder so the directories exist + Velite can compile
 * the empty collections.
 *
 * D24 + D29 + D65 — pages are typed block arrays. The blocks field on
 * each entry can be parsed at load time via PageContentSchema from
 * `lib/content/schemas.ts`.
 */
export default defineConfig({
  root: 'apps/web/content',
  output: {
    data: 'apps/web/.velite',
    assets: 'apps/web/public/static',
    base: '/static/',
    name: '[name]-[hash:6].[ext]',
    clean: true,
  },
  collections: {
    blog: {
      name: 'BlogPost',
      pattern: 'blog/**/*.mdx',
      schema: s
        .object({
          title: s.string().min(1).max(200),
          description: s.string().min(1).max(400),
          slug: s.string().min(1),
          locale: s.string().min(2).max(10),
          publishedAt: s.isodate(),
          updatedAt: s.isodate().optional(),
          // The blocks array is JSON-validated by Velite as `any` here;
          // PageContentSchema in lib/content/schemas.ts parses it at load
          // time so we get full type safety at the consumer boundary.
          blocks: s.array(s.any()).default([]),
          content: s.mdx(),
        })
        .transform((data) => ({
          ...data,
          path: `/blog/${data.slug}`,
        })),
    },
    customers: {
      name: 'CustomerStory',
      pattern: 'customers/**/*.mdx',
      schema: s
        .object({
          title: s.string().min(1).max(200),
          description: s.string().min(1).max(400),
          slug: s.string().min(1),
          locale: s.string().min(2).max(10),
          customerName: s.string().min(1).max(120).optional(),
          blocks: s.array(s.any()).default([]),
          content: s.mdx(),
        })
        .transform((data) => ({
          ...data,
          path: `/customers/${data.slug}`,
        })),
    },
    changelog: {
      name: 'ChangelogEntry',
      pattern: 'changelog/**/*.mdx',
      schema: s
        .object({
          version: s.string().min(1),
          publishedAt: s.isodate(),
          summary: s.string().min(1).max(400),
          locale: s.string().min(2).max(10),
          content: s.mdx(),
        })
        .transform((data) => ({
          ...data,
          path: `/changelog/${data.version}`,
        })),
    },
    legal: {
      name: 'LegalPage',
      pattern: 'legal/**/*.mdx',
      schema: s
        .object({
          title: s.string().min(1).max(200),
          // description added per Round-5 SEO reviewer — PageContentSchema
          // requires it for generateMetadata to work on legal pages.
          description: s.string().min(1).max(400),
          slug: s.string().min(1),
          locale: s.string().min(2).max(10),
          lastReviewed: s.isodate().optional(),
          reviewedBy: s.string().optional(),
          content: s.mdx(),
        })
        .transform((data) => ({
          ...data,
          path: `/legal/${data.slug}`,
        })),
    },
  },
});
