import type { MetadataRoute } from 'next';

/**
 * Web App Manifest — emitted at `/manifest.webmanifest`.
 *
 * Icon set follows the lean canonical shape (D109): a single SVG source
 * of truth at `/icon.svg` plus two PNG raster tiers (192 / 512) for
 * legacy launchers, with separate maskable variants for Android
 * adaptive-icon launchers per `purpose: "maskable"` (the maskable
 * raster carries 20% safe-zone padding so the glyph survives every
 * launcher crop shape).
 *
 * Forward-claim fields (D110) — `id`, `scope`, `start_url`,
 * `display_override`, `lang`, `dir`, `orientation`, `categories` — are
 * declared up-front so a future install-prompt activation does not
 * require a manifest schema migration. `id` is the install identity
 * (re-uses the apex URL so Chrome treats the apex install as a single
 * PWA entity across all locale segments).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Quilty',
    short_name: 'Quilty',
    description: 'Quilty — a mental-health peer-set product.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    orientation: 'portrait',
    lang: 'en',
    dir: 'ltr',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    categories: ['health', 'lifestyle', 'medical'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
