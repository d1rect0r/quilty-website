import type { NextConfig } from 'next';

/**
 * Headers for static files served from `apps/web/public/.well-known/`.
 *
 * Covers four classes of well-known file: (1) mobile-deeplink manifests
 * (`apple-app-site-association`, `assetlinks.json`) — iOS silently fails
 * universal-link verification if AASA is sent as `application/octet-stream`;
 * (2) RFC 9116 security disclosure (`security.txt`); (3) the Chrome
 * Private Prefetch Proxy hint (`traffic-advice` — custom media type);
 * (4) W3C TR `tracking-protection` GPC policy declaration (`gpc.json`).
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
    {
      // RFC 9116 mandates text/plain. The charset suffix is
      // belt-and-suspenders against browsers (not crawlers) attempting
      // to render the file. 1h CDN TTL — short enough that an annual
      // rotation propagates within the hour; long enough not to hammer
      // origin. X-Robots-Tag prevents the file from appearing in
      // search-engine SERPs (it's meant for RFC-9116 tooling to fetch
      // directly, not for users to discover via web search — the PHI
      // warning copy in the file is for security researchers, not the
      // general public).
      source: '/.well-known/security.txt',
      headers: [
        { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
        { key: 'Cache-Control', value: 'public, max-age=3600' },
        { key: 'X-Robots-Tag', value: 'noindex' },
      ],
    },
    {
      // Chrome Private Prefetch Proxy hint per privacycg/private-prefetch-proxy.
      // Custom media type required — plain application/json makes the
      // proxy ignore the policy. fraction:1.0 is safe pre-launch because
      // the marketing tier (the only public link graph) carries no
      // authenticated paths; revisit when /en/account/* becomes
      // link-graph-reachable from public pages.
      source: '/.well-known/traffic-advice',
      headers: [
        { key: 'Content-Type', value: 'application/trafficadvice+json' },
        { key: 'Cache-Control', value: 'public, max-age=3600' },
      ],
    },
    {
      // W3C TR `tracking-protection` machine-readable GPC policy
      // declaration. Compliance scanners + the California AG
      // enforcement tooling read this file to verify the site honors
      // the Sec-GPC: 1 request signal. 1h TTL — the file changes only
      // when the policy itself changes; short enough that a policy
      // edit propagates within the hour.
      source: '/.well-known/gpc.json',
      headers: [
        { key: 'Content-Type', value: 'application/json' },
        { key: 'Cache-Control', value: 'public, max-age=3600' },
      ],
    },
  ];
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
  headers: wellKnownHeaders,
};

export default config;
