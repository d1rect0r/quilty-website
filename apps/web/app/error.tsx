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
        <p className="text-danger-fg text-sm font-medium">Something went wrong</p>
        <h1 className="text-fg-default mt-2 text-4xl font-semibold">Unexpected error</h1>
        <p className="text-fg-muted mt-4">
          We&apos;ve been notified. Try again, or head back home.
        </p>
        {error.digest ? (
          <p className="text-fg-subtle mt-2 text-xs">
            Reference: <code>{error.digest}</code>
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover mt-8 rounded-md px-4 py-2.5"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
