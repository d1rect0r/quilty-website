import type { Metadata } from 'next';

// Explicit `robots` re-statement — DSAR / data-export surfaces
// must never reach a SERP for a HIPAA-aligned product.
export const metadata: Metadata = {
  title: 'Data',
  robots: { index: false, follow: false },
};

export default function AccountDataPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-fg-default text-3xl font-semibold">Your data</h1>
      <p className="text-fg-muted mt-4">
        Self-serve data export (DSAR Article 20) + account-data summary + ConsentState review (D63)
        all land at the data-export + DSAR activation. URL is reserved.
      </p>
    </section>
  );
}
