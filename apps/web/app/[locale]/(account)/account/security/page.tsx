import { PortalSidebar } from '@/components/account/PortalSidebar';
import type { Metadata } from 'next';

// `robots` repeated explicitly (rather than inherited from the
// account-segment layout) because this page is the destination of
// the `/.well-known/change-password` redirect — credential managers
// funnel every user with saved credentials here. Belt-and-suspenders
// against a future metadata edit silently breaking the layout-cascade
// noindex (e.g., adding a canonical key without re-stating robots).
export const metadata: Metadata = {
  title: 'Security',
  robots: { index: false, follow: false },
};

const SECURITY_SECTIONS = [
  { label: 'Overview', href: '/en/account/security' },
  { label: 'Passkeys', href: '/en/account/security#passkeys' },
  { label: 'TOTP', href: '/en/account/security#totp' },
  { label: 'Backup codes', href: '/en/account/security#backup-codes' },
  { label: 'Active sessions', href: '/en/account/security#sessions' },
] as const;

export default function AccountSecurityPage() {
  return (
    <PortalSidebar title="Security" sections={SECURITY_SECTIONS}>
      <h1 className="text-fg-default text-3xl font-semibold">Security</h1>
      <p className="text-fg-muted mt-4">
        Passkeys (D50 Plus tier) + TOTP + email MFA + backup codes (D55) + active-session list (D51
        DynamoDB store) + step-up auth via <code>prompt=login</code> (D54) all land at the
        auth-integration activation.
      </p>
    </PortalSidebar>
  );
}
