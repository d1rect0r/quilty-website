'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { makeClientContainer } from '@/composition.client';
import { getClientContainer } from '@/lib/get-container';
import { SUPPORT_MAILTO } from '@/lib/site-contacts';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// D147 — two reset clicks inside this window reveal the permanent
// fallback view. Short enough that an accidental double-click does
// not trigger it; long enough that a deliberate "try again, didn't
// work, try again" sequence does.
const RETRY_WINDOW_MS = 5_000;

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastResetAt = useRef<number | null>(null);
  const [permanentFallback, setPermanentFallback] = useState(false);

  useEffect(() => {
    // The Container's errorReporter is the wrapped Sentry adapter:
    // PHI sanitizer runs over the context before the SDK sees it
    // (D67 architectural seal per ADR-0010).
    const container = getClientContainer(makeClientContainer);
    container.errorReporter.captureException(error, {
      boundary: 'app-error',
      ...(error.digest !== undefined && { digest: error.digest }),
    });
    container.logger.error(error.message, {
      boundary: 'app-error',
      error_name: error.name,
      ...(error.digest !== undefined && { digest: error.digest }),
    });
    // WCAG 2.4.3 + 3.2.5 — the error boundary mounting is a context
    // change, not a status update; focus the heading so the screen
    // reader announces the page title and AT users land at the
    // alert region rather than wherever focus was when the error
    // fired.
    headingRef.current?.focus();
  }, [error]);

  const handleReset = () => {
    const now = Date.now();
    if (lastResetAt.current !== null && now - lastResetAt.current < RETRY_WINDOW_MS) {
      setPermanentFallback(true);
      return;
    }
    lastResetAt.current = now;
    reset();
  };

  const supportHref = error.digest
    ? `mailto:${SUPPORT_MAILTO}?subject=${encodeURIComponent(`Error ${error.digest}`)}`
    : `mailto:${SUPPORT_MAILTO}`;

  // Renders inside app/layout.tsx's <body> — does NOT route through any
  // group layout, so it must provide its own <main> landmark + skip-link
  // target per WCAG 2.4.1.
  return (
    <main id="main" tabIndex={-1}>
      <section aria-labelledby="error-heading" className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="text-danger-fg text-sm font-medium">Something went wrong</p>
        <h1
          id="error-heading"
          ref={headingRef}
          tabIndex={-1}
          // outline:transparent (not outline:none) so the Windows High
          // Contrast Mode forced-colors UA can recolor the outline in
          // place (WCAG 1.4.11). Mouse users see nothing visible in
          // normal rendering; HCM users see the recolored ring. The
          // element is programmatically focused on mount + not
          // tab-reachable, so this fires only on the mount focus.
          className="text-fg-default focus-visible:outline-border-focus mt-2 text-4xl font-semibold outline-2 outline-offset-2 outline-transparent"
        >
          Unexpected error
        </h1>
        {/* WCAG SC 4.1.3 Status Messages + ARIA19 technique — the
            announcement lives on a sibling element so the heading's
            semantics stay clean. role="alert" + aria-live="assertive"
            + aria-atomic="true" together force the screen reader to
            interrupt and read the entire region as one unit. */}
        <div role="alert" aria-live="assertive" aria-atomic="true">
          <p className="text-fg-muted mt-4">
            {permanentFallback
              ? 'We could not recover from this error. Head back home or email support if it keeps happening.'
              : 'We’ve been notified. Try again, or head back home.'}
          </p>
          {error.digest ? (
            <p className="text-fg-muted mt-2 text-xs">
              Reference:{' '}
              <code data-testid="error-digest" className="font-mono">
                {error.digest}
              </code>
            </p>
          ) : null}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {permanentFallback ? null : (
            <button
              type="button"
              onClick={handleReset}
              className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4"
            >
              Try again
            </button>
          )}
          <Link
            href="/"
            className="text-fg-default border-border-default hover:bg-bg-surface inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-4"
          >
            Go home
          </Link>
          {/* D145 mailto hook. The full copy-reference-button feature
              ships as a follow-up — this is the minimum-markup-churn
              landing so the button replacement is a one-element
              swap, not a layout reshuffle. */}
          <a
            href={supportHref}
            className="text-fg-muted hover:text-fg-default inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4 text-sm underline"
          >
            Email support
          </a>
        </div>
      </section>
    </main>
  );
}
