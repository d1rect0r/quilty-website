import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Portal-tier 401 (Next.js 16.2 `unauthorized()` helper).
 *
 * Invoked when a portal Server Component / Server Action calls
 * `unauthorized()` from `next/navigation`. The helper requires
 * `experimental.authInterrupts: true` in next.config.ts; the file is
 * a scaffold ready to activate at the auth-integration milestone,
 * when session-expiration / not-signed-in conditions inside portal
 * routes start firing the helper.
 *
 * Distinguished from `forbidden.tsx` (signed-in + lacks scope) by the
 * absence of a session — the user is NOT authenticated and must sign
 * in first. AT users hear "Sign in required" as the h1; the
 * distinction matters for both UX clarity + compliance audit.
 *
 * Once Cognito sign-in lands (auth-integration milestone), the
 * primary CTA's href moves from the placeholder `/en/account` to
 * the Cognito Managed Login URL.
 *
 * `robots: noindex, nofollow` inherited from the (account) layout
 * cascade — no re-declaration here.
 */
export const metadata: Metadata = {
  title: 'Sign in required',
};

export default function AccountUnauthorized() {
  return (
    <section
      aria-labelledby="account-unauthorized-heading"
      className="mx-auto max-w-2xl px-6 py-16 text-center"
    >
      <p className="text-fg-muted text-sm font-medium">401</p>
      <h1 id="account-unauthorized-heading" className="text-fg-default mt-2 text-3xl font-semibold">
        Sign in required
      </h1>
      <p className="text-fg-muted mt-4">
        You need to sign in to view this page. Your session may have expired.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/en/account"
          className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4"
        >
          Sign in
        </Link>
        <Link
          href="/en"
          className="text-fg-default border-border-default hover:bg-bg-surface inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-4"
        >
          Go home
        </Link>
      </div>
    </section>
  );
}
