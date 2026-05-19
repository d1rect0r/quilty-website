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

/**
 * Versioned redirect table (D16). Root `/` is unlocalized — redirect to the
 * default locale segment. Add 301-permanent entries here when content moves;
 * never blanket-301 to homepage (Google soft-404 trap).
 */
async function siteRedirects() {
  return [{ source: '/', destination: '/en', permanent: false }];
}

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: false,
  // typedRoutes graduated from experimental in Next.js 16; the
  // experimental.typedRoutes path is deprecated.
  typedRoutes: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [],
  },
  redirects: siteRedirects,
  headers: wellKnownHeaders,
};

export default config;
