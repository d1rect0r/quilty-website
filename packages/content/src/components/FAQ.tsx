import { buildFAQPageJsonLd, JsonLd } from '@quilty/seo';
import type { FAQBlock } from '../schemas.js';

export interface FAQProps {
  block: FAQBlock;
  instanceId: string;
  /**
   * Absolute URL of the page this FAQ block renders on. Threaded through
   * BlockRenderer from each page's route file so the emitted FAQPage
   * JSON-LD can include `@id` + `isPartOf` cross-references back to the
   * containing WebPage node (see @quilty/seo `buildFAQPageJsonLd` for
   * the cross-reference contract).
   */
  pageUrl: string;
}

export function FAQ({ block, instanceId, pageUrl }: FAQProps) {
  const headingId = block.heading ? `${instanceId}-heading` : undefined;
  // An unnamed <section> is skipped by some assistive technology; provide
  // an aria-label fallback when no heading is rendered (WCAG 1.3.1).
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
        {/* Keys use the (instanceId, position) tuple. The block schema
            does not yet carry stable per-entry IDs; the tuple is unique
            on the page even when multiple FAQ blocks exist, and stable
            for the lifetime of a single content build. When the block
            schema gains a stable `id` field, switch to `key={entry.id}`. */}
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
