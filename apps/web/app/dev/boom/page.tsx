import { notFound } from 'next/navigation';

/**
 * Dev-only error-boundary trigger. Visiting `/dev/boom` synchronously
 * throws during render so the Playwright a11y spec can exercise
 * `app/error.tsx` against a deterministic boundary mount.
 *
 * Gated by `NODE_ENV !== 'production'` so the route serves 404 in
 * prod regardless of misconfiguration — never ship a synchronous-
 * throw route to a live deploy.
 */
export default function BoomPage(): never {
  if (process.env.NODE_ENV === 'production') {
    // Explicit `return` so a future Next.js change to `notFound()`'s
    // return type (today `never`, conceivable future `void`) surfaces
    // here as a type error, not at every implicit-never call site.
    return notFound();
  }
  throw new Error('dev:boom — deliberate error-boundary trigger');
}
