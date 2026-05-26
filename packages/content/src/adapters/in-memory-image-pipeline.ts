/**
 * In-memory ImagePipeline adapter for tests + the no-image-resolver
 * baseline.
 *
 * Returns the input verbatim, leaving omitted dimensions as `undefined`
 * (NOT `0`) so a downstream `<NextImage>` renderer doesn't receive
 * width=0/height=0 and throw — the OptimizedImage component enforces
 * positive dimensions in its sized variant at the type layer.
 *
 * Exposed via the `@quilty/content/testing` subpath barrel; consumers
 * MUST NOT import directly from this file at runtime — the testing
 * barrel is the ONLY entry point.
 */

import type { ImageInput, ImagePipeline, ResolvedImage } from '../ports/image-pipeline';

export function makeInMemoryImagePipeline(): ImagePipeline {
  return {
    resolve(input: ImageInput): ResolvedImage {
      return {
        src: input.src,
        width: input.width,
        height: input.height,
        alt: input.alt,
        preload: input.preload ?? false,
        quality: input.quality,
        sizes: input.sizes,
        className: input.className,
      };
    },
  };
}
