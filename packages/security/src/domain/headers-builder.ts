/**
 * Security headers baseline per D33 + D58. Applied via `proxy.ts` to every
 * response.
 *
 * HSTS ramp (D60): ships `max-age=300` (5 minutes) at the scaffold
 * phase — submitting to hstspreload.org is the irreversible 6-12-month
 * commitment deferred to the launch gate. Ramp schedule:
 *   5min → 1day → 1week → 1year → 1yr+includeSubDomains →
 *   2yr+includeSubDomains+preload.
 */

import type { HstsPhase, SecurityHeaderEntry } from '../ports';

const HSTS_PHASES: ReadonlySet<HstsPhase> = new Set([
  'scaffold',
  'short-ramp',
  'medium-ramp',
  'long-ramp',
  'preload',
]);

/**
 * HSTS value for the current ramp phase. The default ships a short
 * max-age so a misconfiguration can be rolled back in <5 minutes. The
 * launch gate flips this to the preload-eligible value.
 */
export function buildHstsValue(phase: HstsPhase): string {
  switch (phase) {
    case 'scaffold':
      return 'max-age=300';
    case 'short-ramp':
      return 'max-age=86400';
    case 'medium-ramp':
      return 'max-age=604800';
    case 'long-ramp':
      return 'max-age=31536000; includeSubDomains';
    case 'preload':
      return 'max-age=63072000; includeSubDomains; preload';
  }
}

/**
 * Read the current HSTS ramp phase from env. Server-only env var (not
 * `NEXT_PUBLIC_` — no browser exposure). Falls back to `'scaffold'` if
 * unset or invalid.
 */
export function currentHstsPhase(): HstsPhase {
  const raw = process.env.HSTS_PHASE;
  if (raw && HSTS_PHASES.has(raw as HstsPhase)) {
    return raw as HstsPhase;
  }
  return 'scaffold';
}

/**
 * Full security-headers baseline. Per ADR-0005:
 *
 *   - HSTS: phase-driven via HSTS_PHASE env var (default = max-age=300)
 *   - X-Content-Type-Options: nosniff (D58)
 *   - X-Frame-Options: DENY + CSP frame-ancestors 'none' (belt-and-suspenders)
 *   - COOP: same-origin-allow-popups (D58 — avoids breaking OAuth pop-ups)
 *   - CORP: same-origin (D58)
 *   - Referrer-Policy: strict-origin-when-cross-origin (D33)
 *   - Permissions-Policy: default-deny camera/microphone/geolocation/payment
 *     (Stripe activation adds the payment allowlist)
 *
 * Does NOT include the CSP header — caller adds it per-tier via the
 * CspBuilder port.
 */
export function buildSecurityHeaders(): readonly SecurityHeaderEntry[] {
  return [
    { key: 'Strict-Transport-Security', value: buildHstsValue(currentHstsPhase()) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=()',
    },
  ];
}
