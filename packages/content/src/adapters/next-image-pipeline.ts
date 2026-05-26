/**
 * `next/image`-backed ImagePipeline adapter (ADR-0014 Rule 5).
 *
 * This file is the ONLY location in the package allowed to import
 * vendor-bound `next/image` types. Components route through the port;
 * vendor swap is a one-file change to a sibling adapter.
 *
 * The adapter is intentionally a near-pass-through: `next/image`'s
 * runtime is what generates the `srcset` from the `deviceSizes`
 * / `imageSizes` config in `next.config.ts`, and applies the quality
 * transformation at the `_next/image?url=...&q=...&w=...` proxy URL.
 * The adapter therefore does NOT populate `ResolvedImage.srcSet` and
 * does NOT compose the proxy URL itself — those concerns live with
 * the framework. A future URL-template adapter (Cloudflare Images,
 * imgix) WILL produce srcSet directly; that activation path is
 * documented in the ADR-0017 deferral table.
 *
 * `next.config.ts` MUST list every distinct `quality` value passed
 * through this pipeline in its `images.qualities` array — Next.js 16
 * rejects requests for non-allowlisted qualities with HTTP 400.
 */

import type { ImageInput, ImagePipeline, ResolvedImage } from '../ports/image-pipeline';

export interface NextImagePipelineOptions {
  /**
   * Optional default sizes string applied when the input omits one.
   * Useful for site-wide responsive policies (e.g., "100vw" for
   * full-bleed editorial images).
   */
  readonly defaultSizes?: string;
}

export function makeNextImagePipeline(options: NextImagePipelineOptions = {}): ImagePipeline {
  const { defaultSizes } = options;
  return {
    resolve(input: ImageInput): ResolvedImage {
      return {
        src: input.src,
        width: input.width,
        height: input.height,
        alt: input.alt,
        preload: input.preload ?? false,
        quality: input.quality,
        sizes: input.sizes ?? defaultSizes,
        className: input.className,
      };
    },
  };
}
