import type { FeatureGridBlock } from '../schemas';

export interface FeatureGridProps {
  block: FeatureGridBlock;
  instanceId: string;
}

export function FeatureGrid({ block, instanceId }: FeatureGridProps) {
  // `heading` is required by the schema so a FeatureGrid appearing under a
  // page-level Hero h1 emits a proper h1 → h2 → h3 hierarchy (WCAG 1.3.1).
  const headingId = `${instanceId}-heading`;
  return (
    <section aria-labelledby={headingId} className="mx-auto max-w-6xl px-6 py-16">
      <h2 id={headingId} className="text-fg-default mb-10 text-center text-3xl font-semibold">
        {block.heading}
      </h2>
      <ul className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {/* Keys use the (instanceId, position) tuple. The block schema
            does not yet carry stable per-item IDs; the tuple is unique
            on the page and stable across content edits to other fields.
            When the schema gains a stable `id` field, switch to
            `key={item.id}`. */}
        {block.items.map((item, idx) => (
          <li
            key={`${instanceId}-item-${idx}`}
            className="border-border-default rounded-lg border p-6"
          >
            <h3 className="text-fg-default text-lg font-semibold">{item.heading}</h3>
            <p className="text-fg-muted mt-2 text-sm">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
