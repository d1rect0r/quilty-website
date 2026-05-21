import type { NextConfig } from 'next';

/**
 * Headers for mobile-deeplink files served from `public/.well-known/`
 * (per S8 + .gitattributes). These files must serve as `application/json`
 * regardless of extension — iOS silently fails universal-link verification
 * if AASA is sent as `application/octet-stream`.
 */
async function wellKnownHeaders() {
  return [
    {
      source: '/.well-known/apple-app-site-association',
      headers: [
        { key: 'Content-Type', value: 'application/json' },
        { key: 'Cache-Control', value: 'public, max-age=300' },
      ],
    },
    {
      source: '/.well-known/assetlinks.json',
      headers: [
        { key: 'Content-Type', value: 'application/json' },
        { key: 'Cache-Control', value: 'public, max-age=300' },
      ],
    },
  ];
}

type RedirectsReturn = Awaited<ReturnType<NonNullable<NextConfig['redirects']>>>;

/**
 * Versioned redirect table (D16). Root `/` → default locale is owned
 * by `proxy.ts` (so the redirect response carries the full CSP +
 * security-header stack); historic content-moved redirects land here
 * with `permanent: true` since `next.config.ts` redirects fire before
 * the proxy + apply to static assets too. Never blanket-301 to
 * homepage — Google soft-404 trap.
 */
async function siteRedirects(): Promise<RedirectsReturn> {
  return [];
}

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: false,
  // typedRoutes graduated from experimental in Next.js 16; the
  // experimental.typedRoutes path is deprecated.
  typedRoutes: true,
  // Workspace packages ship JIT TS source via `package.json#exports →
  // ./src/index.ts`. transpilePackages tells Next.js (and the
  // Turbopack dev server) to compile these TS sources rather than
  // expect pre-built JS — without it, dev-mode resolution fails on
  // the package barrels even though tsc + vitest resolve fine.
  // Matches the Cal.com / Vercel-monorepo convention for JIT
  // internal packages with `moduleResolution: "bundler"`.
  transpilePackages: [
    '@quilty/captcha',
    '@quilty/consent',
    '@quilty/content',
    '@quilty/email',
    '@quilty/observability',
    '@quilty/rate-limit',
    '@quilty/security',
    '@quilty/seo',
    '@quilty/shared-types',
  ],
  // optimizePackageImports rewrites `import { x } from '@quilty/foo'` to
  // `import { x } from '@quilty/foo/<x>'` at build time, enabling
  // per-symbol tree-shaking even where the barrel hasn't fully migrated
  // to named subpath exports. Belt-and-suspenders against the
  // barrel-bundle-bloat pattern documented at Vercel #27401 + Hagemeister.
  experimental: {
    optimizePackageImports: [
      '@quilty/captcha',
      '@quilty/consent',
      '@quilty/content',
      '@quilty/email',
      '@quilty/observability',
      '@quilty/rate-limit',
      '@quilty/security',
      '@quilty/seo',
    ],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [],
  },
  redirects: siteRedirects,
  headers: wellKnownHeaders,
};

export default config;
