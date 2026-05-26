'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { makeClientContainer } from '@/composition.client';
import { CopyReference } from '@/components/site/CopyReference';
import { getClientContainer } from '@/lib/get-container';
import { SUPPORT_MAILTO } from '@/lib/site-contacts';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// D147 retry-fallback window — two reset clicks within this span
// reveal the permanent fallback (return-home CTA replacing retry).
const RETRY_WINDOW_MS = 5_000;

/**
 * Marketing-tier route-group error boundary (D114 + D123).
 *
 * Catches errors thrown by routes under `(marketing)/*`. Renders
 * INSIDE the marketing layout, so the surrounding chrome (Header +
 * Footer + SkipLink + SiteBanner suspense boundary) stays intact —
 * the user sees a "something went wrong" panel in place of the
 * failing page, not a bare full-screen surface.
 *
 * Contract mirrors `apps/web/app/error.tsx` (D147 retry-fallback + WCAG 4.1.3):
 *   - `role="alert"` + `aria-live="assertive"` + `aria-atomic="true"`
 *     on the announcement sibling (WCAG 4.1.3 + ARIA19)
 *   - h1 focused on mount (`tabIndex={-1}` + `headingRef.current?.focus()`
 *     in useEffect) per WCAG 2.4.3 + 3.2.5 context-change focus
 *   - `outline:transparent` (not `outline:none`) for Windows High
 *     Contrast Mode forced-colors UA recoloring (WCAG 1.4.11)
 *   - D147 retry-fallback (2-in-5s → permanent return-home CTA
 *     replacing retry; the disabled state was rejected because
 *     "try later" is the wrong signal)
 *   - Container-routed errorReporter + logger (D67 PHI sanitizer
 *     chokepoint per ADR-0010); the wrapped Sentry adapter runs
 *     PHI sanitization on the context before the SDK serializes
 *
 * NO `<main id="main">` here — the marketing layout owns the main
 * landmark; the error.tsx replaces the segment children, not the
 * layout itself. Adding a second `<main>` would create two
 * landmarks per WCAG 1.3.6 + ARIA 1.2.
 */
export default function MarketingError({ error, reset }: ErrorPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastResetAt = useRef<number | null>(null);
  const [permanentFallback, setPermanentFallback] = useState(false);
  // `hasMounted` flips once on first commit. The live-region copy is
  // computed inline from (hasMounted, permanentFallback) — empty
  // before mount, populated after — so NVDA/JAWS/VoiceOver register
  // the empty `role="alert"` region first, then observe the content
  // insertion as the announcement event (ARIA 1.2 §6.6.3). Derived
  // state (vs a separate setAnnouncement) avoids the React 19
  // react-hooks/set-state-in-effect cascading-render warning.
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    const container = getClientContainer(makeClientContainer);
    container.errorReporter.captureException(error, {
      boundary: 'marketing-error',
      ...(error.digest !== undefined && { digest: error.digest }),
    });
    container.logger.error('error_boundary_caught', {
      boundary: 'marketing-error',
      error_name: error.name,
      ...(error.digest !== undefined && { digest: error.digest }),
    });
    // ARIA live-region registration requires the empty region to
    // commit FIRST, then the content to be injected as a separate
    // mutation observed by AT (ARIA 1.2 §6.6.3). The cascading render
    // is intentional + the only path modern NVDA/JAWS/VoiceOver
    // reliably announce on. react-hooks/set-state-in-effect is the
    // wrong default here — the perf-hint it surfaces is not a bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMounted(true);
    headingRef.current?.focus();
  }, [error]);

  const announcement = !hasMounted
    ? ''
    : permanentFallback
      ? 'We could not recover from this error. Head back home or email support if it keeps happening.'
      : 'We’ve been notified. Try again, or head back home.';

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
      aria-labelledby="marketing-error-heading"
      className="mx-auto max-w-2xl px-6 py-24 text-center"
    >
      {/*
        React 19 hoists <meta> tags rendered anywhere in the tree into
        <head>. The failing page's metadata may have left robots:index
        in place (marketing pages are indexable); this overlay
        prevents Googlebot from indexing the error state if it crawls
        the URL mid-fault. Defense-in-depth.
      */}
      <meta name="robots" content="noindex, nofollow" />
      <p className="text-danger-fg text-sm font-medium">Something went wrong</p>
      <h1
        id="marketing-error-heading"
        ref={headingRef}
        tabIndex={-1}
        // `focus:` (not `focus-visible:`) so the outline ring renders
        // when the heading is programmatically focused on mount;
        // Chromium 117+ + Safari 17+ skip `:focus-visible` for
        // script-driven focus events, leaving the ring invisible.
        className="text-fg-default focus:outline-border-focus mt-2 text-4xl font-semibold outline-2 outline-offset-2 outline-transparent"
      >
        Unexpected error
      </h1>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {/*
          Live-region copy is injected post-mount (see useEffect above)
          so AT observes the content insertion as a status-message
          event. The digest paragraph is INTENTIONALLY OUTSIDE this
          region — see apex error.tsx for the ARIA 1.2 §6.6.5 nested-
          live-region rationale; the Copy button's own status live
          region must fire independently of the alert announcement.
        */}
        {announcement ? <p className="text-fg-muted mt-4">{announcement}</p> : null}
      </div>
      {error.digest && announcement ? (
        <p className="text-fg-muted mt-2 inline-flex items-center text-xs">
          <span>
            Reference:{' '}
            <code data-testid="marketing-error-digest" className="font-mono">
              {error.digest}
            </code>
          </span>
          <CopyReference value={error.digest} />
        </p>
      ) : null}
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
          href="/en"
          className="text-fg-default border-border-default hover:bg-bg-surface inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-4"
        >
          Go home
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
