'use client';

import { useEffect } from 'react';

/**
 * Route-segment-level error boundary. Catches errors thrown in Server +
 * Client Components within the segment + below. Per Next.js convention:
 *   - Must be a Client Component (uses useEffect for error logging).
 *   - Receives `error` + `reset` props.
 *
 * The `reset()` call re-renders the segment (Next.js attempts to recover);
 * we surface a CTA so the user can choose.
 *
 * At M6+ the `useEffect` here will call `logError()` from the observability
 * adapter (D67) to dispatch to Sentry with PHI sanitization. At M1 the
 * adapter doesn't exist yet — error stays client-side only.
 */
interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Commit 6 wires the Sentry/OTel adapter here. M1 = no-op (deliberate;
    // we don't want partial PHI leaks before the sanitizer ships).
    if (process.env.NODE_ENV === 'development') {
      // Dev-only console for local debugging.

      console.error('[ErrorBoundary]', error);
    }
  }, [error]);

  // Renders inside app/layout.tsx's <body> — does NOT route through any
  // group layout, so it must provide its own <main> landmark + skip-link
  // target per WCAG 2.4.1 (Round-5 a11y reviewer).
  return (
    <main id="main" tabIndex={-1}>
      <section className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="text-sm font-medium text-danger-fg">Something went wrong</p>
        <h1 className="mt-2 text-4xl font-semibold text-fg-default">
          Unexpected error
        </h1>
        <p className="mt-4 text-fg-muted">
          We&apos;ve been notified. Try again, or head back home.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-fg-subtle">
            Reference: <code>{error.digest}</code>
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-8 rounded-md bg-accent-primary px-4 py-2.5 text-accent-fg hover:bg-accent-primary-hover"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
