/**
 * CSP-coherent Sentry DSN host gate (shared by client + server + edge init).
 *
 * The portal CSP `connect-src` only allows the pinned
 * `o<orgId>.ingest.us.sentry.io` subdomain (per the csp-builder
 * `pinnedSentryHostOrNull` policy). If a DSN points at a non-pinned or
 * non-US host:
 *   - on the client, every SDK POST is CSP-blocked and emits a
 *     violation report on every transport attempt — a runaway loop;
 *   - on the server/edge, a misconfigured non-US DSN would route error
 *     payloads to the wrong data-residency region.
 *
 * Returning `false` skips `Sentry.init` entirely, so a misconfigured DSN
 * no-ops instead of leaking traffic. This module is intentionally SDK-free
 * (pure URL parsing) so the client critical-path gate can call it without
 * pulling the Sentry SDK into the first-load runtime.
 */
export function isSentryDsnCspCoherent(dsn: string | undefined): boolean {
  if (typeof dsn !== 'string' || dsn.trim().length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  // Same shape the CSP pin enforces server-side.
  return /^o[0-9]+\.ingest\.us\.sentry\.io$/.test(parsed.hostname);
}

/**
 * Resolve the Sentry `environment` tag (shared by client + server + edge
 * init). An explicit `NEXT_PUBLIC_SENTRY_ENVIRONMENT` always wins; otherwise
 * derive it from `NODE_ENV` so a production deploy that forgets to set the
 * var still tags events `production` rather than the misleading
 * `development` (which would silence production alerting rules keyed on the
 * environment name). SDK-free so the client gate stays off the first-load
 * critical path.
 */
export function resolveSentryEnvironment(): string {
  const explicit = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit;
  }
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}
