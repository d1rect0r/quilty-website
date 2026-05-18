import Link from 'next/link';

/**
 * Secondary sidebar for complex portal sub-screens (U1 hybrid pattern).
 * Wraps children with a left-rail navigation when a sub-screen has its
 * own depth — e.g., /account/security (passkeys, TOTP, backup codes,
 * sessions) or /account/subscription (plan, payment, invoices, cancel).
 *
 * Real content + active-route highlighting + mobile collapse land in M5
 * with the portal v0 work. M1 ships the structural shell.
 */

export interface PortalSidebarProps {
  title: string;
  sections: ReadonlyArray<{ label: string; href: string }>;
  children: React.ReactNode;
}

export function PortalSidebar({ title, sections, children }: PortalSidebarProps) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[14rem_1fr]">
      {/* The `<nav>` itself is the landmark — no wrapping `<aside>` needed.
          Round-5 SEO/a11y cross-check flagged the prior double-landmark
          (aside + nested labeled nav) as redundant for AT users. */}
      <nav aria-label={title}>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-default">
          {title}
        </h2>
        <ul className="space-y-1 text-sm text-fg-muted">
          {sections.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="flex min-h-11 items-center rounded-md px-3 hover:bg-bg-elevated hover:text-fg-default"
              >
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div>{children}</div>
    </div>
  );
}
