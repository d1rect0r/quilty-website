import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Notifications',
};

export default function AccountNotificationsPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-fg-default">Notifications</h1>
      <p className="mt-4 text-fg-muted">
        Email + push notification preferences land in M5+ (optional v1+). M1 reserves the URL.
      </p>
    </section>
  );
}
