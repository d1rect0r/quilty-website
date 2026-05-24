import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Portal-tier 403 (Next.js 16.2 `forbidden()` helper).
 *
 * Invoked when a portal Server Component / Server Action calls
 * `forbidden()` from `next/navigation`. The helper requires
 * `experimental.authInterrupts: true` in next.config.ts; the file is
 * a scaffold ready to activate at the auth-integration milestone (M6),
 * when permission-gated portal sub-screens start firing the helper
 * for users whose session lacks the required scope/role.
 *
 * Distinguished from `unauthorized.tsx` (signed-out → must sign in)
 * by the existence of a session — the user IS authenticated but lacks
 * the permission for THIS resource. AT users hear "Forbidden" as the
 * h1 vs "Sign in required" on the unauthorized page; the distinction
 * is meaningful for compliance audit + UX.
 *
 * `robots: noindex, nofollow` inherited from the (account) layout
 * cascade — no re-declaration here.
 */
export const metadata: Metadata = {
  title: 'Forbidden',
};

export default function AccountForbidden() {
  return (
    <section
      aria-labelledby="account-forbidden-heading"
      className="mx-auto max-w-2xl px-6 py-16 text-center"
    >
      <p className="text-danger-fg text-sm font-medium">403</p>
      <h1 id="account-forbidden-heading" className="text-fg-default mt-2 text-3xl font-semibold">
        Forbidden
      </h1>
      <p className="text-fg-muted mt-4">
        You don&apos;t have permission to view this page. If you believe this is a mistake, contact
        support.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/en/account"
          className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4"
        >
          Back to profile
        </Link>
      </div>
    </section>
  );
}
