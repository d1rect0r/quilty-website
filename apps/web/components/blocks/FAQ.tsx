import { JsonLd } from '@/components/seo/JsonLd';
import { buildFAQPageJsonLd } from '@/lib/seo/schemas';
import type { FAQBlock } from '@/lib/content/schemas';

export interface FAQProps {
  block: FAQBlock;
  instanceId: string;
}

export function FAQ({ block, instanceId }: FAQProps) {
  const headingId = block.heading ? `${instanceId}-heading` : undefined;
  // Round-5 a11y reviewer fallback: unnamed <section> is skipped by some
  // AT. Provide aria-label fallback when no heading.
  return (
    <section
      aria-labelledby={headingId}
      aria-label={headingId ? undefined : 'Frequently asked questions'}
      className="mx-auto max-w-3xl px-6 py-16"
    >
      <JsonLd data={buildFAQPageJsonLd(block.entries)} />
      {block.heading ? (
        <h2 id={headingId} className="mb-8 text-3xl font-semibold text-fg-default">
          {block.heading}
        </h2>
      ) : null}
      <dl className="space-y-6">
        {block.entries.map((entry) => (
          <div key={entry.question}>
            <dt className="text-lg font-semibold text-fg-default">{entry.question}</dt>
            <dd className="mt-2 text-fg-muted">{entry.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
