'use client';

import { useEffect, useRef, useState } from 'react';
import { makeClientContainer } from '@/composition.client';
import { getClientContainer } from '@/lib/get-container';
import { SUPPORT_MAILTO } from '@/lib/site-contacts';

/**
 * Global error boundary — catches errors in the root layout itself.
 *
 * Per Next.js convention: must render its own `<html>` + `<body>` because
 * the root layout failed to render. Cannot use any layout JSX from above.
 *
 * Captures the failure via the ClientContainer's wrapped ErrorReporter
 * so even a layout-level crash flows to Sentry with the PHI sanitizer
 * applied (D67 chokepoint per ADR-0010). The `getClientContainer` call
 * uses the `globalThis.__quiltyClientContainer ??=` singleton anchor so
 * it returns the same ClientContainer the rest of the client tree
 * composed; if the layout crashed before the singleton was anchored,
 * getClientContainer constructs a fresh one here.
 *
 * Inline styles only — global-error.tsx cannot depend on any layout
 * / CSS pipeline because the root layout (which loads globals.css)
 * failed to render.
 */
interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const RETRY_WINDOW_MS = 5_000;

const FALLBACK_FG_MUTED = 'var(--color-fg-muted, #4a4a4a)';

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastResetAt = useRef<number | null>(null);
  const [permanentFallback, setPermanentFallback] = useState(false);

  useEffect(() => {
    const container = getClientContainer(makeClientContainer);
    container.errorReporter.captureException(error, {
      boundary: 'global-error',
      ...(error.digest !== undefined && { digest: error.digest }),
    });
    container.logger.error(error.message, {
      boundary: 'global-error',
      error_name: error.name,
      ...(error.digest !== undefined && { digest: error.digest }),
    });
    // WCAG 2.4.3 + 3.2.5 — context change focus; same rationale as
    // error.tsx but without the surrounding layout chrome.
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

  return (
    <html lang="en">
      <body>
        {/* Minimal <style> block — the root layout (which loads
            globals.css) failed, so we inline the focus-visible
            indicator + the heading's outline reset here. Using
            outline:transparent (not outline:none) on the heading
            keeps the Windows High Contrast Mode forced-colors UA
            ring intact (WCAG 1.4.11). */}
        <style>{`
          #global-error-heading { outline: transparent solid 2px; outline-offset: 2px; }
          #global-error-heading:focus-visible { outline-color: #1343c7; }
          .global-error-cta:focus-visible {
            outline: 2px solid #1343c7;
            outline-offset: 2px;
          }
        `}</style>
        {/* No <main id="main"> skip-link target here — the root
            layout (which would have rendered the upstream skip-link)
            failed, so a skip-link target with no upstream anchor would
            be a dangling reference. WCAG 2.4.1 (Bypass Blocks) does
            not apply when there's a single, unique page region. */}
        <main
          style={{
            maxWidth: '40rem',
            margin: '0 auto',
            padding: '6rem 1.5rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1
            id="global-error-heading"
            ref={headingRef}
            tabIndex={-1}
            style={{ fontSize: '2rem', fontWeight: 600 }}
          >
            Something went wrong
          </h1>
          {/* WCAG SC 4.1.3 + ARIA19 — alert region sibling to the heading. */}
          <div role="alert" aria-live="assertive" aria-atomic="true">
            <p style={{ marginTop: '1rem', color: FALLBACK_FG_MUTED }}>
              {permanentFallback
                ? 'We could not recover. Reload the page or email support if it keeps happening.'
                : 'The page failed to load. Try again, or contact support if the problem persists.'}
            </p>
            {error.digest ? (
              <p
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  color: FALLBACK_FG_MUTED,
                }}
              >
                Reference: <code data-testid="error-digest">{error.digest}</code>
              </p>
            ) : null}
          </div>
          <div
            style={{
              marginTop: '2rem',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            {permanentFallback ? null : (
              <button
                type="button"
                onClick={handleReset}
                className="global-error-cta"
                style={{
                  minHeight: '2.75rem',
                  minWidth: '2.75rem',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #ccc',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                Try again
              </button>
            )}
            {/* Plain <a>, not next/link: the root layout crashed,
                so the client-side router context the Link component
                depends on may not be intact. A full-page navigation
                via plain anchor is the safe path here. */}
            { }
            <a
              href="/"
              className="global-error-cta"
              style={{
                minHeight: '2.75rem',
                minWidth: '2.75rem',
                padding: '0.5rem 1.25rem',
                borderRadius: '0.375rem',
                border: '1px solid #ccc',
                color: 'inherit',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
              }}
            >
              Go home
            </a>
            <a
              href={supportHref}
              className="global-error-cta"
              style={{
                minHeight: '2.75rem',
                minWidth: '2.75rem',
                padding: '0.5rem 1.25rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: FALLBACK_FG_MUTED,
                fontSize: '0.875rem',
                textDecoration: 'underline',
              }}
            >
              Email support
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
