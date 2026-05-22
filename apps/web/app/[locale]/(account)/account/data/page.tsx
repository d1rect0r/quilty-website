import type { Metadata } from 'next';

// Explicit `robots` re-statement — DSAR / data-export surfaces
// must never reach a SERP for a HIPAA-aligned product.
export const metadata: Metadata = {
  title: 'Data',
  robots: { index: false, follow: false },
};

export default function AccountDataPage() {
  return (
    <section aria-labelledby="data-heading" className="mx-auto max-w-4xl px-6 py-10">
      <h1 id="data-heading" className="text-fg-default text-3xl font-semibold">
        Your data
      </h1>
      <p className="text-fg-muted mt-4">
        Self-serve data export, account-data summary, and consent-state review will appear here when
        the data-export portal activates.
      </p>
    </section>
  );
}
