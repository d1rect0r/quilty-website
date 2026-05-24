'use client';

import { useEffect, useRef, useState } from 'react';

interface CopyReferenceProps {
  readonly value: string;
}

/**
 * Copy-to-clipboard button for the error-boundary digest (D145).
 *
 * Renders next to the visible `Reference: <digest>` text on every
 * error.tsx + global-error.tsx surface. Pairs with the mailto
 * support CTA (already in error.tsx) so users can either:
 *   - Click "Copy" → paste into support chat / ticket without
 *     transcription error
 *   - Click "Email support" → mailto with the digest pre-encoded
 *     into the subject line
 *
 * Linear ships this exact UX (copy-button + mailto pair) on their
 * 500 page; Vercel + Stripe each ship one of the two.
 *
 * A11y contract:
 *   - Button has visible label ("Copy" / "Copied") + `aria-label`
 *     for AT context ("Copy reference <value> to clipboard")
 *   - On click, a sibling <output> (implicit role=status +
 *     aria-live=polite per HTML-AAM) announces "Reference copied"
 *     — sighted users see the label change, AT users hear the
 *     status update without focus shift
 *   - 1.5s visual revert (label flips back to "Copy") gives
 *     sighted users a clear "you can copy again" affordance
 *   - 44×44 touch target (min-h-11 min-w-11) per WCAG 2.5.5
 *
 * `navigator.clipboard.writeText` requires HTTPS + a secure context;
 * dev (`localhost`) is treated as secure by all modern browsers. The
 * .catch path silently no-ops because clipboard failures aren't
 * actionable for the user — they can still read the digest off the
 * page + manually copy via OS-level UI.
 */
export function CopyReference({ value }: CopyReferenceProps) {
  const [copied, setCopied] = useState(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount — if the component is unmounted mid-revert
  // (e.g., the error boundary is dismissed by a successful retry or
  // a navigation), the timer must be cleared so `setCopied(false)`
  // doesn't fire on an unmounted component.
  useEffect(() => {
    return () => {
      if (revertTimer.current !== null) clearTimeout(revertTimer.current);
    };
  }, []);

  const handleClick = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        if (revertTimer.current !== null) clearTimeout(revertTimer.current);
        revertTimer.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // No-op — the digest remains visible + selectable in the
        // page so manual OS-level copy works as a fallback.
      });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Copy reference ${value} to clipboard`}
        // min-h-11 + min-w-11 (44×44 CSS px) — WCAG 2.5.5 AA target
        // size. The button sits inline with body text but the inline
        // siblings are not interactive, so the spacing exception
        // wouldn't apply; default to the recommended floor.
        className="border-border-default text-fg-default hover:bg-bg-surface focus-visible:outline-border-focus ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {/*
        <output> carries implicit role=status + aria-live=polite per
        HTML-AAM. Empty on initial render — populated only after a
        successful copy so the live-region observer fires on the
        content change (ARIA 1.2 §6.6.3, same registration concern
        the error.tsx live region addresses).
      */}
      <output className="sr-only">{copied ? 'Reference copied' : ''}</output>
    </>
  );
}
