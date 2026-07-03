/**
 * Expected-origin resolution for CSRF origin checks (OWASP: the most secure
 * source of the target origin is server configuration, never Host /
 * X-Forwarded-Host inference).
 *
 * One canonical URL drives it: `NEXT_PUBLIC_SITE_URL` — the same value behind
 * metadataBase / canonical links / sitemap — so the expected origin cannot
 * drift from the origin the site actually serves on (two env vars encoding
 * the same fact is drift-by-construction). `QUILTY_SITE_ORIGIN` survives ONLY
 * as the preview-stage escape hatch: preview deploys receive the apex
 * NEXT_PUBLIC_SITE_URL (canonical-correct for a noindex stage) while serving
 * on a raw CloudFront URL, so their submits need the explicit override.
 *
 * Fail-closed: no silent localhost fallback. `NEXT_PUBLIC_SITE_URL` is the
 * one env var lib/env.ts REQUIRES (`z.string().url()`) at build + boot, so
 * the throw below is unreachable in any running server — it exists so a
 * future validation bypass surfaces as a loud 500, never as a CSRF origin
 * check quietly pinned to localhost accepting nothing (or, worse, a dev
 * value accepting the wrong origin).
 *
 * Reads process.env at call time (not the cached t3-env object) for the same
 * reason lib/fail-closed.ts does: the value must be stubable in tests and
 * agree across composition roots.
 */
export function readExpectedOrigin(): string {
  const override = process.env['QUILTY_SITE_ORIGIN'];
  const source = override && override.length > 0 ? override : process.env['NEXT_PUBLIC_SITE_URL'];
  if (!source || source.length === 0) {
    throw new Error(
      'Expected origin unavailable: neither QUILTY_SITE_ORIGIN (preview override) nor ' +
        'NEXT_PUBLIC_SITE_URL is set. NEXT_PUBLIC_SITE_URL is required by lib/env.ts — ' +
        'this indicates a validation bypass. CSRF origin checks fail closed.',
    );
  }
  // `new URL()` throws on a malformed value — also fail-closed. `.origin`
  // normalizes away any path/trailing-slash so the CSRF comparison is
  // exact-origin, not string-prefix.
  return new URL(source).origin;
}
