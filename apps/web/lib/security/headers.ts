/**
 * Security headers baseline per D33 + D58. Applied via `proxy.ts` to every
 * response. Values verified against Round-5 CSP-security agent's production
 * header captures from Stripe + Sentry + Cal.com + GitHub + Discord + Auth0
 * + Resend + Vercel (2026-05-17).
 *
 * HSTS ramp (D60): M1 ships `max-age=300` (5 minutes) — submitting to
 * hstspreload.org is deferred to M8 launch gate (irreversible 6-12 months).
 * Ramp schedule: 5min → 1day → 1week → 1year → 1yr+includeSubDomains →
 * 2yr+includeSubDomains+preload.
 */

export interface SecurityHeaderEntry {
  key: string;
  value: string;
}

/**
 * HSTS value for the current ramp phase. At M1 we ship a short max-age so
 * a misconfiguration can be rolled back in <5 minutes. M8 launch gate
 * flips this to the preload-eligible value.
 */
export function buildHstsValue(phase: 'm1' | 'm2-m6' | 'm7' | 'm8-prelaunch' | 'm8-launch'): string {
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

export type HstsPhase = 'm1' | 'm2-m6' | 'm7' | 'm8-prelaunch' | 'm8-launch';

const HSTS_PHASES: ReadonlySet<HstsPhase> = new Set([
  'm1',
  'm2-m6',
  'm7',
  'm8-prelaunch',
  'm8-launch',
]);

/**
 * Read the current HSTS ramp phase from env. Server-only env var (not
 * `NEXT_PUBLIC_` — there's no browser exposure). Falls back to `'m1'` if
 * unset or invalid. Round-5 HIPAA/CSP reviewer flagged the prior
 * hardcoded `'m1'` as operationally risky for M2-M8 ramp without code
 * edits + redeploy.
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
 *   - HSTS: phase-driven via HSTS_PHASE env var (default 'm1' = max-age=300)
 *   - X-Content-Type-Options: nosniff (D58)
 *   - X-Frame-Options: DENY + CSP frame-ancestors 'none' (belt-and-suspenders)
 *   - COOP: same-origin-allow-popups (D58 — avoids breaking OAuth pop-ups)
 *   - CORP: same-origin (D58)
 *   - Referrer-Policy: strict-origin-when-cross-origin (D33)
 *   - Permissions-Policy: default-deny camera/microphone/geolocation/payment
 *     (M7 adds payment allowlist for Stripe)
 *
 * Does NOT include the CSP header — caller adds it per-tier via
 * `lib/security/csp.ts`.
 */
export function buildSecurityHeaders(): SecurityHeaderEntry[] {
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
