import Link from 'next/link';
import { OptimizedImage } from './OptimizedImage';
import type { HeroBlock } from '../schemas';
import type { ImagePipeline } from '../ports/image-pipeline';

export interface HeroProps {
  block: HeroBlock;
  instanceId: string;
  /**
   * Optional ImagePipeline. When omitted, the hero renders without
   * the image even if the block has one — keeps existing call sites
   * compositional. When present, `preload: true` flows to the
   * underlying renderer because hero images are always above-the-fold
   * (LCP candidate).
   */
  imagePipeline?: ImagePipeline;
}

export function Hero({ block, instanceId, imagePipeline }: HeroProps) {
  const headingId = `${instanceId}-heading`;
  return (
    <section aria-labelledby={headingId} className="mx-auto max-w-4xl px-6 py-24 text-center">
      {block.image && imagePipeline ? (
        <div className="mb-10 flex justify-center">
          <OptimizedImage
            pipeline={imagePipeline}
            src={block.image.src}
            alt={block.image.alt}
            width={block.image.width ?? 800}
            height={block.image.height ?? 450}
            preload
          />
        </div>
      ) : null}
      <h1
        id={headingId}
        className="text-fg-default text-balance text-5xl font-semibold tracking-tight"
      >
        {block.heading}
      </h1>
      {block.subheading ? <p className="text-fg-muted mt-6 text-lg">{block.subheading}</p> : null}
      {block.primaryCta || block.secondaryCta ? (
        <div className="mt-10 flex items-center justify-center gap-3">
          {block.primaryCta ? (
            <Link
              href={block.primaryCta.href}
              className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-5"
            >
              {block.primaryCta.label}
            </Link>
          ) : null}
          {block.secondaryCta ? (
            <Link
              href={block.secondaryCta.href}
              className="border-border-default text-fg-default hover:bg-bg-elevated inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-5"
            >
              {block.secondaryCta.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
