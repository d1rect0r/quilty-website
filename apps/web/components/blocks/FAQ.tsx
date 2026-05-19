import { JsonLd } from '@/components/seo/JsonLd';
import { buildFAQPageJsonLd } from '@/lib/seo/schemas';
import type { FAQBlock } from '@/lib/content/schemas';

export interface FAQProps {
  block: FAQBlock;
  instanceId: string;
  /**
   * Absolute URL of the page this FAQ block renders on. Threaded through
   * BlockRenderer from each page's route file so the emitted FAQPage
   * JSON-LD can include `@id` + `isPartOf` cross-references back to the
   * containing WebPage node (Round-5 final-QA SEO M4).
   */
  pageUrl: string;
}

export function FAQ({ block, instanceId, pageUrl }: FAQProps) {
  const headingId = block.heading ? `${instanceId}-heading` : undefined;
  // Round-5 a11y reviewer fallback: unnamed <section> is skipped by some
  // AT. Provide aria-label fallback when no heading.
  return (
    <section
      aria-labelledby={headingId}
      aria-label={headingId ? undefined : 'Frequently asked questions'}
      className="mx-auto max-w-3xl px-6 py-16"
    >
      <JsonLd data={buildFAQPageJsonLd({ pageUrl, entries: block.entries })} />
      {block.heading ? (
        <h2 id={headingId} className="text-fg-default mb-8 text-3xl font-semibold">
          {block.heading}
        </h2>
      ) : null}
      <dl className="space-y-6">
        {/* Keys use the (instanceId, position) tuple — stable across content
            edits, unique on the page even if multiple FAQ blocks exist
            (Round-5 typescript-reviewer MEDIUM: prior content-based keys
            broke when an entry's question was edited). */}
        {block.entries.map((entry, idx) => (
          <div key={`${instanceId}-entry-${idx}`}>
            <dt className="text-fg-default text-lg font-semibold">{entry.question}</dt>
            <dd className="text-fg-muted mt-2">{entry.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
