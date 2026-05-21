/**
 * Next.js Metadata helpers per D158.
 *
 * Producing the metadata objects through typed builders means the
 * favicon family + apple-touch-icon + OG image stay in a single source
 * of truth — the manifest at `apps/web/app/manifest.ts` + the root
 * layout's `metadata` export read the same shape; a missing favicon at
 * one site can't drift from the other.
 *
 * The builders return `Metadata`-compatible fragments — consumers spread
 * them into their `generateMetadata` return value or static `metadata`
 * export.
 */

import type { Metadata } from 'next';

export interface OpenGraphMetadataInput {
  /** Absolute URL of the OG image (1200x630, <=1MB per Facebook + Twitter cards). */
  readonly ogImage: string;
  /** Brand or page name to surface in OG `site_name`. */
  readonly siteName: string;
  /**
   * Page title for OG + Twitter. Recommended 50-60 chars for SERP +
   * social-share rendering. Required because the helper's return value
   * is meant to be spread without additional plumbing — relying on
   * Next.js's top-level title inference creates a footgun when the
   * caller only spreads the builder's fragment.
   */
  readonly title: string;
  /**
   * Page description for OG + Twitter. Recommended 140-160 chars. Same
   * rationale as `title` — the helper is self-contained.
   */
  readonly description: string;
  /** Locale tag (e.g. `en_US`). */
  readonly locale?: string;
  /** Twitter handle (without @) for `twitter:site`. */
  readonly twitterSite?: string;
}

/**
 * Build the `openGraph` + `twitter` portions of a Next.js Metadata
 * object. The OG image is supplied absolute because Next.js's
 * `metadataBase` resolution can vary across runtimes; passing absolute
 * eliminates ambiguity. `title` + `description` are included on the OG
 * + Twitter fragments so a caller who spreads only this builder's
 * return value still emits complete card metadata.
 */
export function buildOpenGraphMetadata(
  input: OpenGraphMetadataInput,
): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: {
      type: 'website',
      siteName: input.siteName,
      title: input.title,
      description: input.description,
      locale: input.locale ?? 'en_US',
      images: [{ url: input.ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [input.ogImage],
      ...(input.twitterSite !== undefined && { site: input.twitterSite }),
    },
  };
}

export interface IconMetadataInput {
  /** URL of the standard favicon (typically `/favicon.ico` served at site root). */
  readonly favicon?: string;
  /** URL of the apple-touch-icon (180x180 PNG at `/apple-touch-icon-180.png`). */
  readonly appleTouchIcon?: string;
  /** URL of the modern shortcut icon (typically `/icon.png` or `/icon.svg`). */
  readonly shortcutIcon?: string;
  /** URL of the SVG mask icon for Safari pinned tabs. */
  readonly maskIcon?: { url: string; color: string };
}

/**
 * Build the `icons` portion of a Next.js Metadata object. Per D158, the
 * favicon family is the single chokepoint for cross-route icon
 * consistency — a missing icon at one site (e.g. apple-touch on the
 * marketing tier) drifts from the portal tier and surfaces as a 404
 * during a Lighthouse PWA audit.
 */
export function buildIconMetadata(input: IconMetadataInput): Pick<Metadata, 'icons'> {
  const icons: NonNullable<Metadata['icons']> = {};
  if (input.favicon !== undefined) {
    icons.icon = input.favicon;
  }
  if (input.shortcutIcon !== undefined) {
    icons.shortcut = input.shortcutIcon;
  }
  if (input.appleTouchIcon !== undefined) {
    icons.apple = input.appleTouchIcon;
  }
  if (input.maskIcon !== undefined) {
    icons.other = [{ rel: 'mask-icon', url: input.maskIcon.url, color: input.maskIcon.color }];
  }
  return { icons };
}
