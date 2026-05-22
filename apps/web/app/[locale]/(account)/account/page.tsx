import type { Metadata } from 'next';

// `robots` repeated explicitly (rather than inherited from the
// account-segment layout) because this route is now a manifest
// shortcut target (`/en/account` is the first entry in
// `app/manifest.ts#shortcuts`). The manifest is publicly fetchable,
// so the shortcut URL is link-graph-reachable for any crawler that
// fetches `/manifest.webmanifest`.
export const metadata: Metadata = {
  title: 'Profile',
  robots: { index: false, follow: false },
};

export default function AccountHomePage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-fg-default text-3xl font-semibold">Profile</h1>
      <p className="text-fg-muted mt-4">
        Authenticated profile UI lands at the account-portal activation; URL reserved the URL + the
        route-group + the JSON-LD-suppressing robots metadata.
      </p>
    </section>
  );
}
