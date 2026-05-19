import Link from 'next/link';
import type { HeroBlock } from '@/lib/content/schemas';

export interface HeroProps {
  block: HeroBlock;
  instanceId: string;
}

export function Hero({ block, instanceId }: HeroProps) {
  const headingId = `${instanceId}-heading`;
  return (
    <section aria-labelledby={headingId} className="mx-auto max-w-4xl px-6 py-24 text-center">
      <h1
        id={headingId}
        className="text-fg-default text-balance text-5xl font-semibold tracking-tight"
      >
        {block.heading}
      </h1>
      {block.subheading ? <p className="text-fg-muted mt-6 text-lg">{block.subheading}</p> : null}
      {block.primaryCta || block.secondaryCta ? (
        <div className="mt-10 flex items-center justify-center gap-3">
          {block.primaryCta ? (
            <Link
              href={block.primaryCta.href}
              className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover flex min-h-11 items-center rounded-md px-5"
            >
              {block.primaryCta.label}
            </Link>
          ) : null}
          {block.secondaryCta ? (
            <Link
              href={block.secondaryCta.href}
              className="border-border-default text-fg-default hover:bg-bg-elevated flex min-h-11 items-center rounded-md border px-5"
            >
              {block.secondaryCta.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
