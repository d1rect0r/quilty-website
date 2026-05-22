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

const SUBSCRIPTION_SECTIONS = [
  { label: 'Overview', href: '/en/account/subscription' },
  { label: 'Plan', href: '/en/account/subscription#plan' },
  { label: 'Payment method', href: '/en/account/subscription#payment' },
  { label: 'Invoices', href: '/en/account/subscription#invoices' },
  { label: 'Cancel', href: '/en/account/subscription#cancel' },
] as const;

export default function AccountSubscriptionPage() {
  return (
    <PortalSidebar title="Subscription" sections={SUBSCRIPTION_SECTIONS}>
      <h1 className="text-fg-default text-3xl font-semibold">Subscription</h1>
      <p className="text-fg-muted mt-4">
        Stripe Customer Portal (hosted redirect per D44) + RevenueCat IAP routing copy + plan-switch
        + cancel flow all land at the subscription activation. URL is reserved.
      </p>
    </PortalSidebar>
  );
}
