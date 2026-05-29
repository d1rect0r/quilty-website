import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

/**
 * Dev-only error-boundary trigger. Visiting `/dev/boom` synchronously
 * throws during render so the Playwright a11y spec can exercise
 * `app/error.tsx` against a deterministic boundary mount.
 *
 * Gated by `NODE_ENV !== 'production'` so the route serves 404 in
 * prod regardless of misconfiguration — never ship a synchronous-
 * throw route to a live deploy. The `QUILTY_TEST_BOOM_ENABLED=1`
 * escape hatch lets Playwright run against `pnpm start` (production
 * build) without breaking the dev-only invariant: the env var is set
 * only inside the CI Playwright job + local test runs, never in any
 * deployable image. The check passes when EITHER the build is non-
 * production OR the explicit test env is set; deployable builds set
 * neither so the route returns 404.
 */

// Explicit metadata-tier `noindex, nofollow` on top of the
// `X-Robots-Tag` response header (proxy.ts) and the robots.txt
// `Disallow: /dev/` entry. A misconfigured build that ships
// NODE_ENV=development cannot leak this route into a SERP.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Force dynamic rendering — the prerender pass would otherwise execute
// the `throw new Error(...)` during build whenever the gate is open
// (e.g., when `QUILTY_TEST_BOOM_ENABLED=1` is set in CI) and exit
// the entire build with a prerender error. Dynamic = request-time
// only, so the gate is evaluated when Playwright (or a misconfigured
// scrape) hits the URL, never at build time.
export const dynamic = 'force-dynamic';

export default function BoomPage(): never {
  const isDevBuild = process.env.NODE_ENV !== 'production';
  const testEnabled = process.env['QUILTY_TEST_BOOM_ENABLED'] === '1';
  if (!isDevBuild && !testEnabled) {
    // Explicit `return` so a future Next.js change to `notFound()`'s
    // return type (today `never`, conceivable future `void`) surfaces
    // here as a type error, not at every implicit-never call site.
    return notFound();
  }
  throw new Error('dev:boom — deliberate error-boundary trigger');
}
