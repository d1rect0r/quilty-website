import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Delete account',
};

export default function AccountDeletePage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-fg-default">Delete your account</h1>
      <p className="mt-4 text-fg-muted">
        Self-serve account deletion (DSAR Article 17 erasure) lands in M5
        (static UX) + M6 (real backend wiring). Step-up auth via{' '}
        <code>prompt=login</code> (D54) gates the destructive action — re-MFA
        required within the 5-min elevated window.
      </p>
      <p className="mt-4 text-fg-muted">
        URL reserved at M1 per Google Play account-deletion policy + CCPA "no
        dark patterns" enforcement.
      </p>
    </section>
  );
}
