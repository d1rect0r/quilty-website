'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Client-only nav-link list for PortalNav. The list itself + each
 * link's accessible name come from a static config; the per-render
 * pathname comparison is the only piece that needs `usePathname()`,
 * which forces a 'use client' boundary. Keeping the wrapper as
 * narrow as possible minimises the client-bundle delta.
 *
 * `aria-current="page"` on the active link is WCAG 4.1.2 + 1.3.1 —
 * screen-reader users hear "current page" announced on the active
 * entry, distinguishing it from siblings that visually look the same.
 */

interface PortalNavLink {
  readonly href: string;
  readonly label: string;
}

const NAV_LINKS: readonly PortalNavLink[] = [
  { href: '/en/account', label: 'Profile' },
  { href: '/en/account/security', label: 'Security' },
  { href: '/en/account/subscription', label: 'Subscription' },
  { href: '/en/account/data', label: 'Data' },
  { href: '/en/account/notifications', label: 'Notifications' },
];

export function PortalNavLinks() {
  const pathname = usePathname();
  return (
    <ul className="text-fg-muted flex items-center gap-1 text-sm">
      {NAV_LINKS.map(({ href, label }) => {
        const isCurrent = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={isCurrent ? 'page' : undefined}
              className={`hover:text-fg-default flex min-h-11 items-center px-3 ${
                isCurrent ? 'text-fg-default font-medium' : ''
              }`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
