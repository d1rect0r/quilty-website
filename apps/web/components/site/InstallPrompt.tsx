'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { IOSCoachMark } from './IOSCoachMark';

/**
 * Unified PWA install-prompt UI per ADR-0022 + U10.
 *
 * Two paths, mutually exclusive based on browser capability:
 *
 *   1. Chrome / Edge / Android — captures the `beforeinstallprompt`
 *      event, suppresses the default mini-info-bar, surfaces a
 *      custom button. On click, calls `prompt()` then awaits the
 *      `userChoice` resolution. The outcome is intentionally NOT
 *      forwarded to analytics at this commit — analytics on the
 *      install decision is consent-gated (D35), and the consent-
 *      check chokepoint at `wrapAnalytics()` will land BEFORE the
 *      install-prompt activation trigger (TW-015) fires.
 *
 *   2. iOS Safari — `beforeinstallprompt` doesn't exist; iOS PWAs
 *      install via the share-sheet "Add to Home Screen" action.
 *      We detect via `navigator.standalone === false` + a
 *      `userAgent.includes('iPhone|iPad')` check and render the
 *      <IOSCoachMark> with explicit step-by-step copy. Updated
 *      post Phase-A D4-E4 for the iOS 26 share-sheet move under
 *      the `•••` More menu.
 *
 * Dismissal persistence (Phase-A D4-E5): once a user dismisses, we
 * persist a 30-day TTL in localStorage so a page reload doesn't
 * resurface the prompt. The persisted record is a single
 * `quilty:install-prompt-dismissed-at:<isoString>` key — no PII,
 * no analytics event.
 *
 * Hydration safety (Phase-A D4-B6): `platform` initialises as
 * `null` and a `useEffect` mutates it on the client only. Initial
 * SSR + first client render produce identical empty output;
 * detection runs after mount so no hydration mismatch fires under
 * React 19 strict mode.
 *
 * Flag-gated by `features.install_prompt_enabled` (default OFF);
 * activation per TW-015 in docs/runbook/trigger-watchlist.md. The
 * parent decides flag state and only renders this component when
 * enabled — keeps the render path clean of conditional flag-read
 * logic.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'standard' | 'ios' | 'standalone';

const DISMISSAL_STORAGE_KEY = 'quilty:install-prompt-dismissed-at';
const DISMISSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function detectPlatform(): Platform | null {
  if (typeof window === 'undefined') return null;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return 'standalone';
  if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return 'ios';
  return 'standard';
}

function readDismissedAt(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DISMISSAL_STORAGE_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return null;
    if (Date.now() - ts > DISMISSAL_TTL_MS) {
      window.localStorage.removeItem(DISMISSAL_STORAGE_KEY);
      return null;
    }
    return ts;
  } catch {
    // localStorage can throw in private-mode Safari + cross-origin
    // iframe contexts. Treat any failure as "not dismissed" — the
    // prompt's job is best-effort UX, not load-bearing UX.
    return null;
  }
}

function persistDismissal(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISSAL_STORAGE_KEY, String(Date.now()));
  } catch {
    /* see readDismissedAt — failure is non-fatal */
  }
}

function isBeforeInstallPromptEvent(e: Event): e is BeforeInstallPromptEvent {
  return 'prompt' in e && 'userChoice' in e;
}

// `useSyncExternalStore` is React 19's canonical pattern for
// rendering browser-API-derived state without hydration mismatches:
// the server snapshot returns `null` and the client snapshot returns
// the live value. React reconciles by re-rendering with the client
// snapshot AFTER hydration completes, so the initial markup matches
// across server/client. No setState-in-effect required.
const subscribePlatform: () => () => void = () => () => undefined;

// Cross-tab dismissal sync: when another tab writes the dismissal
// key, the `storage` event fires on this tab; we forward the
// notification so useSyncExternalStore re-reads localStorage.
const subscribeDismissed = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (e: StorageEvent): void => {
    if (e.key === null || e.key === DISMISSAL_STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
};

export function InstallPrompt(): React.JSX.Element | null {
  const platform = useSyncExternalStore(subscribePlatform, detectPlatform, () => null);
  const dismissedSnapshot = useSyncExternalStore(
    subscribeDismissed,
    () => readDismissedAt() !== null,
    () => false,
  );
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissedLocal, setDismissedLocal] = useState(false);
  const dismissed = dismissedSnapshot || dismissedLocal;

  useEffect(() => {
    const handler = (e: Event): void => {
      e.preventDefault();
      if (isBeforeInstallPromptEvent(e)) setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return (): void => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  function handleDismiss(): void {
    persistDismissal();
    setDismissedLocal(true);
  }

  async function handleInstallClick(): Promise<void> {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'dismissed') {
        // Native dismiss = same UX outcome as our Not-now button.
        handleDismiss();
      }
    } catch {
      // `prompt()` rejects in narrow cases — already shown, called
      // outside a user-gesture window, browser-specific dismissal
      // races. Treat any rejection as a soft dismiss so the prompt
      // doesn't loop. The catch is intentionally silent because no
      // observability chokepoint accepts client-island errors
      // at the install-prompt flag-OFF stage; the activation flip
      // (TW-015) will introduce a consent-gated telemetry pass.
    } finally {
      setDeferredPrompt(null);
    }
  }

  if (platform === null || dismissed || platform === 'standalone') return null;

  if (platform === 'ios') {
    return <IOSCoachMark onDismiss={handleDismiss} />;
  }

  if (platform === 'standard' && deferredPrompt) {
    return (
      <section
        aria-labelledby="install-prompt-heading"
        className="bg-bg-elevated border-border-default text-fg-default fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border p-4 shadow-lg"
      >
        <h2 id="install-prompt-heading" className="mb-2 text-sm font-semibold">
          Install Quilty as an app
        </h2>
        <p className="text-fg-muted mb-3 text-sm">
          Install Quilty for quick access from your home screen.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleInstallClick}
            className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover min-h-[44px] rounded px-4 text-sm font-medium"
          >
            Install
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-fg-muted hover:text-fg-default min-h-[44px] px-4 text-sm"
          >
            Not now
          </button>
        </div>
      </section>
    );
  }

  return null;
}
