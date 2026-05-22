'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Client-only sidebar link list for PortalSidebar. Carries
 * `aria-current="page"` on the active entry per WCAG 4.1.2 + 1.3.1.
 * The `sections` prop is the same shape PortalSidebar accepts so the
 * server component above stays decorative-only.
 */

export interface PortalSidebarLinksProps {
  readonly sections: readonly { label: string; href: string }[];
}

export function PortalSidebarLinks({ sections }: PortalSidebarLinksProps) {
  const pathname = usePathname();
  return (
    <ul className="text-fg-muted space-y-1 text-sm">
      {sections.map((section) => {
        const isCurrent = pathname === section.href;
        return (
          <li key={section.href}>
            <Link
              href={section.href}
              aria-current={isCurrent ? 'page' : undefined}
              className={`hover:bg-bg-elevated hover:text-fg-default flex min-h-11 items-center rounded-md px-3 ${
                isCurrent ? 'bg-bg-elevated text-fg-default font-medium' : ''
              }`}
            >
              {section.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
