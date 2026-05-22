import { Suspense } from 'react';
import { SkipLink } from '@/components/site/SkipLink';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { FocusOnNavigate } from '@/components/site/FocusOnNavigate';
import { SiteBanner } from '@/components/site/SiteBanner';

/**
 * Marketing-tier layout. Header + footer + skip-link + route-change focus
 * handler + cookie banner. Per ADR-0005 two-tier CSP: marketing routes
 * get the static + hash-pinned CSP variant in proxy.ts.
 *
 * `<main id="main" tabIndex={-1}>` is the canonical Next.js 16 a11y target
 * for the FocusOnNavigate client component to re-focus on every route change.
 *
 * `<SiteBanner />` is suspense-wrapped because it reads `cookies()` +
 * `headers()` (per-request server APIs) and renders nothing when the
 * user has already made a consent choice OR when `Sec-GPC: 1` is
 * detected (the Footer's `<GpcHonoredIndicator />` handles that
 * surface per D62).
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkipLink />
      <FocusOnNavigate />
      <Header />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
      <Suspense fallback={null}>
        <SiteBanner />
      </Suspense>
    </>
  );
}
