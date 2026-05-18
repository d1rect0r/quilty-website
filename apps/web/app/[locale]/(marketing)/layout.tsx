import { SkipLink } from '@/components/site/SkipLink';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { FocusOnNavigate } from '@/components/site/FocusOnNavigate';

/**
 * Marketing-tier layout. Header + footer + skip-link + route-change focus
 * handler. Per ADR-0005 two-tier CSP: marketing routes get the static +
 * hash-pinned CSP variant in proxy.ts (Commit 5).
 *
 * `<main id="main" tabIndex={-1}>` is the canonical Next.js 16 a11y target
 * for the FocusOnNavigate client component to re-focus on every route change
 * (Round-5 a11y agent).
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
    </>
  );
}
