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
  sections: readonly { label: string; href: string }[];
  children: React.ReactNode;
}

export function PortalSidebar({ title, sections, children }: PortalSidebarProps) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[14rem_1fr]">
      {/* The `<nav>` itself is the landmark — no wrapping `<aside>` needed.
          Round-5 SEO/a11y cross-check flagged the prior double-landmark
          (aside + nested labeled nav) as redundant for AT users.

          The sidebar title renders as a styled `<span>` (presentational
          only). The page's `<h1>` lives in the page route file — emitting
          an `<h2>` here before the page's `<h1>` mounts would invert the
          heading hierarchy (Round-5 final-QA HIGH a11y finding). The
          `<nav aria-label>` is what AT users hear; the visual label is
          decorative reinforcement. */}
      <nav aria-label={title}>
        <span
          aria-hidden="true"
          className="text-fg-default mb-3 block text-xs font-semibold uppercase tracking-wider"
        >
          {title}
        </span>
        <ul className="text-fg-muted space-y-1 text-sm">
          {sections.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="hover:bg-bg-elevated hover:text-fg-default flex min-h-11 items-center rounded-md px-3"
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
