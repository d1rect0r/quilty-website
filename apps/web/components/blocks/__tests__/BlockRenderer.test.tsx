import { describe, it, expect } from 'vitest';
import { BlockSchema, type Block } from '@/lib/content/schemas';

/**
 * BlockRenderer tests focus on the SCHEMA contract — the React renderer
 * itself is exercised by Playwright smoke tests in Commit 8. Here we
 * verify every block type round-trips through Zod validation so MDX
 * frontmatter parses correctly at build time.
 */

describe('BlockSchema discriminated union', () => {
  it('accepts a Hero block', () => {
    const input: Block = {
      type: 'Hero',
      heading: 'Mental health, made personal.',
      subheading: 'A peer-set product.',
    };
    expect(() => BlockSchema.parse(input)).not.toThrow();
  });

  it('accepts a Hero block with both CTAs', () => {
    const input: Block = {
      type: 'Hero',
      heading: 'Welcome',
      primaryCta: { label: 'Get started', href: '/en/signup' },
      secondaryCta: { label: 'Learn more', href: '/en/about' },
    };
    expect(() => BlockSchema.parse(input)).not.toThrow();
  });

  it('accepts a FeatureGrid with multiple items', () => {
    const input: Block = {
      type: 'FeatureGrid',
      heading: 'What you get',
      items: [
        { heading: 'Private', body: 'End-to-end encryption.' },
        { heading: 'Personal', body: 'Tailored to you.' },
        { heading: 'Practical', body: 'Daily 5-minute check-ins.' },
      ],
    };
    expect(() => BlockSchema.parse(input)).not.toThrow();
  });

  it('rejects FeatureGrid with zero items', () => {
    expect(() =>
      BlockSchema.parse({
        type: 'FeatureGrid',
        heading: 'Empty grid',
        items: [],
      }),
    ).toThrow();
  });

  it('rejects FeatureGrid without heading (Round-5 final-QA a11y MEDIUM)', () => {
    expect(() =>
      BlockSchema.parse({
        type: 'FeatureGrid',
        items: [{ heading: 'Lonely item', body: 'No section heading above.' }],
      }),
    ).toThrow();
  });

  it('accepts an FAQ block', () => {
    const input: Block = {
      type: 'FAQ',
      heading: 'Common questions',
      entries: [
        { question: 'Is it private?', answer: 'Yes, by design.' },
        { question: 'How much does it cost?', answer: 'See pricing page.' },
      ],
    };
    expect(() => BlockSchema.parse(input)).not.toThrow();
  });

  it('rejects unknown block types', () => {
    expect(() =>
      BlockSchema.parse({
        type: 'BogusType',
        whatever: 'value',
      }),
    ).toThrow();
  });

  it('accepts a CTABanner block', () => {
    const input: Block = {
      type: 'CTABanner',
      heading: 'Ready to start?',
      primaryCta: { label: 'Sign up', href: '/en/signup' },
    };
    expect(() => BlockSchema.parse(input)).not.toThrow();
  });

  it('accepts a TestimonialQuote block', () => {
    const input: Block = {
      type: 'TestimonialQuote',
      quote: 'Quilty changed my approach to mental health.',
      attribution: 'Jane D.',
      role: 'Customer since 2024',
    };
    expect(() => BlockSchema.parse(input)).not.toThrow();
  });

  it('rejects blocks with missing required fields', () => {
    expect(() =>
      BlockSchema.parse({
        type: 'Hero',
        // missing heading
      }),
    ).toThrow();
  });

  it('accepts a ValueProp block', () => {
    const input: Block = {
      type: 'ValueProp',
      heading: 'Private by design',
      body: 'End-to-end encryption keeps your data with you.',
    };
    expect(() => BlockSchema.parse(input)).not.toThrow();
  });

  it('rejects ValueProp without body', () => {
    expect(() =>
      BlockSchema.parse({
        type: 'ValueProp',
        heading: 'Title only',
        // missing body
      }),
    ).toThrow();
  });

  it('rejects FAQ block with zero entries', () => {
    expect(() =>
      BlockSchema.parse({
        type: 'FAQ',
        entries: [],
      }),
    ).toThrow();
  });

  it('rejects CTABanner without primaryCta', () => {
    expect(() =>
      BlockSchema.parse({
        type: 'CTABanner',
        heading: 'Heading without CTA',
        // missing primaryCta
      }),
    ).toThrow();
  });

  it('rejects TestimonialQuote without attribution', () => {
    expect(() =>
      BlockSchema.parse({
        type: 'TestimonialQuote',
        quote: 'A quote without attribution',
        // missing attribution
      }),
    ).toThrow();
  });
});

describe('PageContentSchema single-Hero invariant', () => {
  it('rejects pages with more than one Hero block (D24 + Round-5 SEO)', async () => {
    const { PageContentSchema } = await import('@/lib/content/schemas');
    const result = PageContentSchema.safeParse({
      title: 'Double Hero',
      description: 'Two heroes is a bug.',
      slug: 'double-hero',
      locale: 'en',
      blocks: [
        { type: 'Hero', heading: 'First H1' },
        { type: 'Hero', heading: 'Second H1 — should be rejected' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts pages with exactly one Hero block', async () => {
    const { PageContentSchema } = await import('@/lib/content/schemas');
    const result = PageContentSchema.safeParse({
      title: 'Single Hero',
      description: 'Just right.',
      slug: 'single-hero',
      locale: 'en',
      blocks: [
        { type: 'Hero', heading: 'Welcome' },
        {
          type: 'ValueProp',
          heading: 'Private',
          body: 'End-to-end encryption.',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
