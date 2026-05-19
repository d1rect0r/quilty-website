import type { Block } from '@/lib/content/schemas';
import { Hero } from '@/components/blocks/Hero';
import { ValueProp } from '@/components/blocks/ValueProp';
import { FeatureGrid } from '@/components/blocks/FeatureGrid';
import { FAQ } from '@/components/blocks/FAQ';
import { TestimonialQuote } from '@/components/blocks/TestimonialQuote';
import { CTABanner } from '@/components/blocks/CTABanner';

/**
 * Single dispatch point for every typed block. Exhaustive switch on the
 * discriminated `type` field — `never` check on default catches the case
 * where a new block type is added to the schema without a corresponding
 * case here at compile time.
 *
 * `instanceId` is threaded from `<BlocksRenderer>` (block index per page)
 * so each block can derive unique HTML IDs for `aria-labelledby` linkage.
 * Without this, multiple blocks of the same type on one page would emit
 * duplicate IDs — broken a11y semantics + invalid HTML (Round-5 reviewer
 * HIGH finding).
 *
 * Adding a new block:
 *   1. Add schema in lib/content/schemas.ts
 *   2. Add component in this directory (accept `block` + `instanceId` props)
 *   3. Add case here — TypeScript fails the build until done
 */
export interface BlockRendererProps {
  block: Block;
  instanceId: string;
  /**
   * Absolute URL of the page these blocks render on. Threaded into blocks
   * that emit JSON-LD with `isPartOf` cross-references (FAQ today; future
   * blocks may need it too).
   */
  pageUrl: string;
}

export function BlockRenderer({ block, instanceId, pageUrl }: BlockRendererProps) {
  switch (block.type) {
    case 'Hero':
      return <Hero block={block} instanceId={instanceId} />;
    case 'ValueProp':
      return <ValueProp block={block} instanceId={instanceId} />;
    case 'FeatureGrid':
      return <FeatureGrid block={block} instanceId={instanceId} />;
    case 'FAQ':
      return <FAQ block={block} instanceId={instanceId} pageUrl={pageUrl} />;
    case 'TestimonialQuote':
      return <TestimonialQuote block={block} instanceId={instanceId} />;
    case 'CTABanner':
      return <CTABanner block={block} instanceId={instanceId} />;
    default: {
      // Exhaustiveness check — if a new block type is added to the
      // discriminated union without a case here, TypeScript will fail
      // with: Type 'X' is not assignable to type 'never'.
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

/**
 * Renders an array of blocks in document order. Each block gets a stable
 * positional ID for use in aria-labelledby linkage.
 *
 * The FAQ-block consolidation note (Round-5 SEO reviewer): if a page has
 * multiple FAQ blocks, each currently emits its own FAQPage JSON-LD —
 * Google prefers one consolidated FAQPage per page. The author convention
 * at M1 is "at most one FAQ block per page"; when M4 marketing content
 * grows past this, page-level consolidation belongs in the page route
 * file (collect entries, emit single JSON-LD) not in this renderer.
 */
export interface BlocksRendererProps {
  blocks: readonly Block[];
  /**
   * Absolute URL of the page these blocks render on. Required so FAQ blocks
   * can emit graph-connected JSON-LD with `isPartOf` (Round-5 final-QA
   * SEO M4). Each page route computes this from `NEXT_PUBLIC_SITE_URL` +
   * its own path.
   */
  pageUrl: string;
}

export function BlocksRenderer({ blocks, pageUrl }: BlocksRendererProps) {
  // React keys derive from the (block type, position) tuple — stable
  // across content edits and unique within a page (Round-5 typescript-
  // reviewer MEDIUM). Positional index is the documented Velite + typed-
  // block contract: array order is the page's contract.
  return (
    <>
      {blocks.map((block, idx) => {
        const instanceId = `block-${idx}-${block.type.toLowerCase()}`;
        return (
          <BlockRenderer
            key={instanceId}
            block={block}
            instanceId={instanceId}
            pageUrl={pageUrl}
          />
        );
      })}
    </>
  );
}
