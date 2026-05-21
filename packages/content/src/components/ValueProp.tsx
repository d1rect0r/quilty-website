import type { ValuePropBlock } from '../schemas.js';

export interface ValuePropProps {
  block: ValuePropBlock;
  instanceId: string;
}

export function ValueProp({ block, instanceId }: ValuePropProps) {
  const headingId = `${instanceId}-heading`;
  return (
    <article aria-labelledby={headingId} className="mx-auto max-w-2xl px-6 py-16">
      <h2 id={headingId} className="text-fg-default text-3xl font-semibold">
        {block.heading}
      </h2>
      <p className="text-fg-muted mt-4">{block.body}</p>
    </article>
  );
}
