import type { NextConfig } from 'next';

type RewritesReturn = Awaited<ReturnType<NonNullable<NextConfig['rewrites']>>>;
type RedirectsReturn = Awaited<ReturnType<NonNullable<NextConfig['redirects']>>>;

/**
 * Short-alias redirects. `/accessibility` → `/en/legal/accessibility`
 * so the conformance-statement URL travels well on business cards +
 * email signatures + supervisory-authority correspondence (the EAA
 * complaint procedure surfaces the URL in regulatory paperwork; a
 * memorable short form reduces friction). `permanent: false` keeps
 * the alias mutable while the locale strategy is single-locale —
 * promotes to `true` (308) when i18n locks at the next-intl
 * activation.
 */
async function siteRedirects(): Promise<RedirectsReturn> {
  return [
    {
      source: '/accessibility',
      destination: '/en/legal/accessibility',
      permanent: false,
    },
  ];
}

/**
 * `/robots.txt` is internally rewritten to the Route Handler at
 * `/api/robots`. The Route Handler emits the Cloudflare `Content-Signal`
 * directive — a per-block free-text field that the static
 * `MetadataRoute.Robots` shape cannot express (Next.js #85382).
 * `locale: false` keeps the rewrite from being matched against
 * locale-prefixed variants (crawlers always fetch the apex path).
 */
async function siteRewrites(): Promise<RewritesReturn> {
  return [{ source: '/robots.txt', destination: '/api/robots', locale: false }];
}

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
      // `Cross-Origin-Resource-Policy: cross-origin` is the explicit
      // form of what currently happens by omission (the .well-known
      // path is excluded from proxy.ts so the baseline `same-origin`
      // CORP is never set). Stating it explicitly prevents a future
      // CORP-everywhere hardening sweep from silently blocking
      // iOS swcd + Apple AASA CDN fetches, which are cross-origin
      // by nature.
      source: '/.well-known/apple-app-site-association',
      headers: [
        { key: 'Content-Type', value: 'application/json' },
        { key: 'Cache-Control', value: 'public, max-age=300' },
        { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
      ],
    },
    {
      // Same CORP rationale as AASA — Google's Digital Asset Links
      // API fetches assetlinks.json cross-origin during App Links
      // verification.
      source: '/.well-known/assetlinks.json',
      headers: [
        { key: 'Content-Type', value: 'application/json' },
        { key: 'Cache-Control', value: 'public, max-age=300' },
        { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
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
        { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
      ],
    },
    {
      // Chrome Private Prefetch Proxy hint per privacycg/private-prefetch-proxy.
      // Custom media type required — plain application/json makes the
      // proxy ignore the policy. `fraction:0.0` because the PWA manifest
      // now exposes portal-route shortcuts that are link-graph-reachable
      // for any prefetch-eligible bot. A non-zero fraction would let the
      // Google-operated prefetch proxy forward credentialless pre-fetch
      // requests against authenticated paths. Raise to a positive value
      // only after the portal session-validation path returns a hardened
      // non-PHI response to unauthenticated requests.
      source: '/.well-known/traffic-advice',
      headers: [
        { key: 'Content-Type', value: 'application/trafficadvice+json' },
        { key: 'Cache-Control', value: 'public, max-age=3600' },
        { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
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
        { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
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
    // Next.js 16.2 introduced `forbidden()` + `unauthorized()` helpers
    // (next/navigation). The flag enables the matching forbidden.tsx +
    // unauthorized.tsx file conventions per route group. We ship the
    // scaffolds at apps/web/app/[locale]/(account)/{forbidden,unauthorized}.tsx
    // ready to activate at the auth-integration milestone (M6); flipping
    // the flag now means the routes resolve correctly the moment the
    // first portal Server Component calls the helper.
    authInterrupts: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [],
  },
  headers: wellKnownHeaders,
  redirects: siteRedirects,
  rewrites: siteRewrites,
};

export default config;
