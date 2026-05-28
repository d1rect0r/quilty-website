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
 * Accessibility (revised post Phase-A D4-B5):
 *   - `<dialog>` element opened via `.showModal()` — gets the
 *     browser-native focus trap, automatic Escape key dismissal,
 *     and inert-background semantics. Skipping `showModal()` in
 *     favour of the `open` attribute would render the element
 *     non-modal: Tab would escape into background content even
 *     with `aria-modal="true"` (the attribute is an ARIA hint to
 *     screen readers only, NOT a browser focus-trap directive).
 *   - Heading is focused on open so VoiceOver / NVDA announce
 *     the dialog's accessible name immediately.
 *   - Color contrast inherits the design-token cascade (light AND
 *     dark mode covered via `--color-bg-elevated` / `--color-fg-default`).
 *
 * iOS 26 share-sheet location:
 *   - iOS 26 (released 2025) moved the Share button BEHIND a
 *     `•••` More menu in the navigation bar; the bottom-bar Share
 *     icon is no longer the canonical entry point. The copy below
 *     references both surfaces so users on iOS 25 and earlier
 *     still recognise the icon.
 */

export function IOSCoachMark({ onDismiss }: { onDismiss: () => void }): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // `.showModal()` is the only way to get the browser's native
    // focus-trap + inert-background semantics; the `open` attribute
    // alone produces a non-modal dialog that Tab can escape from.
    if (!dialog.open) dialog.showModal();
    // The browser handles Escape natively on a modal <dialog> via
    // the `cancel` event; route that to the React dismiss callback.
    const onCancel = (e: Event): void => {
      e.preventDefault();
      onDismiss();
    };
    dialog.addEventListener('cancel', onCancel);
    return (): void => {
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
    };
  }, [onDismiss]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="ios-coachmark-heading"
      className="bg-bg-overlay fixed inset-0 z-50 m-0 flex max-h-screen max-w-full items-end justify-center border-none p-4 backdrop-blur-sm"
    >
      <div className="bg-bg-elevated border-border-default text-fg-default w-full max-w-md rounded-lg border p-6 shadow-xl">
        <h2 id="ios-coachmark-heading" className="mb-4 text-lg font-semibold">
          Install Quilty on iPhone
        </h2>
        <ol className="text-fg-muted mb-4 list-decimal space-y-2 pl-5 text-sm">
          <li>
            Tap the <strong>•••</strong> More menu (or the bottom-bar{' '}
            <span aria-hidden="true">⬆</span> Share button on older iOS) in Safari.
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
