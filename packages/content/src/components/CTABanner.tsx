import Link from 'next/link';
import type { CTABannerBlock } from '../schemas.js';

export interface CTABannerProps {
  block: CTABannerBlock;
  instanceId: string;
}

export function CTABanner({ block, instanceId }: CTABannerProps) {
  const headingId = `${instanceId}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="bg-bg-elevated mx-auto my-16 max-w-6xl rounded-lg px-6 py-12 text-center"
    >
      <h2 id={headingId} className="text-fg-default text-3xl font-semibold">
        {block.heading}
      </h2>
      {block.body ? <p className="text-fg-muted mt-4">{block.body}</p> : null}
      <Link
        href={block.primaryCta.href}
        className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover mt-8 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-6"
      >
        {block.primaryCta.label}
      </Link>
    </section>
  );
}
