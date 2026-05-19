import { headers } from 'next/headers';

/**
 * Visible GPC-honored indicator per CCPA §7025(c)(6) effective 2026-01-01
 * (D62). When the request carried `Sec-GPC: 1`, this renders a non-modal
 * UI indicator confirming the opt-out was honored.
 *
 * Reads the header at the server-component layer — no client JS required.
 * `Sec-GPC` detection at CloudFront Function edge (D63) sets a cookie that
 * the BFF reads; this component mirrors that signal in the UI footprint.
 *
 * Disney $2.75M (Feb 2026) + Ford $375K (Mar 2026) are the enforcement
 * precedent — visible confirmation is now legally required, not optional.
 */
export async function GpcHonoredIndicator() {
  const h = await headers();
  const gpcHeader = h.get('sec-gpc');
  const gpcEnabled = gpcHeader === '1';

  if (!gpcEnabled) {
    return null;
  }

  // `<output>` is the semantic equivalent of role="status" per WHATWG —
  // implies aria-live="polite" without an explicit role attribute. Round-5
  // final-QA jsx-a11y/prefer-tag-over-role surfaced this swap; AT
  // double-announcement issue (NVDA + Firefox) only fires with explicit
  // aria-live, not the implicit one from `<output>`.
  return (
    <output className="text-fg-muted text-xs">
      We&apos;ve received your Global Privacy Control signal and honored your opt-out from the sale
      or sharing of personal information.
    </output>
  );
}
