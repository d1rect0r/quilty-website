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
    <section className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-fg-default text-3xl font-semibold">Delete your account</h1>
      <p className="text-fg-muted mt-4">
        Self-serve account deletion (DSAR Article 17 erasure) lands at the account-portal +
        auth-integration activations (static UX first, then real backend wiring). Step-up auth via{' '}
        <code>prompt=login</code> (D54) gates the destructive action — re-MFA required within the
        5-min elevated window.
      </p>
      <p className="text-fg-muted mt-4">
        URL reserved per Google Play account-deletion policy + CCPA &ldquo;no dark patterns&rdquo;
        enforcement.
      </p>
    </section>
  );
}
