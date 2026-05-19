'use client';

import { useEffect } from 'react';
import { logError } from '@/lib/observability/log-error';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    logError(error, {
      boundary: 'app-error',
      digest: error.digest,
    });
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
