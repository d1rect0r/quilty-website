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
  /**
   * Descriptive alt text for the OG/Twitter image. Required because
   * social platforms surface this string to assistive technology when
   * the share card renders in feeds (WCAG 1.1.1 in the AT-rendered
   * social context). Omit ONLY for purely decorative share images —
   * which is not the placement we ship on this site.
   */
  readonly ogImageAlt: string;
  /**
   * IANA media type for the OG image (`image/jpeg`, `image/png`, ...).
   * Facebook's parser falls back to content-type sniffing when this is
   * absent, which is unreliable through CDN rewrites that strip
   * extensions. LinkedIn's card validator warns when missing.
   */
  readonly ogImageType: string;
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
  /**
   * Canonical absolute URL for the page emitting these tags. Next.js
   * does NOT promote `alternates.canonical` into `openGraph.url`
   * automatically — callers must thread it through explicitly so social
   * crawlers don't fall back to the request URL (often a tracker-
   * decorated variant).
   */
  readonly url?: string;
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
      images: [
        {
          url: input.ogImage,
          width: 1200,
          height: 630,
          alt: input.ogImageAlt,
          type: input.ogImageType,
        },
      ],
      ...(input.url !== undefined && { url: input.url }),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [{ url: input.ogImage, alt: input.ogImageAlt }],
      ...(input.twitterSite !== undefined && { site: input.twitterSite }),
    },
  };
}

export interface IconAsset {
  /** Absolute or root-relative URL of the icon file. */
  readonly url: string;
  /** IANA media type — `image/x-icon`, `image/svg+xml`, `image/png`, etc. */
  readonly type: string;
  /** Sizes attribute (e.g. `"any"` for SVG, `"180x180"` for apple-touch). */
  readonly sizes?: string;
}

export interface IconMetadataInput {
  /**
   * Browser-tab icon stack rendered as `<link rel="icon">`. Order
   * matters — modern browsers prefer the LAST viable match, so put
   * `image/x-icon` first and `image/svg+xml` last so SVG wins on
   * browsers that support it while legacy clients still see the ICO.
   */
  readonly icons: readonly IconAsset[];
  /**
   * iOS home-screen icon — rendered as `<link rel="apple-touch-icon">`.
   * Apple Springboard requires an opaque, full-bleed 180×180 PNG.
   */
  readonly appleTouchIcon?: string;
}

/**
 * Build the `icons` portion of a Next.js Metadata object. Per D158, the
 * favicon family is the single chokepoint for cross-route icon
 * consistency — a missing icon at one site (e.g. apple-touch on the
 * marketing tier) drifts from the portal tier and surfaces as a 404
 * during a Lighthouse PWA audit.
 *
 * Emits `<link rel="icon">` per item (NOT the legacy `rel="shortcut
 * icon"` form, which is non-standard in HTML Living Standard). Each
 * entry carries `type` so browsers don't need to content-sniff the
 * extension.
 */
export function buildIconMetadata(input: IconMetadataInput): Pick<Metadata, 'icons'> {
  const icons: NonNullable<Metadata['icons']> = {
    icon: input.icons.map((asset) => ({
      url: asset.url,
      type: asset.type,
      ...(asset.sizes !== undefined && { sizes: asset.sizes }),
    })),
  };
  if (input.appleTouchIcon !== undefined) {
    icons.apple = input.appleTouchIcon;
  }
  return { icons };
}
