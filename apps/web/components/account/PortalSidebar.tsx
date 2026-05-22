import { PortalSidebarLinks } from './PortalSidebarLinks';

/**
 * Secondary sidebar for complex portal sub-screens (U1 hybrid pattern).
 * Wraps children with a left-rail navigation when a sub-screen has its
 * own depth — e.g., /account/security (passkeys, TOTP, backup codes,
 * sessions) or /account/subscription (plan, payment, invoices, cancel).
 *
 * The link list is a Client Component (`PortalSidebarLinks`) — same
 * reason as PortalNavLinks: `aria-current="page"` needs the live
 * pathname. The decorative shell stays server-rendered.
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
          SEO/a11y cross-check flagged the prior double-landmark
          (aside + nested labeled nav) as redundant for AT users.

          The sidebar title renders as a styled `<span>` (presentational
          only). The page's `<h1>` lives in the page route file — emitting
          an `<h2>` here before the page's `<h1>` mounts would invert the
          heading hierarchy. The `<nav aria-label>` is what AT users hear;
          the visual label is decorative reinforcement. */}
      <nav aria-label={title}>
        <span
          aria-hidden="true"
          className="text-fg-default mb-3 block text-xs font-semibold uppercase tracking-wider"
        >
          {title}
        </span>
        <PortalSidebarLinks sections={sections} />
      </nav>
      <div>{children}</div>
    </div>
  );
}
