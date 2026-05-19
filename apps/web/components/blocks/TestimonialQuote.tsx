import type { TestimonialQuoteBlock } from '@/lib/content/schemas';

export interface TestimonialQuoteProps {
  block: TestimonialQuoteBlock;
  // `instanceId` accepted for API consistency across all block components
  // (BlockRenderer threads it uniformly to enable unique aria-labelledby
  // IDs when multiple blocks of the same type appear on one page). This
  // component uses native <figure>/<blockquote>/<figcaption> semantics
  // where <figcaption> implicitly captions the <figure> — no separate
  // aria-labelledby needed.
  instanceId: string;
}

// avatarUrl + role schema fields are deferred to M3+ design iteration;
// schema accepts them so MDX authors don't see frontmatter rejections,
// but rendering lands when the visual identity is locked.
export function TestimonialQuote({ block }: TestimonialQuoteProps) {
  return (
    <figure className="mx-auto max-w-2xl px-6 py-16">
      <blockquote className="text-fg-default text-2xl font-medium">
        <p>&ldquo;{block.quote}&rdquo;</p>
      </blockquote>
      <figcaption className="text-fg-muted mt-4 text-sm">
        <span className="text-fg-default font-semibold">{block.attribution}</span>
        {block.role ? (
          <span>
            {' — '}
            {block.role}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
