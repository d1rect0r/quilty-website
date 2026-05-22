import type { Metadata } from 'next';

// Explicit `robots` re-statement rather than layout-cascade only:
// a "Delete your account" surface appearing in a SERP is a HIPAA-
// alignment + UX exposure for a consumer mental-health product.
export const metadata: Metadata = {
  title: 'Delete account',
  robots: { index: false, follow: false },
};

export default function AccountDeletePage() {
  return (
    <section aria-labelledby="delete-heading" className="mx-auto max-w-3xl px-6 py-10">
      <h1 id="delete-heading" className="text-fg-default text-3xl font-semibold">
        Delete your account
      </h1>
      <p className="text-fg-muted mt-4">
        Self-serve account deletion (GDPR Article 17 erasure) will appear here when the account
        portal activates. Re-authentication via a step-up prompt gates the destructive action — a
        re-MFA challenge is required within a 5-minute elevated-permissions window before deletion
        can be confirmed.
      </p>
      <p className="text-fg-muted mt-4">
        The URL is reserved per the Google Play account-deletion policy + CCPA &ldquo;no dark
        patterns&rdquo; enforcement guidance.
      </p>
    </section>
  );
}
