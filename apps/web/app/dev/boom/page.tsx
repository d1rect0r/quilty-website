import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

/**
 * Dev-only error-boundary trigger. Visiting `/dev/boom` synchronously
 * throws during render so the Playwright a11y spec can exercise
 * `app/error.tsx` against a deterministic boundary mount.
 *
 * Gated by `NODE_ENV !== 'production'` so the route serves 404 in
 * prod regardless of misconfiguration — never ship a synchronous-
 * throw route to a live deploy.
 */

// Explicit metadata-tier `noindex, nofollow` on top of the
// `X-Robots-Tag` response header (proxy.ts) and the robots.txt
// `Disallow: /dev/` entry. A misconfigured build that ships
// NODE_ENV=development cannot leak this route into a SERP.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function BoomPage(): never {
  if (process.env.NODE_ENV === 'production') {
    // Explicit `return` so a future Next.js change to `notFound()`'s
    // return type (today `never`, conceivable future `void`) surfaces
    // here as a type error, not at every implicit-never call site.
    return notFound();
  }
  throw new Error('dev:boom — deliberate error-boundary trigger');
}
