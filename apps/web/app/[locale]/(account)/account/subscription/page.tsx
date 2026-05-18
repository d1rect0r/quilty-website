import type { Metadata } from 'next';
import { PortalSidebar } from '@/components/account/PortalSidebar';

export const metadata: Metadata = {
  title: 'Subscription',
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
      <h1 className="text-3xl font-semibold text-fg-default">Subscription</h1>
      <p className="mt-4 text-fg-muted">
        Stripe Customer Portal (hosted redirect per D44) + RevenueCat IAP
        routing copy + plan-switch + cancel flow all land in M7. M1 reserves
        the URL.
      </p>
    </PortalSidebar>
  );
}
