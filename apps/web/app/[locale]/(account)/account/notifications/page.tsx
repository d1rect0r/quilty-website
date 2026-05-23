import type { Metadata } from 'next';

// Explicit `robots` re-statement — notification preferences are
// session-aware portal surfaces that must never reach a SERP.
export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

export default function AccountNotificationsPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-fg-default text-3xl font-semibold">Notifications</h1>
      <p className="text-fg-muted mt-4">
        Email and push notification preferences will appear here when the notification portal
        activates.
      </p>
    </section>
  );
}
