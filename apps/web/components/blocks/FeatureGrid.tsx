import type { FeatureGridBlock } from '@/lib/content/schemas';

export interface FeatureGridProps {
  block: FeatureGridBlock;
  instanceId: string;
}

export function FeatureGrid({ block, instanceId }: FeatureGridProps) {
  const headingId = block.heading ? `${instanceId}-heading` : undefined;
  // Round-5 a11y reviewer fallback: when no heading, the <section> would
  // be an unnamed landmark (some AT skip it entirely). Provide aria-label
  // fallback so the section is always exposed.
  return (
    <section
      aria-labelledby={headingId}
      aria-label={headingId ? undefined : 'Features'}
      className="mx-auto max-w-6xl px-6 py-16"
    >
      {block.heading ? (
        <h2
          id={headingId}
          className="mb-10 text-center text-3xl font-semibold text-fg-default"
        >
          {block.heading}
        </h2>
      ) : null}
      <ul className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {block.items.map((item) => (
          <li key={item.heading} className="rounded-lg border border-border-default p-6">
            <h3 className="text-lg font-semibold text-fg-default">{item.heading}</h3>
            <p className="mt-2 text-sm text-fg-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
