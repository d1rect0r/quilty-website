import { SUPPORT_MAILTO } from '@/lib/site-contacts';
import type { Metadata } from 'next';

/**
 * 503 Service Unavailable (RFC 7231 §6.6.4).
 *
 * Rendered when `MAINTENANCE_MODE=true` env var is set + proxy.ts
 * rewrites a request to `/503`. The maintenance allowlist
 * (`apps/web/lib/edge/maintenance-allowlist.ts`) lets health probes,
 * webhook callbacks, RFC well-known files, and the 503 page itself
 * bypass.
 *
 * No retry button — `Retry-After` (set by proxy.ts at
 * `MAINTENANCE_RETRY_AFTER_SECONDS` default 1 hour) is the canonical
 * signal. Showing a "try again" button would let users hammer the
 * server during the window — bad for both user experience + for the
 * load reduction the maintenance window was declared for.
 *
 * The body cross-links to status.my-quilty.com — the future Instatus
 * Pro status subdomain (reserved per D132). Currently the link
 * 404s; activates at the first incident comm need.
 *
 * `robots: noindex, nofollow` inherited from the (errors) layout
 * cascade. Googlebot guidance: keep 503 windows under 7 days to
 * avoid deindexing risk; the 1-hour default `Retry-After` is well
 * inside that bound.
 */
export const metadata: Metadata = {
  title: 'Maintenance',
};

const STATUS_PAGE_URL = 'https://status.my-quilty.com';

export default function MaintenancePage() {
  return (
    <section
      aria-labelledby="maintenance-heading"
      className="mx-auto max-w-2xl px-6 py-24 text-center"
    >
      <p className="text-fg-muted text-sm font-medium">503</p>
      <h1 id="maintenance-heading" className="text-fg-default mt-2 text-4xl font-semibold">
        We&apos;re down for maintenance
      </h1>
      {/*
        Static prose — content does NOT change after initial render,
        so a live region (role=status / aria-live=polite) would never
        fire its observer. Plain <p> is the semantically correct
        element + reads cleanly across AT without the "result/output"
        announcement noise <output> carries in older JAWS + Orca.
      */}
      <p className="text-fg-muted mt-4">
        We&apos;re briefly offline for scheduled maintenance. Your account is safe — sign-in,
        subscription, and clinical data continue to operate normally on the mobile product.
        We&apos;ll be back shortly. Check the status page for live updates.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {/*
          External link to the future status subdomain (Instatus Pro
          reserved per D132). Uses <a> + rel="noopener noreferrer"
          because next/link's typedRoutes won't accept an external
          host + we want the link to work even when the apex domain
          is in the maintenance window.
        */}
        <a
          href={STATUS_PAGE_URL}
          rel="noopener noreferrer"
          className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4"
        >
          Live status
        </a>
        <a
          href={`mailto:${SUPPORT_MAILTO}?subject=${encodeURIComponent('Maintenance window inquiry')}`}
          className="text-fg-muted hover:text-fg-default inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4 text-sm underline"
        >
          Email support
        </a>
      </div>
    </section>
  );
}
