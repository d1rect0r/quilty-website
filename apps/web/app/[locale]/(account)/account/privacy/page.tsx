import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Signed-in DSAR self-serve hub (D99).
 *
 * Headspace + BetterHelp peer pattern: a portal surface that ties
 * statutory affordances (export / delete / consent-revoke / profile-
 * edit) to the existing authenticated session. Destructive actions
 * (export, delete) gate behind step-up auth (D54 elevated_until
 * 5-minute window via Cognito `prompt=login`); profile + opt-out
 * actions are session-only.
 *
 * Every action on this page currently renders as a disabled
 * placeholder. The Rust orchestrator (D134 Erase + D135 Export) wires
 * the real call paths at the auth-integration milestone. The
 * Article 21 profiling opt-out will use the in-process ConsentStore
 * port (D87) with a Server Action — the port itself exists; the UI
 * wiring lands when the auth-portal UI activates.
 *
 * Noindex is set via the (account) layout cascade. Per the layout
 * comment's defensive rule, page-level overrides risk silent regression
 * of the noindex protection — so this page exports only `title` and
 * relies on the layout's robots field.
 */

// Title only. The (account) layout sets `robots: { index: false,
// follow: false }` as the cascade baseline; restating it here would
// risk the layout-comment's documented regression vector — a future
// edit to the page-level robots field silently overriding the layout
// noindex. The cascade is the load-bearing protection.
export const metadata: Metadata = {
  title: 'Privacy settings',
};

export default function AccountPrivacyPage() {
  return (
    // <section> without aria-labelledby — nested-region landmarks
    // removed across the (marketing) + (account) clusters.
    <section className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-fg-default text-3xl font-semibold">Privacy settings</h1>

      <p className="text-fg-muted mt-4">
        Exercise your statutory rights here. Most actions are self-serve. Destructive actions
        (export, delete) trigger a re-authentication prompt — you have a five-minute
        elevated-permissions window after re-MFA to confirm.
      </p>

      <h2 className="text-fg-default mt-10 text-xl font-semibold">Access + portability</h2>
      <p className="text-fg-muted mt-3">
        Get a copy of the personal data we hold about you (GDPR Article 15 + Article 20). The export
        is delivered as a structured, machine-readable file via a signed download link valid for 24
        hours.
      </p>
      <div className="mt-4">
        <ExportDataButton />
      </div>

      <h2 className="text-fg-default mt-10 text-xl font-semibold">Correction</h2>
      <p className="text-fg-muted mt-3">
        Edit your profile (GDPR Article 16) from your{' '}
        <Link href="/en/account" className="text-fg-default underline underline-offset-2">
          profile settings
        </Link>
        .
      </p>

      <h2 className="text-fg-default mt-10 text-xl font-semibold">Opt out of profiling</h2>
      <p className="text-fg-muted mt-3">
        Disable personalisation + profiling-based personalisation (GDPR Article 21). This flips your
        consent state immediately + propagates to every analytics surface on next page load.
      </p>
      <div className="mt-4">
        <ProfilingOptOutButton />
      </div>

      <h2 className="text-fg-default mt-10 text-xl font-semibold">Erasure</h2>
      <p className="text-fg-muted mt-3">
        Delete your account (GDPR Article 17, CCPA, WA MHMDA, Quebec Law 25). This is irreversible.
        Some records are retained under the Article 17(3)(b) legal-obligation exception (tax law,
        consent-demonstrability records); these are pseudonymised within 30 days of the request.
      </p>
      <div className="mt-4">
        <Link
          href="/en/account/delete"
          className="border-border-default text-fg-default hover:bg-bg-elevated inline-flex h-11 items-center rounded-md border px-4 text-sm font-medium"
        >
          Continue to account deletion
        </Link>
      </div>

      <h2 className="text-fg-default mt-10 text-xl font-semibold">Need help?</h2>
      <p className="text-fg-muted mt-3">
        See the public summary on{' '}
        <Link
          href="/en/legal/privacy-choices"
          className="text-fg-default underline underline-offset-2"
        >
          privacy choices
        </Link>{' '}
        for the full enumeration of rights + the 45-day response SLA. For escalations email our{' '}
        <strong className="text-fg-default">Privacy Lead</strong> at{' '}
        <a
          href="mailto:privacy@my-quilty.com"
          className="text-fg-default underline underline-offset-2"
        >
          privacy@my-quilty.com
        </a>
        .
      </p>
    </section>
  );
}

// Both buttons render as disabled placeholders until the Rust
// orchestrator (D134 Erase + D135 Export) wires the real call
// paths at the auth-integration milestone. Disabled state carries
// the full inert-control contract: disabled + aria-disabled +
// aria-describedby pointing to status copy explaining WHY.
function ExportDataButton() {
  return (
    <>
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-describedby="export-status"
        className="bg-fg-default text-fg-inverse inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        Export my data
      </button>
      <p id="export-status" className="text-fg-muted mt-2 text-sm">
        Self-serve export activates with the data-orchestrator backend. Email{' '}
        <a
          href="mailto:privacy@my-quilty.com"
          className="text-fg-default underline underline-offset-2"
        >
          privacy@my-quilty.com
        </a>{' '}
        for an export today; we respond within 45 days.
      </p>
    </>
  );
}

function ProfilingOptOutButton() {
  return (
    <>
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-describedby="profiling-status"
        className="border-border-default text-fg-default hover:bg-bg-elevated inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        Opt out of profiling
      </button>
      <p id="profiling-status" className="text-fg-muted mt-2 text-sm">
        The opt-out toggle activates with the consent-portal UI. Today the GPC signal (
        <code className="text-fg-default">Sec-GPC: 1</code>) is honored at the edge and writes a
        force-off consent cookie; enable GPC in your browser to opt out immediately.
      </p>
    </>
  );
}
