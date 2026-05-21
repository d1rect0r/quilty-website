import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Notifications',
};

export default function AccountNotificationsPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-fg-default text-3xl font-semibold">Notifications</h1>
      <p className="text-fg-muted mt-4">
        Email + push notification preferences activate at the notifications milestone. URL is
        reserved.
      </p>
    </section>
  );
}
