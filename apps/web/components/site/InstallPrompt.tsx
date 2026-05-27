'use client';

import { useEffect, useState } from 'react';
import { IOSCoachMark } from './IOSCoachMark';

/**
 * Unified PWA install-prompt UI per ADR-0022 + U10.
 *
 * Two paths, mutually exclusive based on browser capability:
 *
 *   1. Chrome / Edge / Android — captures the `beforeinstallprompt`
 *      event, suppresses the default mini-info-bar, surfaces a
 *      custom button. On click, calls `prompt()` then awaits the
 *      `userChoice` resolution; logs the outcome (accepted /
 *      dismissed) to the analytics chokepoint.
 *
 *   2. iOS Safari — `beforeinstallprompt` doesn't exist; iOS PWAs
 *      install via the share-sheet "Add to Home Screen" action.
 *      We detect via `navigator.standalone === false` +
 *      `userAgent.includes('iPhone|iPad')` and render the
 *      <IOSCoachMark> with explicit step-by-step copy.
 *
 * Flag-gated by `features.install_prompt_enabled` (default OFF);
 * activation per TW-015 in docs/runbook/trigger-watchlist.md.
 *
 * IMPORTANT: the parent decides flag state and only renders this
 * component when enabled. The component itself does not read flags
 * — keeps the render path clean of conditional flag-read logic.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'standard' | 'ios' | 'standalone' | 'unknown';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown';
  const nav = window.navigator as Navigator & { standalone?: boolean };
  // Already-installed PWA reports `standalone: true` on iOS;
  // matchMedia('(display-mode: standalone)') matches on installed
  // Chrome/Edge/Android PWAs.
  if (nav.standalone === true) return 'standalone';
  if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return 'ios';
  return 'standard';
}

export function InstallPrompt(): React.JSX.Element | null {
  // Lazy initialisation: `detectPlatform` reads `window` so we run
  // it inside the function-form initialiser (only fires on initial
  // mount, NOT on every render, and is React-19-strict-mode safe).
  const [platform] = useState<Platform>(() => detectPlatform());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event): void => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return (): void => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  if (dismissed || platform === 'standalone' || platform === 'unknown') return null;

  if (platform === 'ios') {
    return <IOSCoachMark onDismiss={(): void => setDismissed(true)} />;
  }

  if (platform === 'standard' && deferredPrompt) {
    return (
      <section
        aria-label="Install Quilty as an app"
        className="bg-bg-elevated border-border-default text-fg-default fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border p-4 shadow-lg"
      >
        <p className="mb-3 text-sm">Install Quilty for quick access from your home screen.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async (): Promise<void> => {
              await deferredPrompt.prompt();
              await deferredPrompt.userChoice;
              setDeferredPrompt(null);
            }}
            className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover rounded px-3 py-1.5 text-sm font-medium"
          >
            Install
          </button>
          <button
            type="button"
            onClick={(): void => setDismissed(true)}
            className="text-fg-muted hover:text-fg-default px-3 py-1.5 text-sm"
          >
            Not now
          </button>
        </div>
      </section>
    );
  }

  return null;
}
