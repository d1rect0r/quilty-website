import { describe, expect, it } from 'vitest';
import { BlockSchema, PageContentSchema, type Block } from '../schemas.js';

/**
 * BlockRenderer tests focus on the SCHEMA contract — the React renderer
 * itself is exercised by Playwright smoke tests at the marketing
 * extraction commit. Here every block type round-trips through Zod
 * validation so MDX frontmatter parses correctly at build time.
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

  it('rejects FeatureGrid without heading (WCAG 1.3.1 heading hierarchy)', () => {
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

  it('accepts an FAQ block without heading (aria-label section fallback path)', () => {
    // Schema-level acceptance for the headingless FAQ shape. The FAQ
    // component substitutes aria-label="Frequently asked questions" for
    // the section's accessible name (WCAG 1.3.1) when no heading is
    // present; this test guards against an accidental future
    // .optional() removal that would break that AT-labeled path.
    const input: Block = {
      type: 'FAQ',
      entries: [{ question: 'Q?', answer: 'A.' }],
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

describe('PageContentSchema single-Hero invariant (D24 + WCAG 2.4.6)', () => {
  it('rejects pages with more than one Hero block', () => {
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
    // Assert the refine's developer-facing error message — it's the
    // single source of truth for the single-h1 invariant; a future
    // refactor that silently dropped the message would still leave
    // result.success === false but lose the documentation surface.
    expect(result.success ? '' : result.error.issues[0]?.message).toContain(
      'at most one Hero block',
    );
  });

  it('accepts pages with exactly one Hero block', () => {
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
