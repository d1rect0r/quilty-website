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

const RETRY_WINDOW_MS = 5_000;

/**
 * Portal-tier route-group error boundary (D114 + D123).
 *
 * Catches errors thrown by routes under `(account)/*`. Renders
 * INSIDE the portal layout — PortalNav + SkipLink + the portal
 * footer stay intact so a signed-in user can still navigate to
 * another tab if a single sub-screen failed. This is the load-bearing
 * UX difference vs the marketing tier: the user is mid-session +
 * authenticated, so losing the nav chrome on a single-screen failure
 * would feel like a session logout.
 *
 * Same WCAG 2.2 AA contract as `apps/web/app/error.tsx` (role/aria-live/
 * aria-atomic + h1 focus on mount + D147 retry-fallback). Errors flow
 * through the wrapped Sentry adapter so the PHI sanitizer chokepoint
 * (D67) runs over the context before SDK serialization — material for
 * portal pages that may carry quilty_sub identifiers in route state.
 *
 * NO `<main id="main">` here — the portal layout owns it.
 */
export default function AccountError({ error, reset }: ErrorPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastResetAt = useRef<number | null>(null);
  const [permanentFallback, setPermanentFallback] = useState(false);
  // hasMounted + derived announcement — see marketing error.tsx for
  // the ARIA 1.2 §6.6.3 + React 19 set-state-in-effect rationale.
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    const container = getClientContainer(makeClientContainer);
    container.errorReporter.captureException(error, {
      boundary: 'account-error',
      ...(error.digest !== undefined && { digest: error.digest }),
    });
    container.logger.error(error.message, {
      boundary: 'account-error',
      error_name: error.name,
      ...(error.digest !== undefined && { digest: error.digest }),
    });
    // Intentional cascading render — see marketing error.tsx for the
    // ARIA 1.2 §6.6.3 live-region registration rationale.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMounted(true);
    headingRef.current?.focus();
  }, [error]);

  const announcement = !hasMounted
    ? ''
    : permanentFallback
      ? 'We could not recover from this error. Head to your profile or email support if it keeps happening. Your session is still active.'
      : 'Your session is still active. Try again, or head to your profile.';

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

  return (
    <section
      aria-labelledby="account-error-heading"
      className="mx-auto max-w-2xl px-6 py-16 text-center"
    >
      <p className="text-danger-fg text-sm font-medium">Something went wrong</p>
      <h1
        id="account-error-heading"
        ref={headingRef}
        tabIndex={-1}
        // `focus:` (not `focus-visible:`) — see marketing error.tsx
        // for the Chromium 117+/Safari 17+ script-focus rationale.
        className="text-fg-default focus:outline-border-focus mt-2 text-3xl font-semibold outline-2 outline-offset-2 outline-transparent"
      >
        We couldn’t load this page
      </h1>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {announcement ? <p className="text-fg-muted mt-4">{announcement}</p> : null}
        {error.digest && announcement ? (
          <p className="text-fg-muted mt-2 text-xs">
            Reference:{' '}
            <code data-testid="account-error-digest" className="font-mono">
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
          href="/en/account"
          className="text-fg-default border-border-default hover:bg-bg-surface inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-4"
        >
          Go to profile
        </Link>
        <a
          href={supportHref}
          className="text-fg-muted hover:text-fg-default inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4 text-sm underline"
        >
          Email support
        </a>
      </div>
    </section>
  );
}
