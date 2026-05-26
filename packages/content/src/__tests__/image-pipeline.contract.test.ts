/**
 * ImagePipeline contract — every adapter must satisfy these
 * assertions. The next/image adapter + the in-memory fake adapter
 * both ship today; each is exercised against the same parameterised
 * suite so the boundary stays consistent across vendor swap (ADR-0014).
 *
 * `alt` enforcement is verified at the TYPE layer (compile-time
 * rejection of a missing alt prop) — the test cases here exercise
 * the runtime resolution path only.
 */

import { describe, expect, it } from 'vitest';
import { makeNextImagePipeline } from '../index';
import { makeInMemoryImagePipeline } from '../testing/index';
import type { ImagePipeline } from '../ports/image-pipeline';

const ADAPTERS: readonly [string, () => ImagePipeline][] = [
  ['makeNextImagePipeline', () => makeNextImagePipeline()],
  ['makeInMemoryImagePipeline', () => makeInMemoryImagePipeline()],
];

describe.each(ADAPTERS)('ImagePipeline contract — %s', (_name, makePipeline) => {
  it('echoes the src verbatim', () => {
    const pipeline = makePipeline();
    const out = pipeline.resolve({ src: '/static/hero.jpg', alt: 'Hero image' });
    expect(out.src).toBe('/static/hero.jpg');
  });

  it('echoes the alt verbatim', () => {
    const pipeline = makePipeline();
    const out = pipeline.resolve({ src: '/x.jpg', alt: 'Specific alt text' });
    expect(out.alt).toBe('Specific alt text');
  });

  it('accepts empty alt for decorative images', () => {
    const pipeline = makePipeline();
    const out = pipeline.resolve({ src: '/decorative.jpg', alt: '' });
    expect(out.alt).toBe('');
  });

  it('leaves width + height undefined when omitted (NOT 0 — defeats the fill-vs-sized invariant)', () => {
    const pipeline = makePipeline();
    const out = pipeline.resolve({ src: '/x.jpg', alt: 'x' });
    expect(out.width).toBeUndefined();
    expect(out.height).toBeUndefined();
  });

  it('passes through explicit dimensions', () => {
    const pipeline = makePipeline();
    const out = pipeline.resolve({ src: '/x.jpg', alt: 'x', width: 320, height: 240 });
    expect(out.width).toBe(320);
    expect(out.height).toBe(240);
  });

  it('defaults preload to false when omitted', () => {
    const pipeline = makePipeline();
    const out = pipeline.resolve({ src: '/x.jpg', alt: 'x' });
    expect(out.preload).toBe(false);
  });

  it('passes through preload: true (LCP candidate)', () => {
    const pipeline = makePipeline();
    const out = pipeline.resolve({ src: '/x.jpg', alt: 'x', preload: true });
    expect(out.preload).toBe(true);
  });

  it('passes through quality when supplied', () => {
    const pipeline = makePipeline();
    const out = pipeline.resolve({ src: '/x.jpg', alt: 'x', quality: 85 });
    expect(out.quality).toBe(85);
  });

  it('leaves quality undefined when omitted (renderer applies its own default)', () => {
    const pipeline = makePipeline();
    const out = pipeline.resolve({ src: '/x.jpg', alt: 'x' });
    expect(out.quality).toBeUndefined();
  });

  it('passes sizes through to the resolver', () => {
    const pipeline = makePipeline();
    const out = pipeline.resolve({ src: '/x.jpg', alt: 'x', sizes: '(min-width: 768px) 50vw' });
    expect(out.sizes).toBe('(min-width: 768px) 50vw');
  });

  it('passes className through', () => {
    const pipeline = makePipeline();
    const out = pipeline.resolve({ src: '/x.jpg', alt: 'x', className: 'rounded-full' });
    expect(out.className).toBe('rounded-full');
  });
});

describe('makeNextImagePipeline — adapter-specific behavior', () => {
  it('applies defaultSizes when the caller omits sizes', () => {
    const pipeline = makeNextImagePipeline({ defaultSizes: '100vw' });
    const out = pipeline.resolve({ src: '/x.jpg', alt: 'x' });
    expect(out.sizes).toBe('100vw');
  });

  it('caller-supplied sizes overrides defaultSizes', () => {
    const pipeline = makeNextImagePipeline({ defaultSizes: '100vw' });
    const out = pipeline.resolve({ src: '/x.jpg', alt: 'x', sizes: '50vw' });
    expect(out.sizes).toBe('50vw');
  });
});
