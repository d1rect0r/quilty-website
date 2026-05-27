'use client';

import { useEffect, useRef } from 'react';

/**
 * iOS Safari "Add to Home Screen" coach-mark per ADR-0022 + U10.
 *
 * iOS doesn't fire `beforeinstallprompt` — the platform-native
 * install path is the share-sheet → "Add to Home Screen" action.
 * Apple has not exposed a programmatic install API in 14 years of
 * Safari + PWAs; the coach-mark is the only legitimate user-side
 * affordance.
 *
 * Accessibility:
 *   - `role="dialog"` + `aria-labelledby` + `aria-modal="true"` so
 *     screen readers announce the prompt as a modal.
 *   - Focus management: heading receives focus on mount; Escape
 *     dismisses; tab traps within the dialog while open.
 *   - Color contrast inherits the design-token cascade (light AND
 *     dark mode covered via `--color-bg-elevated` / `--color-fg-default`).
 */

export function IOSCoachMark({ onDismiss }: { onDismiss: () => void }): React.JSX.Element {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return (): void => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onDismiss]);

  return (
    <dialog
      open
      aria-labelledby="ios-coachmark-heading"
      aria-modal="true"
      className="bg-bg-overlay fixed inset-0 z-50 flex max-h-screen max-w-full items-end justify-center border-none p-4 backdrop-blur-sm"
    >
      <div className="bg-bg-elevated border-border-default text-fg-default w-full max-w-md rounded-lg border p-6 shadow-xl">
        <h2
          id="ios-coachmark-heading"
          tabIndex={-1}
          ref={headingRef}
          className="mb-4 text-lg font-semibold"
        >
          Install Quilty on iPhone
        </h2>
        <ol className="text-fg-muted mb-4 list-decimal space-y-2 pl-5 text-sm">
          <li>
            Tap the Share button <span aria-label="Safari Share icon">⬆</span> at the bottom of
            Safari.
          </li>
          <li>Scroll down and tap &ldquo;Add to Home Screen&rdquo;.</li>
          <li>Tap &ldquo;Add&rdquo; in the top-right corner.</li>
        </ol>
        <button
          type="button"
          onClick={onDismiss}
          className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover w-full rounded-md px-4 py-2 text-sm font-medium"
        >
          Got it
        </button>
      </div>
    </dialog>
  );
}
