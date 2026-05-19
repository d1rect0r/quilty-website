import type { FeatureGridBlock } from '@/lib/content/schemas';

export interface FeatureGridProps {
  block: FeatureGridBlock;
  instanceId: string;
}

export function FeatureGrid({ block, instanceId }: FeatureGridProps) {
  // `heading` is required by the schema (Round-5 final-QA a11y MEDIUM —
  // forces a proper h1→h2→h3 hierarchy when this block appears under a
  // page-level Hero h1).
  const headingId = `${instanceId}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-6xl px-6 py-16"
    >
      <h2
        id={headingId}
        className="mb-10 text-center text-3xl font-semibold text-fg-default"
      >
        {block.heading}
      </h2>
      <ul className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {/* Keys use the (instanceId, position) tuple — stable across content
            edits (Round-5 typescript-reviewer MEDIUM: content-based keys
            re-mount components on heading rename). */}
        {block.items.map((item, idx) => (
          <li
            key={`${instanceId}-item-${idx}`}
            className="rounded-lg border border-border-default p-6"
          >
            <h3 className="text-lg font-semibold text-fg-default">{item.heading}</h3>
            <p className="mt-2 text-sm text-fg-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
