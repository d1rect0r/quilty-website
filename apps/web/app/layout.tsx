import { WebVitalsReporter } from '@quilty/observability';
import {
  buildIconMetadata,
  buildOpenGraphMetadata,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  JsonLd,
} from '@quilty/seo';
import { Providers } from '@/components/app/Providers';
import { Spotlight } from '@/components/dev/Spotlight';
import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * Root layout — handles only the universal page chrome that wraps every
 * locale segment. The `<html lang>` attribute and locale-aware metadata
 * live in `app/[locale]/layout.tsx`. This top-level layout exists because
 * Next.js requires a root `<html>` + `<body>` somewhere in the tree, and
 * because there are unlocalized routes (`/api/*`, `/.well-known/*`, the
 * root redirect at `/`) that need a layout but aren't locale-scoped.
 *
 * Note: `<title>` here is a fallback to dodge the Next.js 15.2+/16
 * streaming-metadata bug where streaming SSR can emit `<head>` before
 * per-route metadata is resolved (Googlebot then indexes an empty title).
 */

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const SITE_DESCRIPTION = 'Quilty — a mental-health peer-set product.';
const SITE_TITLE = 'Quilty';
const OG_IMAGE_ALT = 'Quilty — geometric Q wordmark on a neutral background.';

const ogMetadata = buildOpenGraphMetadata({
  ogImage: new URL('/og-default.jpg', siteUrl).toString(),
  ogImageAlt: OG_IMAGE_ALT,
  ogImageType: 'image/jpeg',
  url: siteUrl,
  siteName: SITE_TITLE,
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
});

// Favicon stack (D109 lean canonical): ICO first (legacy fallback) +
// SVG last (preferred by modern browsers — the last viable match wins)
// + 180×180 apple-touch for iOS Springboard. Maskable variants are
// wired through `manifest.ts` (`purpose: "maskable"`), NOT the <link>
// chain — Android adaptive icons consume the manifest.
const iconMetadata = buildIconMetadata({
  icons: [
    { url: '/favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
    { url: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
  ],
  appleTouchIcon: '/apple-touch-icon.png',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: SITE_TITLE,
    template: '%s · Quilty',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_TITLE,
  ...ogMetadata,
  ...iconMetadata,
  // No `alternates.canonical` at the root layout — relative canonicals
  // resolve against `metadataBase` and would point every page back at the
  // homepage, causing Google to fold every stub into the apex URL
  // . Each page declares its own canonical via
  // its own `generateMetadata` / `metadata` export.
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Organization + WebSite emitted at the root so the
            graph-connected `isPartOf` reference from per-page
            MedicalWebPage / FAQPage nodes always resolves — AI
            citation graphs devalue dangling references. */}
        <JsonLd data={buildOrganizationJsonLd(siteUrl)} />
        <JsonLd data={buildWebSiteJsonLd(siteUrl)} />
        <WebVitalsReporter />
        {/* Sentry Spotlight — dev-only debug overlay. The component
            gates internally on NODE_ENV; the production minifier
            tree-shakes the dynamic import body out of the prod bundle. */}
        <Spotlight />
        {/* Providers wraps client-side TanStack Query (ADR-0017
            Decision H) + Toast surface (ADR-0017 Decision I).
            Server Components above remain unaffected; this provider
            bounds the client-tree below. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
