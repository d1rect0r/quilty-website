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

// Only the top-level "Overview" link ships at the stub stage. The
// section-anchored entries (Passkeys / TOTP / Backup codes / Active
// sessions) land alongside the real auth-portal content — adding
// them now would create fragment links to anchors that do not exist
// in the DOM, a WCAG 2.4.4 (Link Purpose) failure.
const SECURITY_SECTIONS = [{ label: 'Overview', href: '/en/account/security' }] as const;

export default function AccountSecurityPage() {
  return (
    <PortalSidebar title="Security" sections={SECURITY_SECTIONS}>
      <h1 id="security-heading" className="text-fg-default text-3xl font-semibold">
        Security
      </h1>
      <p className="text-fg-muted mt-4">
        Passkey management, TOTP setup, backup codes, and active-session review will appear here
        when the auth portal activates.
      </p>
    </PortalSidebar>
  );
}
