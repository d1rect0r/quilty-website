import Link from 'next/link';
import { SUPPORT_MAILTO } from '@/lib/site-contacts';
import type { Metadata } from 'next';

/**
 * 451 Unavailable For Legal Reasons (RFC 7725).
 *
 * Rendered when proxy.ts rewrites a request to `/451` because the
 * resource matches the 451 allowlist (geographic legal blocks,
 * DMCA takedowns, GDPR-mandated regional content removal, court
 * orders). Allowlist is empty today; reserved for the first
 * jurisdiction-specific block.
 *
 * RFC 7725 §3 specifies a `Link: <...>; rel="blocked-by"` header
 * pointing at the ENTITY IMPLEMENTING THE BLOCK (us / our CDN),
 * NOT the legal authority mandating it. proxy.ts sets that header
 * on the response; this page body identifies the authority +
 * provides the appeal contact.
 *
 * The IETF 99 hackathon found the RFC's own example (`spqr.example.org`)
 * misleads implementers into pointing the Link at the authority —
 * that's wrong + creates a circular reference. The blocking entity
 * is the one to contact about the implementation; the authority is
 * named in the body for users who want to challenge the block at
 * its source.
 *
 * `robots: noindex, nofollow` inherited from the (errors) layout
 * cascade.
 */
export const metadata: Metadata = {
  title: 'Unavailable for legal reasons',
};

export default function LegalBlockPage() {
  return (
    <section
      aria-labelledby="legal-block-heading"
      className="mx-auto max-w-2xl px-6 py-24 text-center"
    >
      <p className="text-fg-muted text-sm font-medium">451</p>
      <h1 id="legal-block-heading" className="text-fg-default mt-2 text-4xl font-semibold">
        Unavailable for legal reasons
      </h1>
      <p className="text-fg-muted mt-4">
        This content is not available at your current location due to legal restrictions. Where the
        block originates from a specific takedown or jurisdictional requirement, the appropriate
        authority is identified in our response policy.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/en"
          className="text-fg-default border-border-default hover:bg-bg-surface inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-4"
        >
          Go home
        </Link>
        <a
          href={`mailto:${SUPPORT_MAILTO}?subject=${encodeURIComponent('451 block inquiry')}`}
          className="text-fg-muted hover:text-fg-default inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-4 text-sm underline"
        >
          Contact support
        </a>
      </div>
    </section>
  );
}
