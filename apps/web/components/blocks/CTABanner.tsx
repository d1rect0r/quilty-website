import Link from 'next/link';
import type { CTABannerBlock } from '@/lib/content/schemas';

export interface CTABannerProps {
  block: CTABannerBlock;
  instanceId: string;
}

export function CTABanner({ block, instanceId }: CTABannerProps) {
  const headingId = `${instanceId}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto my-16 max-w-6xl rounded-lg bg-bg-elevated px-6 py-12 text-center"
    >
      <h2 id={headingId} className="text-3xl font-semibold text-fg-default">
        {block.heading}
      </h2>
      {block.body ? <p className="mt-4 text-fg-muted">{block.body}</p> : null}
      <Link
        href={block.primaryCta.href}
        className="mt-8 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-accent-primary px-6 text-accent-fg hover:bg-accent-primary-hover"
      >
        {block.primaryCta.label}
      </Link>
    </section>
  );
}
