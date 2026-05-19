import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile',
};

export default function AccountHomePage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-fg-default text-3xl font-semibold">Profile</h1>
      <p className="text-fg-muted mt-4">
        Authenticated profile UI lands in M5 (static) + M6 (real auth + Rust backend). M1 reserves
        the URL + the route-group + the JSON-LD-suppressing robots metadata.
      </p>
    </section>
  );
}
