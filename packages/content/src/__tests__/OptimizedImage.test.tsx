/**
 * OptimizedImage render-layer contract.
 *
 * Verifies the component renders an <img> with the expected
 * attributes through both call shapes (sized + fill) using the
 * in-memory ImagePipeline fake. Component-only — `next/image` is
 * exercised transitively but no E2E network call fires.
 */

import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { makeInMemoryImagePipeline } from '../testing/index';
import { OptimizedImage } from '../components/OptimizedImage';

afterEach(() => cleanup());

const pipeline = makeInMemoryImagePipeline();

describe('OptimizedImage — sized branch', () => {
  it('renders an <img> with the supplied alt + dimensions', () => {
    const { container } = render(
      <OptimizedImage
        pipeline={pipeline}
        src="/hero.jpg"
        alt="Person journaling on a couch"
        width={800}
        height={450}
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('Person journaling on a couch');
    expect(img?.getAttribute('width')).toBe('800');
    expect(img?.getAttribute('height')).toBe('450');
  });

  it('accepts an empty alt for decorative images', () => {
    const { container } = render(
      <OptimizedImage pipeline={pipeline} src="/decorative.jpg" alt="" width={32} height={32} />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('throws an explicit invariant when width is NaN (Number.isFinite guard)', () => {
    // NaN <= 0 is false in JS — a naive guard would let NaN slip
    // through and reach next/image with a non-actionable error.
    const bypass = { width: Number.NaN, height: 100 } as unknown as {
      width: number;
      height: number;
    };
    expect(() =>
      render(<OptimizedImage pipeline={pipeline} src="/x.jpg" alt="x" {...bypass} />),
    ).toThrow(/must be positive finite integers/);
  });

  it('throws an explicit invariant when width is zero (sized branch)', () => {
    // The TS type rejects {width: 0} statically; the runtime guard
    // catches a dynamic construction that bypasses the type check.
    // Cast to a partial-prop shape so the test exercises the runtime
    // path, not the TS prop check.
    const bypass = { width: 0, height: 100 } as unknown as { width: number; height: number };
    expect(() =>
      render(<OptimizedImage pipeline={pipeline} src="/x.jpg" alt="x" {...bypass} />),
    ).toThrow(/width \+ height must be positive/);
  });
});

describe('OptimizedImage — fill branch', () => {
  it('renders without explicit width/height attributes', () => {
    const { container } = render(
      <div style={{ position: 'relative', width: 200, height: 200 }}>
        <OptimizedImage pipeline={pipeline} src="/bg.jpg" alt="Background" fill />
      </div>,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('Background');
    // Next.js's fill mode injects its own width/height-via-style;
    // the explicit width/height HTML attributes are absent.
    expect(img?.hasAttribute('width')).toBe(false);
    expect(img?.hasAttribute('height')).toBe(false);
  });
});
