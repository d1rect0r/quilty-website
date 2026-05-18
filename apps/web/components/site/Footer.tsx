import { Suspense } from 'react';
import Link from 'next/link';
import { GpcHonoredIndicator } from '@/components/legal/GpcHonoredIndicator';

/**
 * Marketing-tier site footer. Includes the CCPA §7025(c)(6) GPC honored
 * indicator (D62) when the request's `Sec-GPC: 1` header was detected at
 * the edge. M2 fills in real legal copy + "Your Privacy Choices" link.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      role="contentinfo"
      className="border-t border-border-default bg-bg-elevated"
    >
      <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-fg-muted">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <FooterColumn
            title="Product"
            links={[
              { label: 'Features', href: '/en/features' },
              { label: 'Pricing', href: '/en/pricing' },
              { label: 'Science', href: '/en/science' },
              { label: 'For business', href: '/en/for-business' },
            ]}
          />
          <FooterColumn
            title="Company"
            links={[
              { label: 'About', href: '/en/about' },
              { label: 'Contact', href: '/en/contact' },
              { label: 'Customers', href: '/en/customers' },
              { label: 'Help', href: '/en/help' },
            ]}
          />
          <FooterColumn
            title="Legal"
            links={[
              { label: 'Privacy', href: '/en/legal/privacy' },
              { label: 'Terms', href: '/en/legal/terms' },
              { label: 'Cookies', href: '/en/legal/cookies' },
              { label: 'Your Privacy Choices', href: '/en/legal/privacy#gpc' },
            ]}
          />
          <FooterColumn
            title="Account"
            links={[
              { label: 'Sign in', href: '/en/account' },
              { label: 'Subscription', href: '/en/account/subscription' },
              { label: 'Data export', href: '/en/account/data' },
              { label: 'Delete account', href: '/en/account/delete' },
            ]}
          />
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-border-default pt-6 md:flex-row md:items-center">
          <p>© {year} Quilty Inc. All rights reserved.</p>
          {/*
            Wrapped in Suspense so the surrounding marketing layout stays
            statically renderable. GpcHonoredIndicator awaits headers() — a
            dynamic API — and without this boundary it would force every
            marketing page off CloudFront cache (Round-5 typescript-reviewer
            finding).
          */}
          <Suspense fallback={null}>
            <GpcHonoredIndicator />
          </Suspense>
        </div>
      </div>
    </footer>
  );
}

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumnProps {
  title: string;
  links: FooterLink[];
}

function FooterColumn({ title, links }: FooterColumnProps) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-default">
        {title}
      </h2>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="hover:text-fg-default">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
