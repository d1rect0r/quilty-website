import type { ValuePropBlock } from '@/lib/content/schemas';

export interface ValuePropProps {
  block: ValuePropBlock;
  instanceId: string;
}

export function ValueProp({ block, instanceId }: ValuePropProps) {
  const headingId = `${instanceId}-heading`;
  return (
    <article aria-labelledby={headingId} className="mx-auto max-w-2xl px-6 py-16">
      <h2 id={headingId} className="text-3xl font-semibold text-fg-default">
        {block.heading}
      </h2>
      <p className="mt-4 text-fg-muted">{block.body}</p>
    </article>
  );
}
