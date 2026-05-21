import 'server-only';

import { headers } from 'next/headers';
import { detectGpcFromHeaders } from '../domain/gpc-detector.js';

/**
 * Visible GPC-honored indicator per CCPA §7025(c)(6) (effective
 * 2026-01-01) — D62. When the request carried `Sec-GPC: 1`, this
 * renders a non-modal UI confirmation that the opt-out was honored.
 *
 * Server Component — no client JS required. Reads the header at the
 * RSC layer; the CloudFront Function edge worker (D63) sets a mirror
 * cookie at the same boundary for cache-key consistency, and the BFF
 * reads that cookie on subsequent requests.
 *
 * Disney $2.75M (Feb 2026) + Ford $375K (Mar 2026) are the enforcement
 * precedent — visible confirmation is now legally required, not optional.
 *
 * Element choice: plain `<p>`, not `<output>` or `role="status"`. The
 * regulation requires visibility, not screen-reader announcement on
 * every visit. Because the indicator is server-rendered at first paint,
 * the text is persistent informational content — not a status update
 * injected after load — so the implicit `aria-live="polite"` carried
 * by `<output>` / `role="status"` would semantically mis-label it and
 * trigger an unnecessary re-announcement on some NVDA + Firefox
 * combinations (WCAG 4.1.3 applies to dynamic status messages; this is
 * persistent content). The text is captured by AT during the regular
 * reading flow of the footer landmark.
 */
export async function GpcHonoredIndicator(): Promise<React.JSX.Element | null> {
  const h = await headers();
  if (!detectGpcFromHeaders(h)) {
    return null;
  }

  return (
    <p className="text-fg-muted text-xs">
      We&apos;ve received your Global Privacy Control signal and honored your opt-out from the sale
      or sharing of personal information.
    </p>
  );
}
