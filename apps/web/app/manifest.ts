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
 *
 * `shortcuts` + `launch_handler` ship now so OS-level long-press
 * shortcut menus + single-instance PWA behavior work the moment the
 * install prompt activates. Two deeper manifest fields are deliberately
 * deferred:
 *   - `screenshots`: requires real product UI (placeholder images in
 *     the install dialog degrade first-impression UX).
 *   - `related_applications` + `prefer_related_applications`: requires
 *     the iOS App Store numeric ID, which is not assigned until App
 *     Store Connect submission. Adding back at the public-launch
 *     milestone.
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
    // OS-level long-press shortcuts (Android home-screen icon, Chrome
    // app-list, Windows jump-list, macOS Dock right-click). URLs are
    // hard-coded to the default locale — shortcut UA does not negotiate
    // locale, the portal handles locale on landing.
    shortcuts: [
      {
        // Second-person framing on the description: AT (TalkBack /
        // VoiceOver / Narrator) reads this verbatim on long-press
        // shortcut surfaces, and a definite-article "the" can imply
        // the user already has an active account/subscription —
        // ambiguous for first-time installs.
        name: 'My account',
        short_name: 'Account',
        description: 'Open your Quilty account portal.',
        url: '/en/account',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }],
      },
      {
        name: 'Subscription',
        // `short_name` "Manage plan" fits the ≤12 char W3C budget
        // (11 chars) with a 1-char margin against truncation in
        // constrained Android launchers + Windows jump-list tooltips.
        // The full `name` field carries the precise term on surfaces
        // that render the longer label.
        short_name: 'Manage plan',
        description: 'Manage your Quilty subscription.',
        url: '/en/account/subscription',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }],
      },
    ],
    // Single-instance PWA: a shortcut tap (or any OS-initiated launch)
    // navigates the existing window instead of spawning a duplicate.
    // Convergent enterprise pattern — every reference shop (Linear,
    // 1Password, Notion, Discord) ships `navigate-existing` to avoid
    // the multi-window split-attention UX failure mode.
    launch_handler: { client_mode: 'navigate-existing' },
  };
}
