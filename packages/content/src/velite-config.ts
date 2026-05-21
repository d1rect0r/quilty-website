import { defineConfig, s } from 'velite';

/**
 * Velite content layer config (D64). Compiled MDX content lives at
 * `apps/web/content/`; emitted JSON + types land at `apps/web/.velite/`.
 *
 * Velite resolves `root` relative to the directory it was invoked from
 * (the repo root, where the thin shim re-exports this). The root config
 * stays a one-line re-export so Velite CLI invocation (`velite build`)
 * keeps working unchanged; the body of the config lives here so a future
 * consumer of @quilty/content could pull it via the package subpath.
 *
 * Block validation contract: the `blocks` field on each collection is
 * stored as `s.array(s.any())` by Velite; consumers parse it through
 * PageContentSchema (also exported from @quilty/content) at load time
 * for full type safety. The two-stage validation lets MDX authors get
 * useful errors at build (frontmatter shape) AND content-load (block
 * union exhaustiveness).
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
          // description is required so the generateMetadata helper on
          // legal pages can spread it directly without conditional logic.
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
