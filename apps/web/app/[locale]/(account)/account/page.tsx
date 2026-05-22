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
    <section aria-labelledby="profile-heading" className="mx-auto max-w-4xl px-6 py-10">
      <h1 id="profile-heading" className="text-fg-default text-3xl font-semibold">
        Profile
      </h1>
      <p className="text-fg-muted mt-4">
        Authenticated profile UI will appear here when the account portal activates. The URL, the
        route-group, and the noindex metadata that prevents this surface from reaching a search
        index are all reserved at the scaffold stage.
      </p>
    </section>
  );
}
