'use client';

/**
 * Cookie consent banner — D97 native build (NOT vendor CMP).
 *
 * Tri-button anatomy per CCPA §7004(a)(2) no-dark-pattern asymmetry:
 * Accept All / Reject All / Customize all render with equal visual
 * weight. CNIL Sept 2025 enforcement sweep (€325M Google + €150M
 * Shein) turned on button-parity violations.
 *
 * A11y contract (D163 + WAI region guidance):
 *   - `<section>` with `aria-label="Cookie consent"` — `<section>` +
 *     an accessible name implies `role="region"` per HTML-AAM; the
 *     explicit role attribute is omitted to avoid the redundant-role
 *     advisory from axe-core / Equal Access scanners.
 *   - No focus trap (region, NOT modal). WAI guidance: cookie banner
 *     is informational content the user opts into engaging with;
 *     trapping focus is a dark pattern.
 *   - Focus moves into banner on mount via the Accept-All button's
 *     auto-focus ref. Escape dismisses with default-deny state +
 *     returns focus to the `<main>` landmark after the persist
 *     transition resolves.
 *   - `aria-describedby` → short policy-link paragraph so screen
 *     readers announce the purpose before the button list.
 *   - Bottom-fixed positioning with `env(safe-area-inset-bottom)` iOS
 *     padding for home-indicator safety (D163).
 *   - `role="status"` live region surfaces persist-write failures so a
 *     screen-reader user hears them (WCAG 4.1.3 Status Messages).
 *   - Per-category checkboxes use 44×44 CSS-px touch targets (WCAG
 *     2.5.5 AA) wrapped in `<label>` so the full row width is the
 *     hit area.
 *
 * The component is a Client Component because the per-category toggle
 * state is purely client UX (it commits via Server Action). The
 * server-side decision of whether to render the banner at all (cookie
 * absent + Sec-GPC not detected) lives in the apps/web wrapper.
 */

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import { DEFAULT_DENY_STATE } from '../domain/cookie-taxonomy';
import type { ConsentCategoryState } from '../domain/cookie-taxonomy';

/**
 * Accept-all state: every gated category granted. Essential stays
 * `true` by type contract.
 */
const ACCEPT_ALL: ConsentCategoryState = {
  essential: true,
  functional: true,
  analytics: true,
  marketing: true,
  personalization: true,
};

export interface BannerProps {
  /**
   * Server Action that persists the user's choice. apps/web wires it
   * to write the `__Host-quilty_consent` cookie via `cookies().set()`.
   * The action must throw if the write fails so the UI can surface
   * the error in the inline `role="status"` live region.
   */
  readonly persistConsent: (state: ConsentCategoryState) => Promise<void>;
  /**
   * Locale-prefixed href for the cookie policy page. apps/web threads
   * the active locale through so the Banner stays runtime-agnostic
   * (it cannot import next-intl from a package-level Client Component).
   */
  readonly cookiePolicyHref: string;
  /**
   * Locale-prefixed href for the privacy-choices DSAR landing page.
   */
  readonly privacyChoicesHref: string;
}

