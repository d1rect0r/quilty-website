import { OptimizedImage } from './OptimizedImage';
import type { TestimonialQuoteBlock } from '../schemas';
import type { ImagePipeline } from '../ports/image-pipeline';

export interface TestimonialQuoteProps {
  block: TestimonialQuoteBlock;
  // `instanceId` accepted for API consistency across all block components
  // (BlockRenderer threads it uniformly to enable unique aria-labelledby
  // IDs when multiple blocks of the same type appear on one page). This
  // component uses native <figure>/<blockquote>/<figcaption> semantics
  // where <figcaption> implicitly captions the <figure> — no separate
  // aria-labelledby needed.
  instanceId: string;
  /**
   * Optional ImagePipeline. When omitted, the avatar is skipped even
   * if the block carries one — preserves backward compatibility for
   * call sites that haven't wired the composition root's image
   * pipeline through yet. When present, the avatar renders in a small
   * circular crop next to the attribution.
   */
  imagePipeline?: ImagePipeline;
}

export function TestimonialQuote({ block, imagePipeline }: TestimonialQuoteProps) {
  return (
    <figure className="mx-auto max-w-2xl px-6 py-16">
      <blockquote className="text-fg-default text-2xl font-medium">
        <p>&ldquo;{block.quote}&rdquo;</p>
      </blockquote>
      <figcaption className="text-fg-muted mt-4 flex items-center gap-3 text-sm">
        {block.avatar && imagePipeline ? (
          <span className="inline-block h-10 w-10 overflow-hidden rounded-full">
            <OptimizedImage
              pipeline={imagePipeline}
              src={block.avatar.src}
              alt={block.avatar.alt}
              width={block.avatar.width ?? 40}
              height={block.avatar.height ?? 40}
            />
          </span>
        ) : null}
        <span>
          <span className="text-fg-default font-semibold">{block.attribution}</span>
          {block.role ? (
            <span>
              {' — '}
              {block.role}
            </span>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
}
