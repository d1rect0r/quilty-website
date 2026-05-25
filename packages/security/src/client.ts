/**
 * Client-safe barrel for @quilty/security.
 *
 * This sub-export carves the client-safe surface from the full
 * package so client bundles (apps/web client components, Sentry
 * client config) don't drag the PHI sanitizer + denylist + value-
 * pattern regex into the browser unless they genuinely need it.
 *
 * What lives here:
 *   - CSP builders (pure string composition)
 *   - Security headers helper
 *   - Redirect validator (URL parsing only)
 *   - Honeypot field name generator (client-side render guidance)
 *   - Form-state token generators that DON'T touch CSRF_SECRET
 *     (the actual `generateCsrfToken` reads CSRF_SECRET at call
 *     time and lives server-side only)
 *
 * What does NOT live here:
 *   - `sanitize`, `sanitizeAsync`, `makeSanitizer` — sanitizer is
 *     for log/error/email sinks (server + edge tiers), not for
 *     browser code paths. A client that needs to redact data
 *     before display should call a server action instead.
 *   - `generateCsrfToken` + `verifyCsrf` — depend on the
 *     CSRF_SECRET env var that server-side handlers hold.
 *   - `assertNoPHI` — runtime guard for server-tier payloads.
 *
 * Consumers:
 *   - `apps/web/components/site/CopyReference.tsx` — no security
 *     imports today, but if it ever needed `isSafeRedirect` it
 *     should use this barrel.
 *   - Future client-side CSP-nonce reader hooks.
 *
 * The full barrel at `index.ts` remains the canonical import for
 * server + edge code (composition.server.ts, composition.edge.ts,
 * Route Handlers, Server Components). The `sentry.client.config.ts`
 * deliberately imports the FULL barrel because its beforeSend hook
 * needs `sanitize`; that's the documented exception.
 */

export type {
  CspOptions,
  HstsPhase,
  RedirectValidator,
  RedirectValidatorOptions,
  SecurityHeaderEntry,
} from './ports';

export type { RedirectValidatorError, Result } from './errors';

export {
  buildMarketingCsp,
  buildPortalCsp,
  generateNonce,
  isPortalRoute,
} from './domain/csp-builder';
export { buildHstsValue, buildSecurityHeaders, currentHstsPhase } from './domain/headers-builder';
export { isSafeRedirect } from './domain/redirect-validator';
export { makeHoneypotField, type HoneypotField } from './domain/honeypot';
export { makeRenderTimestamp } from './domain/time-trap';
