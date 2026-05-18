import type { MetadataRoute } from 'next';

/**
 * Locale-aware sitemap (per D14 + D26). Reserved routes per U2 + U3.
 * Account routes excluded (auth-required, not indexable).
 * API + .well-known excluded (no SEO value).
 *
 * As route count grows past ~5k entries, switch to `generateSitemaps()` +
 * chunked output (Google's per-sitemap limit is 50k URLs / 50MB).
 */

const SUPPORTED_LOCALES = ['en'] as const;

// Public marketing routes — reserved at M1 even when content is a stub.
// Locking URLs prevents painful 301-chains later.
const MARKETING_ROUTES = [
  '',
  '/features',
  '/pricing',
  '/about',
  '/contact',
  '/science',
  '/for-business',
  '/customers',
  '/help',
  '/legal/privacy',
  '/legal/terms',
  '/legal/cookies',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const now = new Date();

  return SUPPORTED_LOCALES.flatMap((locale) =>
    MARKETING_ROUTES.map((route) => {
      const isHome = route === '';
      return {
        url: `${base}/${locale}${route}`,
        lastModified: now,
        changeFrequency: isHome ? ('weekly' as const) : ('monthly' as const),
        priority: isHome ? 1.0 : 0.7,
      };
    }),
  );
}
