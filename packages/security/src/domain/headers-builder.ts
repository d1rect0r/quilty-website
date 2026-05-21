/**
 * Security headers baseline per D33 + D58. Applied via `proxy.ts` to every
 * response.
 *
 * HSTS ramp (D60): ships `max-age=300` (5 minutes) at scaffold time —
 * submitting to hstspreload.org is deferred to the M8 launch gate
 * (irreversible 6-12 months). Ramp schedule:
 *   5min → 1day → 1week → 1year → 1yr+includeSubDomains →
 *   2yr+includeSubDomains+preload.
 */

import type { HstsPhase, SecurityHeaderEntry } from '../ports';

const HSTS_PHASES: ReadonlySet<HstsPhase> = new Set([
  'm1',
  'm2-m6',
  'm7',
  'm8-prelaunch',
  'm8-launch',
]);

/**
 * HSTS value for the current ramp phase. The default ships a short
 * max-age so a misconfiguration can be rolled back in <5 minutes. The
 * M8 launch gate flips this to the preload-eligible value.
 */
export function buildHstsValue(phase: HstsPhase): string {
  switch (phase) {
    case 'm1':
      return 'max-age=300';
    case 'm2-m6':
      return 'max-age=86400';
    case 'm7':
      return 'max-age=604800';
    case 'm8-prelaunch':
      return 'max-age=31536000; includeSubDomains';
    case 'm8-launch':
      return 'max-age=63072000; includeSubDomains; preload';
  }
}

/**
 * Read the current HSTS ramp phase from env. Server-only env var (not
 * `NEXT_PUBLIC_` — no browser exposure). Falls back to `'m1'` if unset
 * or invalid.
 */
export function currentHstsPhase(): HstsPhase {
  const raw = process.env.HSTS_PHASE;
  if (raw && HSTS_PHASES.has(raw as HstsPhase)) {
    return raw as HstsPhase;
  }
  return 'm1';
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
 *     (M7 adds payment allowlist for Stripe)
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
