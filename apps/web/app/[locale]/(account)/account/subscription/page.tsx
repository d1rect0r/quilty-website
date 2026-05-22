import { PortalSidebar } from '@/components/account/PortalSidebar';
import type { Metadata } from 'next';

// `robots` repeated explicitly (rather than inherited from the
// account-segment layout) because this route is the second manifest
// shortcut target (`/en/account/subscription` in
// `app/manifest.ts#shortcuts`). Manifest discoverability + the
// commercial sensitivity of a subscription-management page make this
// the highest-risk portal page to leave behind layout-cascade only.
export const metadata: Metadata = {
  title: 'Subscription',
  robots: { index: false, follow: false },
};

// Only the top-level "Overview" link ships at the stub stage. The
// section-anchored entries (Plan / Payment method / Invoices /
// Cancel) land alongside the real subscription-management content —
// adding them now would create fragment links to anchors that do
// not exist in the DOM (WCAG 2.4.4 Link Purpose failure).
const SUBSCRIPTION_SECTIONS = [{ label: 'Overview', href: '/en/account/subscription' }] as const;

export default function AccountSubscriptionPage() {
  return (
    <PortalSidebar title="Subscription" sections={SUBSCRIPTION_SECTIONS}>
      <h1 id="subscription-heading" className="text-fg-default text-3xl font-semibold">
        Subscription
      </h1>
      <p className="text-fg-muted mt-4">
        Plan management, payment-method updates, invoice history, and cancellation flows will appear
        here when the subscription portal activates.
      </p>
    </PortalSidebar>
  );
}
