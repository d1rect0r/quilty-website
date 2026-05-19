import { Suspense } from 'react';
import Link from 'next/link';
import { GpcHonoredIndicator } from '@/components/legal/GpcHonoredIndicator';

/**
 * Marketing-tier site footer. Includes the CCPA §7025(c)(6) GPC honored
 * indicator (D62) when the request's `Sec-GPC: 1` header was detected at
 * the edge. M2 fills in real legal copy + "Your Privacy Choices" link.
 *
 * `COPYRIGHT_YEAR` is evaluated at module load (build time on the server)
 * not at render time. This keeps marketing pages statically renderable —
 * `new Date()` in the render path would force dynamic rendering and lose
 * CloudFront caching. The copyright year ticks once a year via Renovate
 * rebuilding the site, which is acceptable for a copyright footer.
 */
const COPYRIGHT_YEAR = new Date().getFullYear();

export function Footer() {
  return (
    <footer role="contentinfo" className="border-border-default bg-bg-elevated border-t">
      <div className="text-fg-muted mx-auto max-w-6xl px-6 py-10 text-sm">
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

        <div className="border-border-default mt-10 flex flex-col items-start justify-between gap-4 border-t pt-6 md:flex-row md:items-center">
          <p>© {COPYRIGHT_YEAR} Quilty Inc. All rights reserved.</p>
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
      <h2 className="text-fg-default mb-3 text-xs font-semibold uppercase tracking-wider">
        {title}
      </h2>
      {/* WCAG 2.5.5 AA Target Size: every footer link gets min-h-11 (44px)
          per Round-5 final-QA HIGH finding. The visual padding on the row
          aligns with marketing chrome touch-target discipline. */}
      <ul className="space-y-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="hover:text-fg-default -mx-2 flex min-h-11 items-center rounded-md px-2"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
