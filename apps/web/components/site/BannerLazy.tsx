'use client';

import dynamic from 'next/dynamic';
import type { BannerProps } from '@quilty/consent';

/**
 * Client wrapper that lazy-loads the consent Banner via `next/dynamic`
 * with `ssr: false`. The wrapper itself is a tiny Client Component
 * (~1 KB after tree-shake); the Banner chunk is only fetched when
 * `SiteBanner` renders this wrapper (new users without a consent
 * cookie). Returning users — `SiteBanner` returns `null` for them —
 * never load the Banner JS at all.
 *
 * Why this exists rather than `dynamic()` directly inside `SiteBanner`:
 *   - `dynamic()` with `ssr: false` is only valid inside a Client
 *     Component (Next.js 16 enforces this at the framework boundary).
 *   - `SiteBanner` must stay a Server Component because it reads
 *     `cookies()` + `headers()` + defines the Server Action
 *     `persistConsent` inline.
 *   - The Server Action prop is serializable across the RSC boundary,
 *     so passing it through this Client wrapper is safe.
 *
 * The Banner does not render until hydration completes. For new users
 * the banner appears a tick after first paint — acceptable because the
 * banner is intentionally non-blocking + bottom-fixed + the page
 * remains usable while it loads.
 */

const Banner = dynamic(() => import('@quilty/consent').then((mod) => ({ default: mod.Banner })), {
  ssr: false,
});

export function BannerLazy(props: BannerProps) {
  return <Banner {...props} />;
}
