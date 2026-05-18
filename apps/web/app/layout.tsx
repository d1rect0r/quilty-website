import type { Metadata, Viewport } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { WebVitalsReporter } from '@/lib/observability/web-vitals';
import { buildOrganizationJsonLd } from '@/lib/seo/schemas';
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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Quilty',
    template: '%s · Quilty',
  },
  description: 'Quilty — a mental-health peer-set product.',
  applicationName: 'Quilty',
  openGraph: {
    type: 'website',
    siteName: 'Quilty',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
  },
  alternates: {
    canonical: './',
  },
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
        <JsonLd data={buildOrganizationJsonLd(siteUrl)} />
        <WebVitalsReporter />
        {children}
      </body>
    </html>
  );
}
