'use client';

import Link from 'next/link';
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
  // Copy Reference state lives inline because the shared
  // CopyReference Client Component depends on Tailwind classes that
  // don't render here (root layout's globals.css load is the failure
  // condition that triggered GlobalError in the first place). The JS
  // state model is identical to CopyReference's; only the styling is
  // duplicated inline.
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = () => {
    if (error.digest === undefined) return;
    const digest = error.digest;
    navigator.clipboard
      .writeText(digest)
      .then(() => {
        setCopied(true);
        if (copyTimer.current !== null) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // No-op — the digest remains visible in the page.
      });
  };

  // Cleanup on unmount — clear the revert timer so setCopied(false)
  // doesn't fire on an unmounted component if the user navigates
  // away mid-revert (mirrors the CopyReference Client Component
  // pattern but lives inline because global-error.tsx is
  // CSS-pipeline-independent).
  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    const container = getClientContainer(makeClientContainer);
    container.errorReporter.captureException(error, {
      boundary: 'global-error',
      ...(error.digest !== undefined && { digest: error.digest }),
    });
    container.logger.error('error_boundary_caught', {
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
      <head>
        {/*
          Inline <meta> in <head> — global-error.tsx owns its own
          <html>+<body> because the root layout failed. Defense-in-
          depth noindex so a crawler that hits the URL mid-failure
          doesn't index the broken state.

          ARCHITECTURAL NOTE on the meta-only tier: global-error fires
          on any URL (root-layout crash on /, /en/pricing, anywhere).
          proxy.ts's `NOINDEX_PATH_PATTERNS` matches specific path
          shapes (/account/*, /api/*, (errors)/*), NOT arbitrary
          marketing routes — adding a `noindex` header to every
          marketing route by default would break SEO for the indexable
          surfaces. Next.js's middleware can't see "this response WILL
          render global-error.tsx" because the proxy runs before
          rendering. The meta tag IS the canonical mechanism Next.js
          supports for global-error metadata (the file doesn't accept
          `generateMetadata`). In 2026, every meaningful crawler
          (Googlebot, Bingbot, DuckDuckBot, Yandex, the AI training
          set) parses HTML and respects the meta tag. The X-Robots-Tag
          header parity is a deliberate architectural deferral, not a
          TODO — the right fix is a Next.js feature (error-state-aware
          headers) that doesn't exist today.
        */}
        <meta name="robots" content="noindex, nofollow" />
      </head>
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
          </div>
          {/*
            Digest + Copy button live OUTSIDE the role="alert" region —
            ARIA 1.2 §6.6.5 nested-region rationale (NVDA + JAWS flatten
            nested regions, and the aria-atomic="true" parent would
            re-read the entire error message on every Copy click).
          */}
          {error.digest ? (
            <p
              style={{
                marginTop: '0.5rem',
                fontSize: '0.75rem',
                color: FALLBACK_FG_MUTED,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>
                Reference: <code data-testid="error-digest">{error.digest}</code>
              </span>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copy error reference to clipboard"
                className="global-error-cta"
                style={{
                  // min 44×44 CSS px (WCAG 2.5.5 AA target size) — match
                  // the sibling Try-again + Go-home + Email-support
                  // buttons in this file for visual + a11y consistency.
                  minHeight: '2.75rem',
                  minWidth: '2.75rem',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.25rem',
                  // #767676 = 4.54:1 on white (WCAG 1.4.11 ≥ 3:1).
                  border: '1px solid #767676',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  color: '#1a1a1a',
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              {/*
                Visually-hidden status region — implicit role=status +
                aria-live=polite via <output>; populated only after a
                successful copy so AT announces the change event.
              */}
              <output
                style={{
                  position: 'absolute',
                  width: '1px',
                  height: '1px',
                  padding: '0',
                  margin: '-1px',
                  overflow: 'hidden',
                  clip: 'rect(0, 0, 0, 0)',
                  whiteSpace: 'nowrap',
                  border: '0',
                }}
              >
                {copied ? 'Reference copied' : ''}
              </output>
            </p>
          ) : null}
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
                  // #767676 on #fff = 4.54:1 (WCAG 1.4.11 ≥ 3:1 for UI
                  // component boundaries). The prior #ccc was 1.61:1 —
                  // a fail. Hard-coded because globals.css doesn't load
                  // when the root layout has thrown.
                  border: '1px solid #767676',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                Try again
              </button>
            )}
            {/* next/link with prefetch={false}: the router-context
                handlers may not be intact (root layout failed) but
                Link still falls back to a regular <a> navigation via
                the href attribute. prefetch={false} skips the
                speculative fetch which the broken router would
                short-circuit anyway. */}
            <Link
              href="/"
              prefetch={false}
              className="global-error-cta"
              style={{
                minHeight: '44px',
                minWidth: '44px',
                padding: '0.5rem 1.25rem',
                borderRadius: '0.375rem',
                // #767676 = 4.54:1 on white (WCAG 1.4.11 ≥ 3:1). The
                // earlier #ccc (1.61:1) was a fail flagged in code
                // review alongside the Try-again button which already
                // moved to #767676.
                border: '1px solid #767676',
                color: 'inherit',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
              }}
            >
              Go home
            </Link>
            <a
              href={supportHref}
              className="global-error-cta"
              style={{
                minHeight: '44px',
                minWidth: '44px',
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