export function Banner({
  persistConsent,
  cookiePolicyHref,
  privacyChoicesHref,
}: BannerProps): React.JSX.Element {
  const policyId = useId();
  const customizePanelId = `${policyId}-customize`;
  const statusId = `${policyId}-status`;
  const acceptRef = useRef<HTMLButtonElement | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const [draft, setDraft] = useState<ConsentCategoryState>(DEFAULT_DENY_STATE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Track in-flight commits in a ref so the Escape handler can short-
  // circuit without re-binding on every isPending flip (which would
  // tear down + recreate the keydown listener on every render).
  const isPendingRef = useRef(isPending);
  useEffect(() => {
    isPendingRef.current = isPending;
  }, [isPending]);

  // Focus the primary "Accept all" button on mount so keyboard users
  // can act immediately. We do NOT trap focus — Escape lets the user
  // back out with default-deny state preserved.
  useEffect(() => {
    acceptRef.current?.focus();
  }, []);

  const commit = useCallback(
    (state: ConsentCategoryState): void => {
      setErrorMessage(null);
      startTransition(async () => {
        try {
          await persistConsent(state);
        } catch (err) {
          // Surface the failure via the inline role="status" live region
          // so AT users hear it. The Server Action contract requires
          // it to throw on cookie-write failure; render-tree fallback
          // is preserved by keeping the banner mounted.
          setErrorMessage(
            err instanceof Error
              ? `Could not save your choice: ${err.message}. Please try again.`
              : 'Could not save your choice. Please try again.',
          );
        }
      });
    },
    [persistConsent],
  );

  // Escape: dismiss with default-deny state preserved + return focus
  // to <main>. Per WAI region guidance + CCPA §7004(a)(2) — dismissal
  // without an explicit accept defaults to deny (not implicit consent).
  // Guards against double-commit during an in-flight transition via
  // the isPendingRef pattern.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (isPendingRef.current) return;
      event.preventDefault();
      setErrorMessage(null);
      startTransition(async () => {
        try {
          await persistConsent(DEFAULT_DENY_STATE);
          // Defer the focus return until AFTER the Server Action
          // resolves so the banner has fully unmounted on the parent
          // re-render. Falling back to <main> if for some reason the
          // banner is still in the DOM (e.g., a re-render race).
          document.getElementById('main')?.focus();
        } catch (err) {
          setErrorMessage(
            err instanceof Error
              ? `Could not save your choice: ${err.message}. Please try again.`
              : 'Could not save your choice. Please try again.',
          );
        }
      });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [persistConsent]);

  return (
    <section
      aria-label="Cookie consent"
      aria-describedby={policyId}
      className="border-border-default bg-bg-elevated fixed inset-x-0 bottom-0 z-50 border-t shadow-lg"
      // env(safe-area-inset-bottom) keeps the iOS home-indicator + bottom-
      // notch surfaces clear of the action buttons. Falls back to `1rem`
      // on browsers that don't support `env()` (older Safari).
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 pt-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <p id={policyId} className="text-fg-default text-sm">
            We use cookies for essential site function. With your permission, we use additional
            cookies for analytics, marketing, and personalization. Read our{' '}
            <a href={cookiePolicyHref} className="text-fg-default underline underline-offset-2">
              cookie policy
            </a>{' '}
            and{' '}
            <a href={privacyChoicesHref} className="text-fg-default underline underline-offset-2">
              privacy choices
            </a>
            .
          </p>
          {errorMessage !== null ? (
            // <output> carries implicit role="status" + aria-live="polite"
            // per HTML-AAM — jsx-a11y/prefer-tag-over-role prefers the
            // semantic tag over the explicit ARIA role attribute.
            <output id={statusId} className="text-fg-default mt-2 block text-sm">
              {errorMessage}
            </output>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 flex-col gap-2 md:flex-row md:items-center">
          <button
            type="button"
            ref={acceptRef}
            disabled={isPending}
            onClick={() => commit(ACCEPT_ALL)}
            className="border-border-default bg-bg-elevated text-fg-default hover:bg-bg-surface focus-visible:outline-fg-default flex min-h-11 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Accept all
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => commit(DEFAULT_DENY_STATE)}
            className="border-border-default bg-bg-elevated text-fg-default hover:bg-bg-surface focus-visible:outline-fg-default flex min-h-11 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject all
          </button>
          <button
            type="button"
            disabled={isPending}
            aria-expanded={showCustomize}
            // `aria-controls` only when the controlled element is in
            // the DOM (the panel is conditionally rendered below). ARIA
            // 1.2 requires the referenced ID to exist.
            aria-controls={showCustomize ? customizePanelId : undefined}
            onClick={() => setShowCustomize((prev) => !prev)}
            className="border-border-default bg-bg-elevated text-fg-default hover:bg-bg-surface focus-visible:outline-fg-default flex min-h-11 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Customize
          </button>
        </div>
      </div>
      {showCustomize ? (
        <div
          id={customizePanelId}
          className="border-border-default mx-auto mt-4 max-w-6xl border-t px-6 pt-4"
        >
          <ul className="space-y-3">
            <li className="flex items-start justify-between gap-4">
              <div>
                <span className="text-fg-default text-sm font-medium">Essential</span>
                <p className="text-fg-muted text-xs">
                  Required for the site to function (session, security tokens, the consent cookie
                  itself). Always on.
                </p>
              </div>
              <input
                type="checkbox"
                checked
                disabled
                aria-label="Essential cookies (always on)"
                // h-11 w-11 = 44×44 CSS px per WCAG 2.5.5 AA target size.
                className="h-11 w-11"
              />
            </li>
            <CategoryRow
              label="Functional"
              description="Non-essential preferences (theme, locale, accessibility settings)."
              checked={draft.functional}
              onChange={(value) => setDraft((prev) => ({ ...prev, functional: value }))}
            />
            <CategoryRow
              label="Analytics"
              description="Usage measurement to improve the product. Events are sanitized at the boundary."
              checked={draft.analytics}
              onChange={(value) => setDraft((prev) => ({ ...prev, analytics: value }))}
            />
            <CategoryRow
              label="Marketing"
              description="Cross-site advertising and retargeting. Quilty does not currently ship marketing pixels."
              checked={draft.marketing}
              onChange={(value) => setDraft((prev) => ({ ...prev, marketing: value }))}
            />
            <CategoryRow
              label="Personalization"
              description="Behaviour-derived content ranking and recommendations beyond a simple marketing pixel."
              checked={draft.personalization}
              onChange={(value) => setDraft((prev) => ({ ...prev, personalization: value }))}
            />
          </ul>
          <div className="mt-4 flex justify-end pb-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => commit(draft)}
              className="bg-fg-default text-fg-inverse focus-visible:outline-fg-default flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save preferences
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface CategoryRowProps {
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
}

/**
 * Wraps the checkbox in a `<label>` so the full row is the hit area
 * (WCAG 2.5.5 AA) AND the accessible name is the visible label text
 * (WCAG 2.5.3 Label in Name). `aria-describedby` ties the description
 * paragraph to the input via id.
 */
function CategoryRow({
  label,
  description,
  checked,
  onChange,
}: CategoryRowProps): React.JSX.Element {
  const inputId = useId();
  const descriptionId = useId();
  return (
    <li className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={inputId} className="text-fg-default cursor-pointer text-sm font-medium">
          {label}
        </label>
        <p id={descriptionId} className="text-fg-muted text-xs">
          {description}
        </p>
      </div>
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        // aria-label is the AT-announced name (mirrors the visible
        // label text per WCAG 2.5.3 Label in Name); the explicit
        // <label htmlFor> above is the visible+clickable affordance
        // that doubles the hit area.
        aria-label={label}
        aria-describedby={descriptionId}
        // h-11 w-11 = 44×44 CSS px per WCAG 2.5.5 AA target size.
        className="h-11 w-11"
      />
    </li>
  );
}
