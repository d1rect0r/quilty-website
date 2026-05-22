import type { MetadataRoute } from 'next';

/**
 * Locale-aware sitemap (per D14 + D26). Reserved routes per U2 + U3.
 * Account routes excluded (auth-required, not indexable).
 * API + .well-known excluded (no SEO value).
 *
 * As route count grows past ~5k entries, switch to `generateSitemaps()` +
 * chunked output (Google's per-sitemap limit is 50k URLs / 50MB).
 *
 * `lastModified` carries a STABLE per-route date rather than
 * `new Date()` at request time. Googlebot uses lastModified as a
 * crawl-budget signal; a sitemap that reports every URL as modified
 * "right now" on every fetch triggers Google to mark the signal
 * unreliable and ignore changeFrequency entirely. Each route's date
 * here is the last meaningful content change for that URL — bump
 * when the page's content changes, leave alone when only layout or
 * boilerplate changes.
 */

const SUPPORTED_LOCALES = ['en'] as const;

// Most stub pages share a scaffold-baseline date until real content
// lands. Real-content dates are stamped per page so Googlebot treats
// the lastModified signal as reliable (per-route stability rather
// than per-request `new Date()`).
const SCAFFOLD_DATE = '2026-05-18';
const SECURITY_PAGE_DATE = '2026-05-21';
const ACCESSIBILITY_PAGE_DATE = '2026-05-22';

interface MarketingRoute {
  readonly path: string;
  readonly lastModified: string;
  readonly changeFrequency: 'weekly' | 'monthly' | 'yearly';
  readonly priority: number;
}

// Public marketing routes — declared even when content is a stub so
// the URL surface is locked. Locking URLs prevents painful 301-chains
// later.
const MARKETING_ROUTES: readonly MarketingRoute[] = [
  { path: '', lastModified: SCAFFOLD_DATE, changeFrequency: 'weekly', priority: 1.0 },
  { path: '/features', lastModified: SCAFFOLD_DATE, changeFrequency: 'monthly', priority: 0.7 },
  { path: '/pricing', lastModified: SCAFFOLD_DATE, changeFrequency: 'monthly', priority: 0.7 },
  { path: '/about', lastModified: SCAFFOLD_DATE, changeFrequency: 'monthly', priority: 0.7 },
  { path: '/contact', lastModified: SCAFFOLD_DATE, changeFrequency: 'monthly', priority: 0.7 },
  { path: '/science', lastModified: SCAFFOLD_DATE, changeFrequency: 'monthly', priority: 0.7 },
  { path: '/for-business', lastModified: SCAFFOLD_DATE, changeFrequency: 'monthly', priority: 0.7 },
  { path: '/customers', lastModified: SCAFFOLD_DATE, changeFrequency: 'monthly', priority: 0.7 },
  { path: '/help', lastModified: SCAFFOLD_DATE, changeFrequency: 'monthly', priority: 0.7 },
  // `/security` is the RFC 9116 policy page — indexable on purpose
  // so security researchers + automated tooling discover the
  // responsible-disclosure surface through normal search paths.
  {
    path: '/security',
    lastModified: SECURITY_PAGE_DATE,
    changeFrequency: 'yearly',
    priority: 0.7,
  },
  { path: '/legal/privacy', lastModified: SCAFFOLD_DATE, changeFrequency: 'yearly', priority: 0.7 },
  { path: '/legal/terms', lastModified: SCAFFOLD_DATE, changeFrequency: 'yearly', priority: 0.7 },
  { path: '/legal/cookies', lastModified: SCAFFOLD_DATE, changeFrequency: 'yearly', priority: 0.7 },
  // `/legal/accessibility` is the EAA (EU 2019/882) + EN 301 549
  // conformance statement — indexable so supervisory-authority
  // tooling + research crawlers can discover it without the
  // /accessibility short alias. Priority 0.7 matches peer legal
  // pages — EAA discoverability is a load-bearing compliance
  // posture; signalling it as lower-priority than the cookie
  // policy would invert the regulatory intent.
  {
    path: '/legal/accessibility',
    lastModified: ACCESSIBILITY_PAGE_DATE,
    changeFrequency: 'yearly',
    priority: 0.7,
  },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  return SUPPORTED_LOCALES.flatMap((locale) =>
    MARKETING_ROUTES.map((route) => ({
      url: `${base}/${locale}${route.path}`,
      lastModified: new Date(route.lastModified),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
  );
}
